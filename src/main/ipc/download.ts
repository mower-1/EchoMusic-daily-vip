import { shell } from 'electron';
import { existsSync } from 'fs';
import { ipcRegistry } from './registry';
import { showOpenDialogSafely } from './dialogHost';
import { addDownload, cancelDownload, listDownloads, getDefaultSaveDir, scanSaveDir, deleteCacheFile } from '../download/manager';
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

  ipcRegistry.registerHandler('download:scan-dir', () => scanSaveDir());

  ipcRegistry.registerHandler('download:delete-file', (_e, filePath: string) =>
    deleteCacheFile(filePath),
  );

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
    // 目录扫描出的历史文件（伪任务 id = 'file:<路径>'）不在会话任务表里，直接按路径处理
    if (typeof id === 'string' && id.startsWith('file:')) {
      const filePath = id.slice('file:'.length);
      if (filePath && existsSync(filePath)) {
        shell.showItemInFolder(filePath);
        return true;
      }
      return false;
    }
    const task = listDownloads().find((t) => t.id === id);
    if (task?.filePath) {
      shell.showItemInFolder(task.filePath);
      return true;
    }
    return false;
  });
}
