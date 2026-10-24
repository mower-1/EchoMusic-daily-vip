<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useToastStore } from '@/stores/toast';
import Button from '@/components/ui/Button.vue';
import SettingsSectionShell from './SettingsSectionShell.vue';
import { sectionTitles } from '../constants';

const toastStore = useToastStore();
const saveDir = ref('');
const isChoosing = ref(false);

const refreshDir = async () => {
  saveDir.value = await window.electron.ipcRenderer.invoke('download:get-dir');
};

const chooseDir = async () => {
  if (isChoosing.value) return;
  isChoosing.value = true;
  try {
    const dir = await window.electron.ipcRenderer.invoke('download:choose-dir');
    if (dir) {
      saveDir.value = dir;
      toastStore.show('缓存目录已更新，之后的缓存将保存到新位置', 'success');
    }
  } catch {
    toastStore.actionFailed('修改缓存目录');
  } finally {
    isChoosing.value = false;
  }
};

onMounted(refreshDir);
</script>

<template>
  <SettingsSectionShell id="cache" :title="sectionTitles.cache.label">
    <template #icon>
      <Icon
        v-if="sectionTitles.cache.icon"
        :icon="sectionTitles.cache.icon"
        width="20"
        height="20"
        class="text-primary-text"
      />
    </template>

    <div class="cache-dir-row">
      <div class="dir-info">
        <p class="dir-label">缓存保存位置</p>
        <p class="dir-value" :title="saveDir">{{ saveDir || '（默认：系统下载目录\\酷狗概念版）' }}</p>
      </div>
      <Button variant="default" :disabled="isChoosing" @click="chooseDir">更改目录…</Button>
    </div>
    <p class="cache-note">更改后立即生效，已缓存的文件不会移动。右键歌曲选择「缓存」即可把音乐保存到该目录。</p>
  </SettingsSectionShell>
</template>

<style scoped>
.cache-dir-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-radius: 10px;
  background: color-mix(in srgb, currentColor 5%, transparent);
}

.dir-label {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
}

.dir-value {
  margin: 2px 0 0;
  font-size: 12px;
  opacity: 0.65;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 480px;
}

.cache-note {
  margin: 10px 2px 0;
  font-size: 12px;
  opacity: 0.55;
}
</style>
