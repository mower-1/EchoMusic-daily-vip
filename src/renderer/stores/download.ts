import { defineStore } from 'pinia';
import {
  cancelDownload,
  listDownloads,
  onDownloadUpdate,
  revealDownload,
  startDownload,
  type DownloadStartParams,
  type DownloadTaskView,
} from '@/api/download';
import { useToastStore } from './toast';

let unsubscribe: (() => void) | null = null;

export const useDownloadStore = defineStore('download', {
  state: () => ({
    tasks: [] as DownloadTaskView[],
    loaded: false,
  }),

  getters: {
    activeCount: (state) =>
      state.tasks.filter((t) => t.status === 'queued' || t.status === 'downloading' || t.status === 'decrypting').length,
    hasActive: (state) => state.tasks.some((t) => t.status === 'queued' || t.status === 'downloading' || t.status === 'decrypting'),
  },

  actions: {
    async ensureLoaded() {
      if (this.loaded) return;
      this.tasks = await listDownloads();
      this.loaded = true;
      this.subscribe();
    },

    /** 静默刷新（进入下载页时调用） */
    async refresh() {
      this.tasks = await listDownloads();
      this.loaded = true;
      this.subscribe();
    },

    subscribe() {
      if (unsubscribe) return;
      unsubscribe = onDownloadUpdate((task) => {
        const index = this.tasks.findIndex((t) => t.id === task.id);
        if (index >= 0) this.tasks.splice(index, 1, task);
        else this.tasks.unshift(task);
      });
    },

    async start(params: DownloadStartParams): Promise<DownloadTaskView | null> {
      const toast = useToastStore();
      try {
        const task = await startDownload(params);
        const index = this.tasks.findIndex((t) => t.id === task.id);
        if (index >= 0) this.tasks.splice(index, 1, task);
        else this.tasks.unshift(task);
        this.subscribe();
        if (task.status === 'done') {
          toast.show(`文件已存在：${task.filename}`, 'success');
        } else {
          toast.show('已加入下载队列', 'success');
        }
        return task;
      } catch (error) {
        toast.show(`下载失败：${error instanceof Error ? error.message : String(error)}`, 'error');
        return null;
      }
    },

    async cancel(id: string) {
      await cancelDownload(id);
    },

    async reveal(id: string) {
      await revealDownload(id);
    },
  },
});
