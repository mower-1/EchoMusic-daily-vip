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
}

export const startDownload = (params: DownloadStartParams): Promise<DownloadTaskView> =>
  window.electron.ipcRenderer.invoke('download:start', params);

export const cancelDownload = (id: string): Promise<boolean> =>
  window.electron.ipcRenderer.invoke('download:cancel', id);

export const listDownloads = (): Promise<DownloadTaskView[]> =>
  window.electron.ipcRenderer.invoke('download:list');

export const getDownloadDir = (): Promise<string> =>
  window.electron.ipcRenderer.invoke('download:get-dir');

export const revealDownload = (id: string): Promise<boolean> =>
  window.electron.ipcRenderer.invoke('download:reveal', id);

export const onDownloadUpdate = (listener: (task: DownloadTaskView) => void): (() => void) => {
  window.electron.ipcRenderer.on('download:update', listener);
  return () => window.electron.ipcRenderer.off('download:update', listener);
};
