import { app } from 'electron';
import { createWriteStream } from 'fs';
import { promises as fsp, existsSync } from 'fs';
import { join } from 'path';
import log from 'electron-log';
import { getMainWindow } from '../window';
import { getMainAppSettings } from '../storage/settings';
import {
  sniffAudioFormat,
  isEncryptedFormat,
  decryptEncryptedAudio,
  type AudioFormat,
} from './decrypt';

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'decrypting'
  | 'done'
  | 'error'
  | 'canceled';

export interface DownloadTask {
  id: string;
  url: string;
  hash: string;
  songName: string;
  artist: string;
  album: string;
  quality: string;
  saveDir: string;
  filePath: string;
  filename: string;
  lrcContent?: string;
  coverUrl?: string;
  /** 选择的音效（none/piano/vocal/...），人声/伴奏的 mkv 需要它选轨 */
  effect?: string;
  total: number;
  received: number;
  status: DownloadStatus;
  format: AudioFormat | null;
  error: string;
  createdAt: number;
  finishedAt: number;
}

const MAX_CONCURRENT = 3;
const PROGRESS_INTERVAL = 400;

const tasks = new Map<string, DownloadTask>();
const queue: string[] = [];
const controllers = new Map<string, AbortController>();
const running = new Set<string>();
const decryptChain: Promise<unknown> = Promise.resolve();

let counter = 0;
const nextId = () => `dl_${Date.now().toString(36)}_${(counter++).toString(36)}`;

const emit = (payload: DownloadTask) => {
  try {
    getMainWindow()?.webContents.send('download:update', payload);
  } catch {
    // 主窗口可能已关闭
  }
};

const sanitizeName = (value: string): string =>
  value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

const ensureSaveDir = (dir: string): string => {
  try {
    if (!existsSync(dir)) void fsp.mkdir(dir, { recursive: true });
  } catch {
    // 目录创建失败在写文件时会再暴露
  }
  return dir;
};

export const getDefaultSaveDir = (): string => {
  const configured = getMainAppSettings().downloadSaveDir?.trim();
  if (configured) return ensureSaveDir(configured);
  return ensureSaveDir(join(app.getPath('downloads'), '酷狗概念版'));
};

/** 解密是 CPU 密集操作，串行化避免多任务并发时内存峰值叠加。 */
const runExclusive = <T>(job: () => Promise<T>): Promise<T> => {
  const run = decryptChain.then(job, job);
  // 链上消费掉错误，避免后续任务被跳过
  decryptChain.catch(() => undefined);
  return run;
};

/** 避免重名覆盖：同名时追加 (1)/(2)… */
const resolveConflict = (filePath: string): string => {
  if (!existsSync(filePath)) return filePath;
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  const base = filePath.slice(0, filePath.length - ext.length);
  let n = 1;
  let candidate = `${base} (${n})${ext}`;
  while (existsSync(candidate)) candidate = `${base} (${++n})${ext}`;
  return candidate;
};

