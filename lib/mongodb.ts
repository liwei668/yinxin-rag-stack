import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yinxin-agl';

let cachedConnection: mongoose.Connection | null = null;
let connectionFailed = false; // 连接失败标记，避免重复重试

export async function connectToDatabase() {
  if (cachedConnection) {
    return cachedConnection;
  }

  // 如果之前已经连接失败过，直接返回 null，不再重试
  if (connectionFailed) {
    return null;
  }

  try {
    const options: mongoose.ConnectOptions = {
      serverSelectionTimeoutMS: 3000, // 服务器选择超时 3秒（从5秒缩短）
      socketTimeoutMS: 30000,
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
    };

    const connection = await mongoose.connect(MONGODB_URI, options);
    cachedConnection = connection.connection;
    console.log('Connected to MongoDB');
    return cachedConnection;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    connectionFailed = true; // 标记失败，后续不再重试
    return null;
  }
}

export default mongoose;
