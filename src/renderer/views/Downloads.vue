<template>
  <div class="downloads-page">
    <header class="page-header">
      <h2>缓存管理</h2>
      <p class="save-dir">保存到：{{ saveDir }}</p>
    </header>

    <div v-if="!tasks.length" class="empty">还没有缓存内容</div>

    <ul v-else class="task-list">
      <li v-for="task in tasks" :key="task.id" class="task-item" :class="{ playing: playingId === task.id }">
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
          <div
            v-if="playingId === task.id"
            class="play-panel"
          >
            <div
              class="progress-track play-seek"
              @pointerdown="onSeekPointerDown"
              @pointermove="onSeekPointerMove"
              @pointerup="onSeekPointerUp"
            >
              <div class="progress-fill seek-fill" :style="{ width: playPercent + '%' }"></div>
            </div>
            <div class="time-row">
              <span>{{ formatTime(playState.currentTime) }}</span>
              <span>{{ formatTime(playState.duration) }}</span>
            </div>
          </div>
          <div v-if="task.error" class="task-error">{{ task.error }}</div>
        </div>
        <div class="task-actions">
          <button
            v-if="canPlay(task)"
            type="button"
            class="action-btn play-btn"
            @click="togglePlay(task)"
          >
            {{ playingId === task.id && !isPaused ? '⏸ 暂停' : '▶ 播放' }}
          </button>
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
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useDownloadStore } from '@/stores/download';
import type { DownloadTaskView } from '@/api/download';

const downloadStore = useDownloadStore();
const tasks = computed(() => downloadStore.tasks);
const saveDir = ref('');

const taskTitle = (task: DownloadTaskView) =>
  task.filename || (task.artist ? `${task.songName} - ${task.artist}` : task.songName);

const qualityLabel = (quality: string) => {
  const map: Record<string, string> = {
    '': '标准',
    '128': '标准',
    '320': 'HQ',
    flac: 'SQ',
    high: 'Hi-Res',
    super: 'Super',
    acappella: '人声/伴奏',
    piano: '钢琴',
    subwoofer: '骨笛',
    ancient: '尤克里里',
    surnay: '唢呐',
    dj: 'DJ',
  };
  return map[quality] || quality.toUpperCase();
};

const statusText = (task: DownloadTaskView) => {
  switch (task.status) {
    case 'queued':
      return '排队中';
    case 'downloading':
      return task.total > 0
        ? `缓存中 ${formatSize(task.received)} / ${formatSize(task.total)}`
        : `缓存中 ${formatSize(task.received)}`;
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
  if (playingId.value === id) stopPlayback();
  downloadStore.tasks = downloadStore.tasks.filter((t) => t.id !== id);
};

// --- 本地试听（file:// 直读，不影响主播放器状态） ---
let audio: HTMLAudioElement | null = null;
const playingId = ref<string | null>(null);
const isPaused = ref(false);
const playState = reactive({ currentTime: 0, duration: 0 });
let seekPointerId: number | null = null;

/** Windows 路径 → file:// URL（中文/空格安全编码） */
const toFileUrl = (path: string) =>
  encodeURI('file:///' + path.replace(/\\/g, '/').replace(/^\/+/, ''));

const canPlay = (task: DownloadTaskView) =>
  task.status === 'done' && Boolean(task.filePath) && task.format !== 'mkv' && task.format !== 'kgm' && task.format !== 'vpr';

const stopPlayback = () => {
  if (audio) {
    audio.pause();
    audio.src = '';
    audio = null;
  }
  playingId.value = null;
  isPaused.value = false;
  playState.currentTime = 0;
  playState.duration = 0;
  seekPointerId = null;
};

const togglePlay = (task: DownloadTaskView) => {
  // 同一条目：暂停 ↔ 续播
  if (playingId.value === task.id && audio) {
    if (audio.paused) {
      void audio.play().catch(() => stopPlayback());
      isPaused.value = false;
    } else {
      audio.pause();
      isPaused.value = true;
    }
    return;
  }
  stopPlayback();
  audio = new Audio(toFileUrl(task.filePath));
  audio.volume = 0.9;
  audio.ontimeupdate = () => {
    if (audio && !Number.isNaN(audio.duration)) {
      playState.currentTime = audio.currentTime;
      playState.duration = audio.duration || 0;
    }
  };
  audio.onended = stopPlayback;
  audio.onerror = () => {
    stopPlayback();
  };
  playingId.value = task.id;
  isPaused.value = false;
  void audio.play().catch(() => stopPlayback());
};

const playPercent = computed(() =>
  playState.duration > 0 ? Math.min(100, (playState.currentTime / playState.duration) * 100) : 0,
);

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// --- 进度条拖动 ---
const seekTo = (event: PointerEvent, track: HTMLElement) => {
  if (!audio || !playState.duration) return;
  const rect = track.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  audio.currentTime = ratio * playState.duration;
  playState.currentTime = audio.currentTime;
};

const onSeekPointerDown = (event: PointerEvent) => {
  const track = event.currentTarget as HTMLElement;
  seekPointerId = event.pointerId;
  track.setPointerCapture(event.pointerId);
  seekTo(event, track);
};

const onSeekPointerMove = (event: PointerEvent) => {
  if (seekPointerId !== event.pointerId) return;
  seekTo(event, event.currentTarget as HTMLElement);
};

const onSeekPointerUp = (event: PointerEvent) => {
  if (seekPointerId === event.pointerId) seekPointerId = null;
};

onUnmounted(stopPlayback);

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

.task-item.playing {
  background: var(--color-primary-light, rgba(0, 204, 101, 0.15));
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

.play-progress {
  transition: none;
}

.play-panel {
  margin-top: 8px;
}

.progress-track.play-seek {
  height: 6px;
  cursor: pointer;
  touch-action: none;
}

.progress-fill.seek-fill {
  transition: none;
}

.time-row {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
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

.action-btn.play-btn {
  background: var(--color-primary, #00cc65);
  color: var(--color-on-primary, #000);
}

.action-btn.play-btn:hover {
  background: var(--color-primary-hover, var(--color-primary, #00cc65));
}

.action-btn.danger {
  color: #e5544b;
}
</style>
