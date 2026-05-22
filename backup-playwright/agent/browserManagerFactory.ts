import { BrowserManager } from './browserManager';

class BrowserManagerFactory {
  private instances: Map<string, { manager: BrowserManager; lastUsed: number; inUse: boolean }> = new Map();
  private readonly maxInstances: number;
  // 防止并发 getManager 对同一 userId 重复创建
  private pendingCreations: Map<string, Promise<BrowserManager>> = new Map();

  constructor() {
    this.maxInstances = parseInt(process.env.MAX_BROWSER_INSTANCES || '5');
  }

  async getManager(userId: string): Promise<BrowserManager> {
    // 1. 已有实例 → 直接返回
    const existing = this.instances.get(userId);
    if (existing) {
      existing.lastUsed = Date.now();
      existing.inUse = true;
      return existing.manager;
    }

    // 2. 正在创建中 → 等待同一个 Promise（防止竞态）
    const pending = this.pendingCreations.get(userId);
    if (pending) {
      return pending;
    }

    // 3. 创建新实例（用 Promise 包裹，防止并发重复创建）
    const creationPromise = this._createManager(userId);
    this.pendingCreations.set(userId, creationPromise);

    try {
      const manager = await creationPromise;
      return manager;
    } finally {
      this.pendingCreations.delete(userId);
    }
  }

  private async _createManager(userId: string): Promise<BrowserManager> {
    // 再次检查（可能在等待期间已被其他请求创建）
    const existing = this.instances.get(userId);
    if (existing) {
      existing.lastUsed = Date.now();
      existing.inUse = true;
      return existing.manager;
    }

    // 超过限制则淘汰最久未用且未被使用的实例
    if (this.instances.size >= this.maxInstances) {
      await this.evictOldest();
    }

    const manager = new BrowserManager(userId);
    this.instances.set(userId, { manager, lastUsed: Date.now(), inUse: true });
    console.log(`[BrowserManagerFactory] 创建实例: ${userId} (当前 ${this.instances.size}/${this.maxInstances})`);
    return manager;
  }

  /**
   * 标记实例使用完毕（不关闭，仅标记 inUse=false）
   */
  markIdle(userId: string): void {
    const entry = this.instances.get(userId);
    if (entry) {
      entry.inUse = false;
    }
  }

  async releaseManager(userId: string, saveProfile = true): Promise<void> {
    const entry = this.instances.get(userId);
    if (entry) {
      try {
        if (saveProfile) await entry.manager.saveProfile();
        await entry.manager.close();
      } catch (e) {
        console.error(`[BrowserManagerFactory] 关闭实例失败: ${userId}`, e);
      }
      this.instances.delete(userId);
    }
  }

  getManagerCount(): number {
    return this.instances.size;
  }

  isManagerActive(userId: string): boolean {
    return this.instances.has(userId);
  }

  private async evictOldest(): Promise<void> {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [userId, entry] of this.instances) {
      // 优先淘汰未使用的实例，跳过正在使用的
      if (entry.inUse) continue;
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldest = userId;
      }
    }
    // 如果所有实例都在使用中，仍然淘汰最旧的（兜底）
    if (!oldest) {
      for (const [userId, entry] of this.instances) {
        if (entry.lastUsed < oldestTime) {
          oldestTime = entry.lastUsed;
          oldest = userId;
        }
      }
    }
    if (oldest) {
      console.log(`[BrowserManagerFactory] 淘汰最久未使用实例: ${oldest}`);
      await this.releaseManager(oldest);
    }
  }

  async closeAll(): Promise<void> {
    for (const userId of Array.from(this.instances.keys())) {
      await this.releaseManager(userId);
    }
  }
}

export const browserManagerFactory = new BrowserManagerFactory();
