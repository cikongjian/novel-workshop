/**
 * 通知服务
 * 负责 Web Push 推送和在 App 内通知的存储/查询
 * 
 * 职责：
 * - 管理 Web Push 订阅（注册/注销）
 * - 通过 Web Push 协议发送推送通知
 * - 管理应用内通知（存储、查询、标记已读）
 */
import { createLogger } from '../utils/logger.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

const log = createLogger('NotificationService');

// ===== 类型定义 =====

export interface PushSubscriptionRecord {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
  /** 用户设备标识（用于多设备去重） */
  deviceTag?: string;
}

export interface InAppNotification {
  id: string;
  userId: string;
  type: 'chapter_ready' | 'favorite_update' | 'comment' | 'like' | 'reminder' | 'system';
  title: string;
  body: string;
  data?: {
    novelId?: string;
    chapterId?: string;
    chapterNumber?: number;
    novelTitle?: string;
    chapterTitle?: string;
    route?: string;
  };
  read: boolean;
  createdAt: string;
}

export type NotificationFilter = {
  type?: InAppNotification['type'];
  read?: boolean;
  limit?: number;
  offset?: number;
};

// ===== 存储 =====

interface SubscriptionsStore {
  subscriptions: PushSubscriptionRecord[];
}

interface NotificationsStore {
  notifications: InAppNotification[];
}

const MAX_NOTIFICATIONS = 500; // 单用户最多保留 500 条通知

export class NotificationService {
  private subsPath: string;
  private notifsDir: string;
  private vapidKeys: { publicKey: string; privateKey: string } | null;
  private webPush: typeof import('web-push') | null = null;

  constructor(
    private readonly dataDir: string,
    vapidPublicKey?: string,
    vapidPrivateKey?: string,
  ) {
    this.subsPath = path.join(dataDir, 'push-subscriptions.json');
    this.notifsDir = path.join(dataDir, 'notifications');
    if (vapidPublicKey && vapidPrivateKey) {
      this.vapidKeys = { publicKey: vapidPublicKey, privateKey: vapidPrivateKey };
    } else {
      this.vapidKeys = null;
    }

    // 确保通知目录存在
    if (!fs.existsSync(this.notifsDir)) {
      fs.mkdirSync(this.notifsDir, { recursive: true });
    }
  }

  // ===== 初始化 =====

