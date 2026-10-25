import log from 'electron-log';

/**
 * 音频格式探测。
 *
 * 下载地址的 URL 后缀并不可靠（常见 .mp3 实为 flac），因此下载完成后按文件头
 * 魔数判断真实格式，再决定落盘扩展名。
 *
 * 说明：早期版本曾内置 KGM/VPR 解密（@xhacker/kgmwasm）。实际下载链路拿到的始终是
 * 平台下发的明文直链，该分支从未触发，已移除；将来若遇到加密流，文件头无法识别会
 * 落到 'unknown' 并记录告警。
 */

export type AudioFormat = 'mp3' | 'flac' | 'ogg' | 'm4a' | 'wav' | 'ape' | 'mkv' | 'unknown';

/** 根据文件头部字节判断格式；head 需要至少 16 字节。 */
export function sniffAudioFormat(head: Uint8Array): AudioFormat {
  if (head.length < 4) return 'unknown';
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

/** 无法识别的内容：记录告警，便于排查是否为不支持的容器或加密流。 */
export function warnUnknownFormat(context: string): void {
  log.warn(`[Download] 未识别出有效音频头部（${context}），可能是不支持的容器或加密流`);
}
