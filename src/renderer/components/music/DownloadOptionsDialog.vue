<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useVModel } from '@vueuse/core';
import Dialog from '@/components/ui/Dialog.vue';
import Button from '@/components/ui/Button.vue';
import Checkbox from '@/components/ui/Checkbox.vue';
import { isViperAudioQuality } from '@/utils/song';
import type { Song } from '@/models/song';

export interface DownloadOptions {
  /** 音质：128 / 320 / flac / high */
  quality: string;
  /** 魔法音效：none / piano / subwoofer / ancient / dj / surnay */
  effect: string;
  withLyric: boolean;
  withCover: boolean;
}

interface Props {
  open?: boolean;
  song?: Song | null;
}

const props = withDefaults(defineProps<Props>(), {
  open: false,
  song: null,
});

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'confirm', options: DownloadOptions): void;
}>();

const open = useVModel(props, 'open', emit, { defaultValue: false });

const qualityOptions = [
  { value: '128', label: '标准 128K', level: 0 },
  { value: '320', label: '高品 320K', level: 4 },
  { value: 'flac', label: '无损 FLAC', level: 5 },
  { value: 'high', label: 'Hi-Res', level: 6 },
];

const effectOptions = [
  { value: 'none', label: '原声' },
  { value: 'piano', label: '钢琴' },
  { value: 'vocal', label: '人声' },
  { value: 'accompaniment', label: '伴奏' },
  { value: 'subwoofer', label: '骨笛' },
  { value: 'ancient', label: '尤克里里' },
  { value: 'surnay', label: '唢呐' },
  { value: 'dj', label: 'DJ' },
];

/** 人声/伴奏与播放器一致，走 acappella 分离轨（原始流为 mkv 容器）。 */
const toApiEffect = (value: string): string =>
  value === 'vocal' || value === 'accompaniment' ? 'acappella' : value;

const quality = ref('320');
const effect = ref('none');
const withLyric = ref(true);
const withCover = ref(false);

watch(open, (isOpen) => {
  if (isOpen) {
    // 每次打开重置为「最优可用音质」
    const best = [...qualityOptions].reverse().find((item) => isQualityAvailable(item));
    quality.value = best?.value ?? '128';
    effect.value = 'none';
    withLyric.value = true;
    withCover.value = false;
  }
});

const isQualityAvailable = (option: { value: string; level: number }): boolean => {
  const goods = props.song?.relateGoods ?? [];
  if (!goods.length) return true; // 无能力信息时不设限，失败会提示
  if (option.value === '128') return true;
  return goods.some((item) => {
    const q = String(item.quality ?? '')
      .trim()
      .toLowerCase();
    return !isViperAudioQuality(q) && (item.quality === option.value || item.level === option.level);
  });
};

const isStemEffect = computed(() => effect.value === 'vocal' || effect.value === 'accompaniment');

const songSummary = computed(() => {
  const song = props.song;
  if (!song) return '';
  const artist = song.artist ? ` - ${song.artist}` : '';
  return `${song.title || song.name || song.hash}${artist}`;
});

const confirm = () => {
  emit('confirm', {
    quality: quality.value,
    effect: effect.value,
    withLyric: withLyric.value,
    withCover: withCover.value,
  });
  emit('update:open', false);
};
</script>

<template>
  <Dialog v-model:open="open" title="缓存选项" showClose>
    <div class="download-options">
      <p class="song-summary">{{ songSummary }}</p>

      <fieldset class="option-group" :disabled="effect !== 'none'">
        <legend>音质<template v-if="effect !== 'none'">（使用音效时按音效档位缓存）</template></legend>
        <div class="chip-row">
          <button
            v-for="item in qualityOptions"
            :key="item.value"
            type="button"
            class="option-chip"
            :class="{ selected: quality === item.value, unavailable: !isQualityAvailable(item) }"
            :disabled="!isQualityAvailable(item)"
            :aria-pressed="quality === item.value"
            @click="quality = item.value"
          >
            {{ item.label }}
          </button>
        </div>
      </fieldset>

      <fieldset class="option-group">
        <legend>歌曲音效</legend>
        <div class="chip-row">
          <button
            v-for="item in effectOptions"
            :key="item.value"
            type="button"
            class="option-chip"
            :class="{ selected: effect === item.value }"
            :aria-pressed="effect === item.value"
            @click="effect = item.value"
          >
            {{ item.label }}
          </button>
        </div>
        <p v-if="isStemEffect" class="option-hint">人声/伴奏音效的缓存文件为 .mkv 音轨容器，可用播放器（如 VLC）打开</p>
        <p class="option-hint">音效版本由酷狗按歌曲提供，若所选音效不可用会在缓存时提示</p>
      </fieldset>

      <fieldset class="option-group">
        <legend>附加内容</legend>
        <div class="option-row">
          <Checkbox v-model="withLyric" aria-label="同时缓存歌词" />
          <span>同时缓存歌词（.lrc）</span>
        </div>
        <div class="option-row">
          <Checkbox v-model="withCover" aria-label="同时缓存封面" />
          <span>同时缓存封面图</span>
        </div>
      </fieldset>

      <div class="dialog-footer">
        <Button variant="ghost" @click="emit('update:open', false)">取消</Button>
        <Button variant="primary" @click="confirm">开始缓存</Button>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.download-options {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 320px;
  padding: 4px 2px 2px;
}

.song-summary {
  margin: 0;
  font-size: 13px;
  opacity: 0.75;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-group {
  border: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-group:disabled {
  opacity: 0.55;
}

.option-group legend {
  font-size: 12px;
  font-weight: 600;
  padding: 0;
  margin-bottom: 2px;
  opacity: 0.85;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.option-chip {
  appearance: none;
  border: 1px solid var(--color-border, rgba(128, 128, 128, 0.35));
  background: transparent;
  color: inherit;
  font-size: 13px;
  line-height: 1;
  padding: 7px 14px;
  border-radius: 999px;
  cursor: pointer;
  user-select: none;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
}

.option-chip:hover:not(:disabled):not(.selected) {
  background: var(--control-hover-bg, rgba(128, 128, 128, 0.12));
}

.option-chip.selected {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-on-primary, #fff);
  font-weight: 600;
  box-shadow: 0 0 0 3px var(--color-primary-light, rgba(0, 204, 101, 0.15));
}

.option-chip:disabled {
  cursor: not-allowed;
}

.option-chip.unavailable {
  opacity: 0.4;
  text-decoration: line-through;
}

.option-group:disabled .option-chip:not(.selected) {
  opacity: 0.5;
}

.option-hint {
  margin: 0;
  font-size: 12px;
  opacity: 0.6;
}

.option-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}
</style>