  async init(contactEmail?: string) {
    try {
      const imported = await import('web-push');
      // web-push 是 CommonJS 模块，ESM 动态导入时实际 API 挂在 .default 上
      const wp = (imported as unknown as { default?: typeof import('web-push') }).default ?? imported;
      this.webPush = wp;

      if (this.vapidKeys) {
        wp.setVapidDetails(
          contactEmail ?? `mailto:noreply@example.com`,
          this.vapidKeys.publicKey,
          this.vapidKeys.privateKey,
        );
        log.info('VAPID keys loaded from config');
      } else {
        // 自动生成 VAPID keys
        const keys = wp.generateVAPIDKeys();
        this.vapidKeys = keys;
        wp.setVapidDetails(
          contactEmail ?? `mailto:noreply@example.com`,
          keys.publicKey,
          keys.privateKey,
        );
        log.warn('No VAPID keys configured, auto-generated (will change on restart)');
      }
    } catch (e) {
      log.error('Failed to init web-push', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  getVapidPublicKey(): string | null {
    return this.vapidKeys?.publicKey ?? null;
  }

  // ===== 订阅管理 =====

  private loadSubscriptions(): PushSubscriptionRecord[] {
    try {
      if (!fs.existsSync(this.subsPath)) return [];
      const raw = fs.readFileSync(this.subsPath, 'utf-8');
      const data = JSON.parse(raw) as SubscriptionsStore;
      return data.subscriptions ?? [];
    } catch {
      return [];
    }
  }

  private saveSubscriptions(subs: PushSubscriptionRecord[]) {
    const data: SubscriptionsStore = { subscriptions: subs };
    fs.writeFileSync(this.subsPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /** 注册推送订阅（同一 endpoint 会被覆盖） */
  subscribe(record: PushSubscriptionRecord) {
    const subs = this.loadSubscriptions();
    const idx = subs.findIndex((s) => s.endpoint === record.endpoint);
    if (idx >= 0) {
      subs[idx] = record;
    } else {
      subs.push(record);
    }
    this.saveSubscriptions(subs);
    log.info(`Push subscription added for user ${record.userId}`);
  }

  /** 注销推送订阅 */
  unsubscribe(userId: string, endpoint: string) {
    const subs = this.loadSubscriptions();
    const filtered = subs.filter((s) => !(s.userId === userId && s.endpoint === endpoint));
    if (filtered.length !== subs.length) {
      this.saveSubscriptions(filtered);
      log.info(`Push subscription removed for user ${userId}`);
    }
  }

  /** 获取用户所有订阅（多设备） */
  getUserSubscriptions(userId: string): PushSubscriptionRecord[] {
    return this.loadSubscriptions().filter((s) => s.userId === userId);
  }

  // ===== Web Push 推送 =====

  /** 向单个用户的所有设备推送通知 */
  async sendPushToUser(
    userId: string,
    payload: { title: string; body: string; icon?: string; data?: Record<string, unknown>; tag?: string },
  ) {
    if (!this.webPush || !this.vapidKeys) {
      log.warn('Web Push not initialized, cannot send push');
      return;
    }
    const subs = this.getUserSubscriptions(userId);
    if (subs.length === 0) return;

    const pushPayload = JSON.stringify(payload);
    const results = await Promise.allSettled(
      subs.map((sub) =>
        this.webPush!.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
          pushPayload,
        ).catch((err: unknown) => {
          // 订阅过期（410 Gone）或无效（404）—— 自动清理
          if ((err as { statusCode?: number })?.statusCode === 404 || (err as { statusCode?: number })?.statusCode === 410) {
            this.unsubscribe(userId, sub.endpoint);
            log.info(`Removed expired subscription for user ${userId}`);
          } else {
            throw err;
          }
        }),
      ),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      log.warn(`Push send: ${subs.length - failed}/${subs.length} succeeded for user ${userId}`);
    }
  }

  /** 向所有用户的多个订阅广播（批量推送） */
  async broadcastPush(
    payload: { title: string; body: string; tag?: string },
    filter?: (sub: PushSubscriptionRecord) => boolean,
  ) {
    if (!this.webPush || !this.vapidKeys) return;
    const subs = filter ? this.loadSubscriptions().filter(filter) : this.loadSubscriptions();
    const pushPayload = JSON.stringify(payload);
    await Promise.allSettled(
      subs.map((sub) =>
        this.webPush!.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
          pushPayload,
        ).catch(async (err: unknown) => {
          if ((err as { statusCode?: number })?.statusCode === 404 || (err as { statusCode?: number })?.statusCode === 410) {
            this.unsubscribe(sub.userId, sub.endpoint);
          }
        }),
      ),
    );
  }

  // ===== 应用内通知 =====

  private getNotifPath(userId: string): string {
    return path.join(this.notifsDir, `${userId}.json`);
  }

  private loadNotifications(userId: string): InAppNotification[] {
    try {
      const filePath = this.getNotifPath(userId);
      if (!fs.existsSync(filePath)) return [];
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as NotificationsStore;
      return data.notifications ?? [];
    } catch {
      return [];
    }
  }

  private saveNotifications(userId: string, notifs: InAppNotification[]) {
    // 裁剪超过上限的通知
    const trimmed = notifs.slice(0, MAX_NOTIFICATIONS);
    const data: NotificationsStore = { notifications: trimmed };
    const filePath = this.getNotifPath(userId);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /** 添加应用内通知 */
  addInAppNotification(
    userId: string,
    notification: Omit<InAppNotification, 'id' | 'read' | 'createdAt'>,
  ): InAppNotification {
    const notifs = this.loadNotifications(userId);
    const newNotif: InAppNotification = {
      ...notification,
      id: randomUUID(),
      read: false,
      createdAt: new Date().toISOString(),
    };
    notifs.unshift(newNotif);
    this.saveNotifications(userId, notifs);
    return newNotif;
  }

  /**
   * 章节生成完成通知（站内信，fire-and-forget）。
   * 失败只打日志、绝不抛错——通知不能阻塞章节生成主流程。
   */
  notifyChapterReady(
    userId: string,
    info: { novelId: string; novelTitle: string; chapterNumber: number; chapterTitle?: string },
  ): void {
    if (!userId) return;
    try {
      this.addInAppNotification(userId, {
        userId,
        type: 'chapter_ready',
        title: `第 ${info.chapterNumber} 章已生成`,
        body: `${info.novelTitle}${info.chapterTitle ? ` · 第 ${info.chapterNumber} 章 ${info.chapterTitle}` : ''}`,
        data: {
          novelId: info.novelId,
          novelTitle: info.novelTitle,
          chapterNumber: info.chapterNumber,
          chapterTitle: info.chapterTitle,
          route: `/m/novel/${info.novelId}`,
        },
      });
    } catch (e) {
      log.warn('notifyChapterReady 失败（已忽略，不阻塞主流程）', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /** 查询应用内通知 */
  getInAppNotifications(userId: string, filter?: NotificationFilter): {
    items: InAppNotification[];
    total: number;
    unreadCount: number;
  } {
    let notifs = this.loadNotifications(userId);

    if (filter?.type) {
      notifs = notifs.filter((n) => n.type === filter.type);
    }
    if (filter?.read !== undefined) {
      notifs = notifs.filter((n) => n.read === filter.read);
    }

    const unreadCount = notifs.filter((n) => !n.read).length;
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 20;
    const items = notifs.slice(offset, offset + limit);

    return { items, total: notifs.length, unreadCount };
  }

  /** 标记单条通知已读 */
  markRead(userId: string, notificationId: string) {
    const notifs = this.loadNotifications(userId);
    const target = notifs.find((n) => n.id === notificationId);
    if (target) {
      target.read = true;
      this.saveNotifications(userId, notifs);
    }
  }

  /** 标记全部通知已读 */
  markAllRead(userId: string) {
    const notifs = this.loadNotifications(userId);
    for (const n of notifs) {
      n.read = true;
    }
    this.saveNotifications(userId, notifs);
  }

  /** 获取未读数量 */
  getUnreadCount(userId: string): number {
    const notifs = this.loadNotifications(userId);
    return notifs.filter((n) => !n.read).length;
  }
}
