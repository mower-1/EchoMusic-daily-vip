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
  { value: 'none', label: '不使用音效' },
  { value: 'piano', label: '钢琴' },
  { value: 'subwoofer', label: '乐器' },
  { value: 'ancient', label: '尤克里里' },
  { value: 'dj', label: 'DJ' },
  { value: 'surnay', label: '唢呐' },
];

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

const isEffectAvailable = (value: string): boolean => {
  if (value === 'none') return true;
  const goods = props.song?.relateGoods ?? [];
  if (!goods.length) return true;
  return goods.some((item) => item.quality === value && item.hash);
};

const hasEffectGoods = computed(() => {
  const goods = props.song?.relateGoods ?? [];
  return goods.length > 0 && goods.some((item) => effectOptions.some((e) => e.value === item.quality));
});

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
  <Dialog v-model:open="open" title="下载选项" showClose>
    <div class="download-options">
      <p class="song-summary">{{ songSummary }}</p>

      <fieldset class="option-group" :disabled="effect !== 'none'">
        <legend>音质<template v-if="effect !== 'none'">（使用音效时按音效档位下载）</template></legend>
        <label v-for="item in qualityOptions" :key="item.value" class="option-row">
          <input
            v-model="quality"
            type="radio"
            name="download-quality"
            :value="item.value"
            :disabled="!isQualityAvailable(item)"
          />
          <span :class="{ unavailable: !isQualityAvailable(item) }">{{ item.label }}</span>
        </label>
      </fieldset>

      <fieldset class="option-group">
        <legend>歌曲音效<template v-if="!hasEffectGoods">（该歌曲可能未提供音效版本）</template></legend>
        <label v-for="item in effectOptions" :key="item.value" class="option-row">
          <input
            v-model="effect"
            type="radio"
            name="download-effect"
            :value="item.value"
            :disabled="!isEffectAvailable(item.value)"
          />
          <span :class="{ unavailable: !isEffectAvailable(item.value) }">{{ item.label }}</span>
        </label>
      </fieldset>

      <fieldset class="option-group">
        <legend>附加内容</legend>
        <div class="option-row">
          <Checkbox v-model="withLyric" aria-label="同时下载歌词" />
          <span>同时下载歌词（.lrc）</span>
        </div>
        <div class="option-row">
          <Checkbox v-model="withCover" aria-label="同时下载封面" />
          <span>同时下载封面图</span>
        </div>
      </fieldset>

      <div class="dialog-footer">
        <Button variant="ghost" @click="emit('update:open', false)">取消</Button>
        <Button variant="primary" @click="confirm">开始下载</Button>
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

.option-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.option-row input[type='radio'] {
  accent-color: var(--color-primary, #3b82f6);
  cursor: pointer;
}

.option-row .unavailable {
  opacity: 0.45;
  text-decoration: line-through;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}
</style>
