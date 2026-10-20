import { useSettingStore } from '@/stores/setting';
import { useUserStore } from '@/stores/user';
import logger from '@/utils/logger';

/**
 * 本次运行内已尝试领取的「账号 + 日期」。
 * 启动、登录、进入个人中心都会调用自动领取，这里保证同一账号同一天只打一次接口。
 */
const attemptedKeys = new Set<string>();

/** 本次运行内已尝试签到的「账号 + 日期」，与会员领取分开计数。 */
const checkInAttemptedKeys = new Set<string>();

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
  checkInAttemptedKeys.clear();
};

/**
 * 触发每日签到（听歌领取 + 广告位次数领取）。
 *
 * 广告位最多 8 轮、每轮间隔 30 秒，完整流程约 3~4 分钟，因此不阻塞调用方：
 * 启动、登录流程只需触发，进度通过 userStore 的签到状态反映到界面。
 */
export const maybeAutoCheckIn = async (reason: string): Promise<void> => {
  if (!isAutoVipClaimEnabled()) return;

  const userStore = useUserStore();
  if (!userStore.isLoggedIn || userStore.isCheckInRunning) return;

  try {
    const key = `${userStore.info?.userid ?? 0}:${await userStore.getServerToday()}`;
    if (checkInAttemptedKeys.has(key)) return;
    checkInAttemptedKeys.add(key);

    logger.info('DailyVip', `Auto check-in started (${reason})`);
    await userStore
      .runDailyCheckIn()
      .then((result) => logger.info('DailyVip', `Auto check-in finished (${reason})`, result))
      .catch((e) => logger.warn('DailyVip', `Auto check-in failed (${reason})`, e));
  } catch (e) {
    logger.warn('DailyVip', `Auto check-in unexpected error (${reason})`, e);
  }
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

    // 会员领取不阻塞签到（签到含 8 轮 30 秒间隔），后台继续执行
    void maybeAutoCheckIn(reason);

    return claimed || upgraded;
  } catch (e) {
    logger.warn('DailyVip', `Auto claim failed (${reason})`, e);
    return false;
  }
};
