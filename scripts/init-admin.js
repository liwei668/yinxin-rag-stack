import crypto from 'crypto';

// 密码加密函数（与auth.ts中的实现一致）
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

// 生成加密密码
async function init() {
  const hashedPassword = await hashPassword('12345678a');
  console.log('加密后的密码:', hashedPassword);
  
  // 输出完整的用户对象
  const adminUser = {
    id: 'admin_liwei',
    username: 'liwei',
    email: 'liwei@163.com',
    password: hashedPassword,
    role: 'admin',
    storagePreference: 'hybrid',
    avatar: '',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  console.log('\n完整的用户对象:');
  console.log(JSON.stringify(adminUser, null, 2));
}

init();
