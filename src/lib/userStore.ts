// 共享用户存储 - 所有API共享同一个用户数据
import fs from 'fs';
import path from 'path';

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

// 确保数据目录存在
const ensureDataDir = () => {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
};

// 从文件加载用户数据
const loadUsers = (): any[] => {
  ensureDataDir();
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading users:', error);
  }
  // 默认用户数据
  return [
    {
      id: 'admin_liwei',
      username: 'liwei',
      email: 'liwei@163.com',
      password: 'ae84f8e268709a5c3a13de8ed6c7dd1f:27373ff671c03071c41aac85e46878ab4989fd41eee3c2b6ed7e70275db02c185be21999fd9b0b1bdf4746a1bd109e570d27bd93041c6f0195f023d597fde9a1',
      role: 'admin',
      storagePreference: 'hybrid',
      avatar: '',
      isActive: true,
      createdAt: new Date('2026-04-14T09:16:52.413Z'),
      updatedAt: new Date('2026-04-14T09:16:52.413Z'),
    }
  ];
};

// 保存用户数据到文件
const saveUsers = (users: any[]) => {
  ensureDataDir();
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving users:', error);
  }
};

let users: any[] = loadUsers();

export const userStore = {
  // 查找用户
  findOne: (query: any) => {
    if (query.id) {
      return users.find(user => user.id === query.id);
    }
    if (query.email) {
      return users.find(user => user.email === query.email);
    }
    return null;
  },
  
  // 创建用户
  create: (data: any) => {
    users.push(data);
    saveUsers(users);
    return data;
  },
  
  // 获取所有用户
  getAll: () => {
    return users;
  },
  
  // 更新用户
  update: (id: string, data: any) => {
    const index = users.findIndex(user => user.id === id);
    if (index !== -1) {
      users[index] = { ...users[index], ...data, updatedAt: new Date() };
      saveUsers(users);
      return users[index];
    }
    return null;
  },
  
  // 删除用户
  delete: (id: string) => {
    users = users.filter(user => user.id !== id);
    saveUsers(users);
  },
  
  // 清空所有用户（仅用于测试）
  clear: () => {
    users = [];
    saveUsers(users);
  }
};

console.log('Shared user store initialized with persistence');
console.log(`Loaded ${users.length} users from ${USERS_FILE}`);
