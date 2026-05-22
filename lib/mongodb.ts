import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yinxin-agl';

let cachedConnection: mongoose.Connection | null = null;
let isConnecting = false; // 防止并发连接

export async function connectToDatabase(): Promise<mongoose.Connection | null> {
  // 如果已有缓存连接且状态正常，直接返回
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }

  // 防止并发连接
  if (isConnecting) {
    // 等待连接完成
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (cachedConnection && mongoose.connection.readyState === 1) {
          clearInterval(check);
          resolve(cachedConnection);
        }
      }, 200);
      // 10秒超时
      setTimeout(() => {
        clearInterval(check);
        resolve(cachedConnection);
      }, 10000);
    });
  }

  isConnecting = true;

  try {
    const options: mongoose.ConnectOptions = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      // 自动重连配置
      retryWrites: true,
      // 心跳检测
      heartbeatFrequencyMS: 10000,
    };

    await mongoose.connect(MONGODB_URI, options);
    cachedConnection = mongoose.connection;

    // 监听连接事件
    mongoose.connection.on('connected', () => {
      console.log('[MongoDB] 连接成功');
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] 连接断开，将自动重连...');
    });

    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] 连接错误:', err.message);
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[MongoDB] 重连成功');
    });

    console.log('[MongoDB] 初始连接成功');
    return cachedConnection;
  } catch (error) {
    console.error('[MongoDB] 连接失败，将在下次请求时重试:', error);
    // 不再设置 connectionFailed 标记，允许下次请求重试
    return null;
  } finally {
    isConnecting = false;
  }
}

// 健康检查
export async function checkMongoHealth(): Promise<boolean> {
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.admin().ping();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export default mongoose;
