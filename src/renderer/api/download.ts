export interface DownloadTaskView {
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
  total: number;
  received: number;
  status: 'queued' | 'downloading' | 'decrypting' | 'done' | 'error' | 'canceled';
  format: string | null;
  error: string;
  effect?: string;
  createdAt: number;
  finishedAt: number;
}

export interface DownloadStartParams {
  url: string;
  hash: string;
  songName: string;
  artist?: string;
  album?: string;
  quality?: string;
  saveDir?: string;
  /** 同时保存的歌词内容（LRC 纯文本） */
  lrcContent?: string;
  /** 同时下载的封面图地址 */
  coverUrl?: string;
  /** 选择的音效（人声/伴奏的 mkv 播放需要它选轨） */
  effect?: string;
}

export const startDownload = (params: DownloadStartParams): Promise<DownloadTaskView> =>
  window.electron.ipcRenderer.invoke('download:start', params);

export const cancelDownload = (id: string): Promise<boolean> =>
  window.electron.ipcRenderer.invoke('download:cancel', id);

export const listDownloads = (): Promise<DownloadTaskView[]> =>
  window.electron.ipcRenderer.invoke('download:list');

export interface ScannedCacheFile {
  id: string;
  filename: string;
  songName: string;
  artist: string;
  filePath: string;
  format: string;
  size: number;
  finishedAt: number;
}

/** 扫描缓存目录中已存在的音频文件（本次会话之外产生的也能识别） */
export const scanDownloadDir = (): Promise<ScannedCacheFile[]> =>
  window.electron.ipcRenderer.invoke('download:scan-dir');

export const getDownloadDir = (): Promise<string> =>
  window.electron.ipcRenderer.invoke('download:get-dir');

export const revealDownload = (id: string): Promise<boolean> =>
  window.electron.ipcRenderer.invoke('download:reveal', id);

export const onDownloadUpdate = (listener: (task: DownloadTaskView) => void): (() => void) => {
  // preload 的 ipcRenderer.on 已剥离 event（首参即 task），直接透传即可；
  // d.ts 用的是原生 ipcRenderer 签名，与实际不符，这里仅做类型断言
  const wrapped = listener as unknown as (...args: unknown[]) => void;
  window.electron.ipcRenderer.on('download:update', wrapped);
  return () => window.electron.ipcRenderer.off('download:update', wrapped);
};
