import log from 'electron-log';

/**
 * 音频格式探测与 KGM/VPR 解密。
 *
 * KGM 是「等长逐字节替换」混淆：头部 0x10 处的 header_length 之后才是加密音频，
 * 解密只依赖文件内 own_key（0x1C 起 17 字节）与固定混淆表，天然支持分块流式处理。
 * 解密实现复用 @xhacker/kgmwasm（unlock-music 的 wasm 版本），常量表内嵌在模块里。
 */

const KGM_MAGIC = [
  0x7c, 0xd5, 0x32, 0xeb, 0x86, 0x02, 0x7f, 0x4b,
  0xa8, 0xaf, 0xa6, 0x8e, 0x0f, 0xff, 0x99, 0x14,
];
const VPR_MAGIC = [
  0x05, 0x28, 0xbc, 0x96, 0xe9, 0xe4, 0x5a, 0x43,
  0x91, 0xaa, 0xbd, 0xd0, 0x7a, 0xf5, 0x36, 0x31,
];

export type AudioFormat =
  | 'mp3'
  | 'flac'
  | 'ogg'
  | 'm4a'
  | 'wav'
  | 'ape'
  | 'mkv'
  | 'kgm'
  | 'vpr'
  | 'unknown';

const matchesMagic = (head: Uint8Array, magic: number[]): boolean =>
  magic.every((byte, index) => head[index] === byte);

/** 根据文件头部字节判断格式；head 需要至少 16 字节。 */
export function sniffAudioFormat(head: Uint8Array): AudioFormat {
  if (head.length < 4) return 'unknown';
  if (matchesMagic(head, KGM_MAGIC)) return 'kgm';
  if (matchesMagic(head, VPR_MAGIC)) return 'vpr';
  // ID3v2 标签
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return 'mp3';
  // fLaC
  if (head[0] === 0x66 && head[1] === 0x4c && head[2] === 0x61 && head[3] === 0x43) return 'flac';
  // OggS
  if (head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) return 'ogg';
  // ISO-BMFF (m4a)
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) return 'm4a';
  // MPEG 帧同步（0xFFEx/0xFFFx）
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return 'mp3';
  // RIFF/WAV
  if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46) return 'wav';
  // Monkey's Audio
  if (head[0] === 0x4d && head[1] === 0x41 && head[2] === 0x43 && head[3] === 0x20) return 'ape';
  // EBML (Matroska/WebM，人声伴奏分离等音效流)
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'mkv';
  return 'unknown';
}

export function isEncryptedFormat(format: AudioFormat): boolean {
  return format === 'kgm' || format === 'vpr';
}

// --- KGM/VPR 解密（wasm 惰性加载） ---

interface KgmCryptoInstance {
  _malloc(size: number): number;
  _free(ptr: number): void;
  writeArrayToMemory(data: Uint8Array, ptr: number): void;
  preDec(ptr: number, size: number, ext: string): number;
  decBlob(ptr: number, size: number, offset: number): void;
  HEAPU8: Uint8Array;
}

// KgmLegacy 把 wasm 以 base64 内嵌进 JS，打包后无需携带额外资源文件。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const loadKgmModule = (): Promise<KgmCryptoInstance> =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@xhacker/kgmwasm/KgmLegacy.js')() as Promise<KgmCryptoInstance>;

let modulePromise: Promise<KgmCryptoInstance> | null = null;

const getKgmInstance = (): Promise<KgmCryptoInstance> => {
  if (!modulePromise) {
    modulePromise = loadKgmModule().catch((error) => {
      modulePromise = null;
      throw error;
    });
  }
  return modulePromise;
};

const DECRYPT_CHUNK = 2 * 1024 * 1024;

export interface DecryptedResult {
  data: Uint8Array;
  format: AudioFormat;
}

/**
 * 解密一段 KGM/VPR 数据，返回明文音频。
 * 输入需从文件头开始（包含 magic 与 own_key）。
 */
export async function decryptEncryptedAudio(
  data: Uint8Array,
  format: 'kgm' | 'vpr',
): Promise<DecryptedResult> {
  if (data.length < 0x40) throw new Error('KGM 文件过短，无法解析');

  const headerLen = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(
    0x10,
    true,
  );
  if (!headerLen || headerLen >= data.length) {
    throw new Error(`KGM 头部长度异常: ${headerLen}`);
  }
  const audio = data.subarray(headerLen);

  let instance: KgmCryptoInstance;
  try {
    instance = await getKgmInstance();
  } catch (error) {
    log.error('[Download] KGM 解密模块加载失败:', error);
    throw new Error('解密模块初始化失败');
  }

  // own_key：0x1C 起 16 字节 + 补零到 17 字节
  const key = new Uint8Array(17);
  key.set(data.subarray(0x1c, Math.min(0x2c, data.length)), 0);

  const out = new Uint8Array(audio.length);
  const ptr = instance._malloc(DECRYPT_CHUNK);
  try {
    let offset = 0;
    while (offset < audio.length) {
      const size = Math.min(DECRYPT_CHUNK, audio.length - offset);
      instance.writeArrayToMemory(audio.subarray(offset, offset + size), ptr);
      instance.decBlob(ptr, size, offset);
      out.set(instance.HEAPU8.subarray(ptr, ptr + size), offset);
      offset += size;
    }
  } finally {
    instance._free(ptr);
  }

  const sniffed = sniffAudioFormat(out.subarray(0, 16));
  if (sniffed === 'kgm' || sniffed === 'vpr' || sniffed === 'unknown') {
    log.warn(`[Download] KGM 解密后头部仍无法识别（${sniffed}），可能属于不支持的新版本`);
    // 仍然返回结果，由调用方决定是否落盘；文件头未识别时按原始扩展名兜底
    return { data: out, format: sniffed };
  }
  return { data: out, format: sniffed };
}