async function executeTask(task: DownloadTask, signal: AbortSignal): Promise<void> {
  task.status = 'downloading';
  emit(task);

  const tempPath = join(task.saveDir, `${task.hash || task.id}.part`);
  const response = await fetch(task.url, {
    headers: { Range: 'bytes=0-' },
    signal,
  });
  if (!response.ok && response.status !== 206) {
    throw new Error(`下载失败 (HTTP ${response.status})`);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (response.status === 206) {
    const range = response.headers.get('content-range') || '';
    task.total = Number(range.split('/')[1] || 0) || contentLength;
  } else {
    task.total = contentLength;
  }

  const stream = createWriteStream(tempPath);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('响应无内容');

  let lastNotify = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal.aborted) {
        await reader.cancel();
        throw new Error('已取消');
      }
      if (!stream.write(value)) {
        await new Promise<void>((resolve) => stream.once('drain', resolve));
      }
      task.received += value.length;
      const now = Date.now();
      if (now - lastNotify > PROGRESS_INTERVAL) {
        lastNotify = now;
        emit(task);
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      stream.end(() => resolve());
      stream.on('error', reject);
    });
  }

  if (task.received === 0) throw new Error('下载内容为空');

  // 探测格式：URL 后缀不可信（常见 .mp3 实为 flac）
  const fileData = await fsp.readFile(tempPath);
  if (fileData.length < 16) throw new Error('文件过短，无法识别');
  let format = sniffAudioFormat(fileData.subarray(0, 16));
  task.format = format;

  let finalData: Uint8Array = fileData;
  if (isEncryptedFormat(format)) {
    task.status = 'decrypting';
    emit(task);
    log.info(`[Download] 检测到 ${format.toUpperCase()} 加密流，开始解密: ${task.songName}`);
    finalData = await runExclusive(async () => {
      const result = await decryptEncryptedAudio(fileData, format as 'kgm' | 'vpr');
      return result.data;
    });
    const sniffed = sniffAudioFormat(finalData.subarray(0, 16));
    if (sniffed !== 'kgm' && sniffed !== 'vpr' && sniffed !== 'unknown') {
      format = sniffed;
      task.format = sniffed;
    }
  }

  if (format === 'kgm' || format === 'vpr' || format === 'unknown') {
    // 解密后仍无法识别：按预期扩展名落盘，保留原始内容供用户检查
    log.warn(`[Download] 解密后未识别出有效音频头部，按 ${format} 兜底落盘: ${task.songName}`);
    format = format === 'vpr' ? 'mp3' : 'flac';
  }

  // 酷狗的 title/name 字段本身常是「歌手 - 歌名」或「歌名 - 歌手」格式，与 artist
  // 拼接会重复。落盘前把与 artist 重复的前缀/后缀剥掉
  // （精确匹配 + 忽略空格/下划线/大小写差异的宽松匹配）。
  const collapseName = (name: string, artist?: string): string => {
    const trimmed = (name || '').trim();
    const a = (artist || '').trim();
    if (!trimmed || !a) return trimmed;
    if (trimmed.startsWith(`${a} - `)) return trimmed.slice(a.length + 3).trim();
    if (trimmed.endsWith(` - ${a}`)) return trimmed.slice(0, trimmed.length - a.length - 3).trim();
    const squashed = (v: string) => v.replace(/[\s_]+/g, '').toLowerCase();
    if (squashed(a)) {
      const prefix = trimmed.match(/^([^-]{1,80}?)\s*-\s*(.+)$/);
      if (prefix && squashed(prefix[1]) === squashed(a)) return prefix[2].trim();
      const suffix = trimmed.match(/^(.+?)\s*-\s*([^-]{1,80})$/);
      if (suffix && squashed(suffix[2]) === squashed(a)) return suffix[1].trim();
    }
    return trimmed;
  };
  const songTitle = collapseName(task.songName, task.artist) || task.songName || task.hash;
  // 命名格式：「歌名 - 歌手」
  const baseName = sanitizeName(
    task.artist && task.artist.trim() !== songTitle ? `${songTitle} - ${task.artist}` : songTitle,
  );
  const ext = format === 'unknown' ? 'bin' : format;
  task.filePath = resolveConflict(join(task.saveDir, `${baseName}.${ext}`));
  task.filename = task.filePath.slice(task.filePath.lastIndexOf('\\') + 1).split('\\').pop() || '';

  await fsp.writeFile(task.filePath, finalData);
  await fsp.unlink(tempPath).catch(() => undefined);

  // 附加文件：歌词 / 封面（失败不影响音频任务状态）
  if (task.lrcContent?.trim()) {
    const lrcPath = resolveConflict(join(task.saveDir, `${baseName}.lrc`));
    await fsp.writeFile(lrcPath, task.lrcContent, 'utf8').catch((error: unknown) => {
      log.warn(`[Download] 歌词写入失败: ${error instanceof Error ? error.message : error}`);
    });
  }
  if (task.coverUrl) {
    try {
      const coverRes = await fetch(task.coverUrl, { signal });
      if (coverRes.ok) {
        const buf = new Uint8Array(await coverRes.arrayBuffer());
        if (buf.length > 0) {
          const type = (coverRes.headers.get('content-type') || '').split('/')[1] || 'jpg';
          const ext = type.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
          const coverPath = resolveConflict(join(task.saveDir, `${baseName}.${ext}`));
          await fsp.writeFile(coverPath, buf);
        }
      } else {
        log.warn(`[Download] 封面下载失败 (HTTP ${coverRes.status})`);
      }
    } catch (error) {
      if (!signal.aborted) {
        log.warn(`[Download] 封面下载失败: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  task.status = 'done';
  task.finishedAt = Date.now();
  emit(task);
  log.info(`[Download] 完成: ${task.filePath}`);
}

const pumpQueue = () => {
  while (running.size < MAX_CONCURRENT && queue.length > 0) {
    const id = queue.shift()!;
    const task = tasks.get(id);
    if (!task || task.status !== 'queued') continue;
    const controller = new AbortController();
    controllers.set(id, controller);
    running.add(id);
    executeTask(task, controller.signal)
      .catch((error: unknown) => {
        if (task.status === 'canceled') {
          // 用户取消，清理半成品
          fsp.unlink(join(task.saveDir, `${task.hash || task.id}.part`)).catch(() => undefined);
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        task.status = 'error';
        task.error = message;
        task.finishedAt = Date.now();
        emit(task);
        log.warn(`[Download] 失败: ${task.songName} → ${message}`);
      })
      .finally(() => {
        running.delete(id);
        controllers.delete(id);
        pumpQueue();
      });
  }
};

export function addDownload(params: {
  url: string;
  hash: string;
  songName: string;
  artist?: string;
  album?: string;
  quality?: string;
  saveDir?: string;
  lrcContent?: string;
  coverUrl?: string;
  effect?: string;
}): DownloadTask {
  const existing = Array.from(tasks.values()).find(
    (t) => t.hash === params.hash && t.quality === (params.quality || '') &&
      (t.status === 'queued' || t.status === 'downloading' || t.status === 'decrypting'),
  );
  if (existing) return existing;

  const task: DownloadTask = {
    id: nextId(),
    url: params.url,
    hash: params.hash,
    songName: sanitizeName(params.songName || params.hash),
    artist: sanitizeName(params.artist || ''),
    album: sanitizeName(params.album || ''),
    quality: params.quality || '',
    saveDir: ensureSaveDir(params.saveDir || getDefaultSaveDir()),
    filePath: '',
    filename: '',
    lrcContent: params.lrcContent || undefined,
    coverUrl: params.coverUrl || undefined,
    effect: params.effect || undefined,
    total: 0,
    received: 0,
    status: 'queued',
    format: null,
    error: '',
    createdAt: Date.now(),
    finishedAt: 0,
  };
  tasks.set(task.id, task);
  queue.push(task.id);
  emit(task);
  pumpQueue();
  return task;
}

export function cancelDownload(id: string): boolean {
  const task = tasks.get(id);
  if (!task) return false;
  if (task.status === 'queued') {
    const index = queue.indexOf(id);
    if (index >= 0) queue.splice(index, 1);
    task.status = 'canceled';
    task.finishedAt = Date.now();
    emit(task);
    return true;
  }
  if (task.status === 'downloading' || task.status === 'decrypting') {
    task.status = 'canceled';
    task.finishedAt = Date.now();
    controllers.get(id)?.abort();
    emit(task);
    return true;
  }
  return false;
}

export function listDownloads(): DownloadTask[] {
  return Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function openDownloadFile(id: string): boolean {
  const task = tasks.get(id);
  return Boolean(task?.filePath && existsSync(task.filePath));
}
