import { Redis } from 'ioredis';

// Redis 连接配置 - 兼容 REDIS_URL 和拆分变量
function parseRedisConfig() {
  // 优先使用 REDIS_URL（Docker 部署）
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const url = new URL(redisUrl);
      return {
        host: url.hostname || 'localhost',
        port: parseInt(url.port || '6379'),
        password: url.password || undefined,
        db: parseInt(url.pathname?.slice(1) || '0'),
      };
    } catch {
      console.warn('[Redis] REDIS_URL 格式无效，使用拆分变量');
    }
  }

  // 兼容拆分变量（本地开发）
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
  };
}

const redisConfig = parseRedisConfig();

// 创建 Redis 连接实例
export const redis = new Redis({
  ...redisConfig,
  maxRetriesPerRequest: null, // BullMQ 需要设置为 null
  enableReadyCheck: false,    // BullMQ 需要设置为 false
  retryStrategy(times) {
    // 指数退避重连，最多等待 3 秒
    if (times > 10) {
      return null; // 停止重连
    }
    return Math.min(times * 200, 3000);
  },
});

// Redis 事件监听
redis.on('error', (err) => {
  console.error('[Redis] 连接错误:', err.message);
});

redis.on('connect', () => {
  console.log('[Redis] 连接成功');
});

redis.on('reconnecting', (delay) => {
  console.log(`[Redis] 正在重连，延迟 ${delay}ms`);
});

redis.on('close', () => {
  console.log('[Redis] 连接已关闭');
});

// 创建用于 BullMQ 的 Redis 连接选项
export const redisConnection = {
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password,
  db: redisConfig.db,
};

// 健康检查
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('[Redis] 健康检查失败:', error);
    return false;
  }
}

// 优雅关闭
export async function closeRedis(): Promise<void> {
  try {
    await redis.quit();
    console.log('[Redis] 连接已优雅关闭');
  } catch (error) {
    console.error('[Redis] 关闭失败:', error);
  }
}

console.log('[Redis] 配置加载完成:', redisConfig.host, redisConfig.port);
