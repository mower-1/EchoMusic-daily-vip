<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { useSettingStore } from '@/stores/setting';
import Button from '@/components/ui/Button.vue';
import Switch from '@/components/ui/Switch.vue';
import FontIcon from '@/components/ui/FontIcon.vue';
import { Icon } from '@iconify/vue';
import { iconChevronRight, iconExternalLink } from '@/icons';
import SettingsSectionShell from './SettingsSectionShell.vue';
import { sectionTitles } from '../constants';

const settingStore = useSettingStore();

const versionLabel = computed(() => settingStore.appVersion || '未知');
const releaseChannelLabel = computed(() => (settingStore.isPrerelease ? 'Prerelease' : 'Release'));

// 版本号点击计数器（用于解锁隐藏的每日会员领取功能）
const versionClickCount = ref(0);
const versionToggleLocked = ref(false);
const versionToggleLockTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const targetVersionClicks = 5;
const versionToggleLockMs = 800;

// 礼花效果状态
const showConfetti = ref(false);
const confettiParticles = ref<
  Array<{ id: number; x: number; delay: number; color: string; duration: number }>
>([]);
let confettiId = 0;

const confettiColors = [
  '#ff6b6b',
  '#4ecdc4',
  '#45b7d1',
  '#f9ca24',
  '#6c5ce7',
  '#a29bfe',
  '#fd79a8',
  '#00b894',
];

const lockVersionToggle = () => {
  versionToggleLocked.value = true;
  if (versionToggleLockTimer.value) clearTimeout(versionToggleLockTimer.value);
  versionToggleLockTimer.value = setTimeout(() => {
    versionToggleLocked.value = false;
    versionToggleLockTimer.value = null;
  }, versionToggleLockMs);
};

const triggerConfetti = () => {
  confettiParticles.value = Array.from({ length: 50 }, () => ({
    id: ++confettiId,
    x: Math.random() * 100,
    delay: Math.random() * 0.5,
    color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
    duration: 2 + Math.random(),
  }));
  showConfetti.value = true;

  setTimeout(() => {
    showConfetti.value = false;
    confettiParticles.value = [];
  }, 3000);
};

const handleVersionClick = () => {
  if (versionToggleLocked.value) return;

  versionClickCount.value += 1;
  if (versionClickCount.value < targetVersionClicks) return;

  // 达到目标次数：切换每日会员领取功能
  versionClickCount.value = 0;
  settingStore.setVipClaimEnabled(settingStore.vipClaimEnabled !== true);
  lockVersionToggle();
  triggerConfetti();
};

onUnmounted(() => {
  if (versionToggleLockTimer.value) clearTimeout(versionToggleLockTimer.value);
});

defineProps<{
  isCheckingUpdate: boolean;
  onCheckUpdates: () => void;
  onShowChangelog: () => void;
  onShowDisclaimer: () => void;
}>();
</script>

<template>
  <SettingsSectionShell id="about" :title="sectionTitles.about.label">
    <template #icon>
      <Icon
        v-if="sectionTitles.about.icon"
        :icon="sectionTitles.about.icon"
        width="20"
        height="20"
        class="text-primary-text"
      />
      <FontIcon v-else :size="20" class="text-primary-text" />
    </template>

    <div class="settings-item">
      <div class="space-y-1">
        <h3 class="font-semibold">自动检查更新</h3>
        <p class="text-sm text-text-secondary">启动时自动检查是否有新版本</p>
      </div>
      <Switch v-model="settingStore.autoCheckUpdate" />
    </div>
    <div class="settings-divider"></div>
    <div class="settings-item">
      <div class="space-y-1">
        <h3 class="font-semibold">检查预发布版本</h3>
        <p class="text-sm text-text-secondary">开启后可收到 Alpha/Beta/RC 版本更新推送</p>
      </div>
      <Switch v-model="settingStore.checkPrerelease" />
    </div>
    <div class="settings-divider"></div>
    <div class="settings-item">
      <div class="space-y-1">
        <h3 class="font-semibold">静默安装</h3>
        <p class="text-sm text-text-secondary">更新安装时不弹出安装向导，后台自动完成</p>
      </div>
      <Switch v-model="settingStore.silentUpdate" />
    </div>
    <div class="settings-divider"></div>
    <div class="settings-item">
      <button type="button" class="version-info-trigger" @click="handleVersionClick">
        <h3 class="font-semibold">当前版本</h3>
        <p class="text-sm text-text-secondary">
          Version v{{ versionLabel }} {{ releaseChannelLabel }}
        </p>
      </button>
      <div class="flex items-center gap-2">
        <Button variant="unstyled" size="default" class="settings-action" @click="onShowChangelog">
          更新日志
        </Button>
        <Button
          variant="primary"
          size="default"
          class="settings-action settings-action-primary"
          :disabled="isCheckingUpdate"
          @click="onCheckUpdates"
        >
          {{ isCheckingUpdate ? '检查中...' : '检查更新' }}
        </Button>
      </div>
    </div>
    <div class="settings-divider"></div>
    <div class="settings-item">
      <div class="space-y-1">
        <h3 class="font-semibold">项目源码</h3>
        <p class="text-sm text-text-secondary">开源共享于 GitHub</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="action-icon text-text-secondary"
        aria-label="查看源码"
        @click="settingStore.openRepo()"
      >
        <Icon :icon="iconExternalLink" width="20" height="20" />
      </Button>
    </div>
    <div class="settings-divider"></div>
    <div class="settings-item">
      <div class="space-y-1">
        <h3 class="font-semibold">免责声明</h3>
        <p class="text-sm text-text-secondary">查看法律条款与免责声明</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="action-icon text-text-secondary"
        aria-label="查看声明"
        @click="onShowDisclaimer"
      >
        <Icon :icon="iconChevronRight" width="20" height="20" />
      </Button>
    </div>

    <!-- 解锁每日会员领取功能时的礼花反馈 -->
    <Teleport to="body">
      <div v-if="showConfetti" class="confetti-container">
        <div
          v-for="particle in confettiParticles"
          :key="particle.id"
          class="confetti-particle"
          :style="{
            left: particle.x + '%',
            backgroundColor: particle.color,
            animationDelay: particle.delay + 's',
            animationDuration: particle.duration + 's',
          }"
        />
      </div>
    </Teleport>
  </SettingsSectionShell>
</template>

<style scoped src="../settingsSection.css"></style>

<style scoped>
.version-info-trigger {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 0;
  appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: var(--radius-control);
}
</style>

<style>
/* 礼花效果 - 粒子通过 Teleport 渲染到 body，需全局样式 */
.confetti-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 9999;
  overflow: hidden;
}

.confetti-particle {
  position: absolute;
  top: -10px;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  animation: confetti-fall linear forwards;
}

@keyframes confetti-fall {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(100vh) rotate(720deg);
    opacity: 0;
  }
}
</style>
