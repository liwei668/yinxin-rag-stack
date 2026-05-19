// 认证工具类
import crypto from 'crypto';

// 密码加密
export const hashPassword = async (password: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
};

// 密码验证
export const verifyPassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const [salt, key] = hashedPassword.split(':');
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) reject(err);
      resolve(key === derivedKey.toString('hex'));
    });
  });
};

// 生成JWT Token（简化版）
export const generateToken = (userId: string, role: string): string => {
  const payload = {
    userId,
    role,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7天过期
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
};

// 验证JWT Token
export const verifyToken = (token: string): { userId: string; role: string; exp: number } | null => {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString());
    if (payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};
