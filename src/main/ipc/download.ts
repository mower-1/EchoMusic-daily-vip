import { shell } from 'electron';
import { ipcRegistry } from './registry';
import { showOpenDialogSafely } from './dialogHost';
import { addDownload, cancelDownload, listDownloads, getDefaultSaveDir } from '../download/manager';
import { setMainAppSetting } from '../storage/settings';

export interface DownloadStartParams {
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
}

export function registerDownloadHandlers(): void {
  ipcRegistry.registerHandler('download:start', (_event, params: DownloadStartParams) => {
    if (!params?.url || !params?.hash) {
      throw new Error('缺少下载地址或歌曲标识');
    }
    return addDownload({
      url: params.url,
      hash: params.hash,
      songName: params.songName || params.hash,
      artist: params.artist,
      album: params.album,
      quality: params.quality,
      saveDir: params.saveDir,
      lrcContent: params.lrcContent,
      coverUrl: params.coverUrl,
      effect: params.effect,
    });
  });

  ipcRegistry.registerHandler('download:cancel', (_event, id: string) => cancelDownload(id));

  ipcRegistry.registerHandler('download:list', () => listDownloads());

  ipcRegistry.registerHandler('download:get-dir', () => getDefaultSaveDir());

  ipcRegistry.registerHandler('download:choose-dir', async () => {
    const result = await showOpenDialogSafely({
      title: '选择缓存目录',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const dir = result.filePaths[0];
    setMainAppSetting('downloadSaveDir', dir);
    return dir;
  });

  ipcRegistry.registerHandler('download:reveal', (_event, id: string) => {
    const task = listDownloads().find((t) => t.id === id);
    if (task?.filePath) {
      shell.showItemInFolder(task.filePath);
      return true;
    }
    return false;
  });
}
