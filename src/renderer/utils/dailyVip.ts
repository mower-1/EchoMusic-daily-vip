import { useSettingStore } from '@/stores/setting';
import { useUserStore } from '@/stores/user';
import logger from '@/utils/logger';

/**
 * 本次运行内已尝试领取的「账号 + 日期」。
 * 启动、登录、进入个人中心都会调用自动领取，这里保证同一账号同一天只打一次接口。
 */
const attemptedKeys = new Set<string>();

/** 每日会员领取功能是否已解锁（设置-关于连点「当前版本」5 次激活的彩蛋）。 */
export const isVipClaimEnabled = (): boolean => useSettingStore().vipClaimEnabled === true;

/** 是否同时满足「已解锁」与「已开启自动领取」。 */
export const isAutoVipClaimEnabled = (): boolean => {
  const settingStore = useSettingStore();
  return settingStore.vipClaimEnabled === true && settingStore.autoReceiveVip === true;
};

/** 账号切换/退出后清空尝试记录，重新登录仍可触发一次自动领取。 */
export const resetDailyVipAttempts = (): void => {
  attemptedKeys.clear();
};

/**
 * 自动领取每日畅听会员并升级概念会员。
 * 仅在解锁且开启自动领取时生效，失败不抛出，避免影响启动与登录流程。
 */
export const maybeAutoReceiveVip = async (reason: string): Promise<boolean> => {
  if (!isAutoVipClaimEnabled()) return false;

  const userStore = useUserStore();
  if (!userStore.isLoggedIn || userStore.isAutoClaimingVip) return false;

  try {
    // 领取依赖用户身份与有效登录态，先确保资料已就绪
    if (!userStore.hasFetchedUserInfo) await userStore.fetchUserInfoOnce();
    if (!userStore.isLoggedIn) return false;

    const key = `${userStore.info?.userid ?? 0}:${await userStore.getServerToday()}`;
    if (attemptedKeys.has(key)) return false;
    attemptedKeys.add(key);

    const { claimed, upgraded } = await userStore.autoReceiveVipIfNeeded();
    logger.info('DailyVip', `Auto claim finished (${reason})`, { claimed, upgraded });
    return claimed || upgraded;
  } catch (e) {
    logger.warn('DailyVip', `Auto claim failed (${reason})`, e);
    return false;
  }
};
