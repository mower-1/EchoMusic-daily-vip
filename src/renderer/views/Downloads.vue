<template>
  <div class="downloads-page">
    <header class="page-header">
      <h2>下载管理</h2>
      <p class="save-dir">保存到：{{ saveDir }}</p>
    </header>

    <div v-if="!tasks.length" class="empty">还没有下载任务</div>

    <ul v-else class="task-list">
      <li v-for="task in tasks" :key="task.id" class="task-item">
        <div class="task-main">
          <div class="task-title" :title="taskTitle(task)">
            {{ taskTitle(task) }}
          </div>
          <div class="task-meta">
            <span class="quality" v-if="task.quality">{{ qualityLabel(task.quality) }}</span>
            <span v-if="task.format" class="format">{{ task.format.toUpperCase() }}</span>
            <span class="status-text">{{ statusText(task) }}</span>
          </div>
          <div
            v-if="task.status === 'downloading' || task.status === 'decrypting' || task.status === 'queued'"
            class="progress-track"
          >
            <div class="progress-fill" :style="{ width: progressPercent(task) + '%' }"></div>
          </div>
          <div v-if="task.error" class="task-error">{{ task.error }}</div>
        </div>
        <div class="task-actions">
          <button
            v-if="task.status === 'queued' || task.status === 'downloading' || task.status === 'decrypting'"
            type="button"
            class="action-btn"
            @click="downloadStore.cancel(task.id)"
          >
            取消
          </button>
          <button
            v-if="task.status === 'done'"
            type="button"
            class="action-btn"
            @click="downloadStore.reveal(task.id)"
          >
            打开所在文件夹
          </button>
          <button
            v-if="task.status === 'error' || task.status === 'canceled'"
            type="button"
            class="action-btn danger"
            @click="removeTask(task.id)"
          >
            移除
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useDownloadStore } from '@/stores/download';
import type { DownloadTaskView } from '@/api/download';

const downloadStore = useDownloadStore();
const tasks = computed(() => downloadStore.tasks);
const saveDir = ref('');

const taskTitle = (task: DownloadTaskView) =>
  task.artist ? `${task.artist} - ${task.songName}` : task.songName;

const qualityLabel = (quality: string) => {
  const map: Record<string, string> = {
    '': '标准',
    '128': '标准',
    '320': 'HQ',
    flac: 'SQ',
    high: 'Hi-Res',
    super: 'Super',
  };
  return map[quality] || quality.toUpperCase();
};

const statusText = (task: DownloadTaskView) => {
  switch (task.status) {
    case 'queued':
      return '排队中';
    case 'downloading':
      return task.total > 0
        ? `下载中 ${formatSize(task.received)} / ${formatSize(task.total)}`
        : `下载中 ${formatSize(task.received)}`;
    case 'decrypting':
      return '解密中…';
    case 'done':
      return `已完成 · ${formatSize(task.total || task.received)}`;
    case 'error':
      return '失败';
    case 'canceled':
      return '已取消';
    default:
      return '';
  }
};

const progressPercent = (task: DownloadTaskView) => {
  if (!task.total) return task.status === 'done' ? 100 : 0;
  return Math.min(100, Math.round((task.received / task.total) * 100));
};

const formatSize = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
};

const removeTask = (id: string) => {
  downloadStore.tasks = downloadStore.tasks.filter((t) => t.id !== id);
};

onMounted(async () => {
  await downloadStore.refresh();
  saveDir.value = await window.electron.ipcRenderer.invoke('download:get-dir');
});
</script>

<style scoped>
.downloads-page {
  padding: 24px 32px;
  height: 100%;
  overflow-y: auto;
}

.page-header h2 {
  margin: 0 0 4px;
  font-size: 20px;
}

.save-dir {
  margin: 0 0 20px;
  font-size: 12px;
  opacity: 0.6;
}

.empty {
  padding: 60px 0;
  text-align: center;
  opacity: 0.5;
}

.task-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-radius: 10px;
  background: color-mix(in srgb, currentColor 5%, transparent);
}

.task-main {
  flex: 1;
  min-width: 0;
}

.task-title {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-meta {
  display: flex;
  gap: 10px;
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.65;
}

.quality,
.format {
  padding: 0 5px;
  border-radius: 4px;
  border: 1px solid currentColor;
  font-size: 10px;
  line-height: 16px;
}

.progress-track {
  margin-top: 8px;
  height: 4px;
  border-radius: 2px;
  background: color-mix(in srgb, currentColor 12%, transparent);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--color-primary, #3d8bff);
  transition: width 0.3s ease;
}

.task-error {
  margin-top: 4px;
  font-size: 12px;
  color: #e5544b;
}

.task-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.action-btn {
  padding: 5px 12px;
  border: none;
  border-radius: 6px;
  background: color-mix(in srgb, currentColor 10%, transparent);
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.action-btn:hover {
  background: color-mix(in srgb, currentColor 18%, transparent);
}

.action-btn.danger {
  color: #e5544b;
}
</style>
