import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据存储路径
const DATA_DIR = path.join(process.cwd(), 'data');
const KNOWLEDGE_STRUCTURE_FILE = path.join(DATA_DIR, 'knowledgeStructure.json');
const OPERATION_LOGS_FILE = path.join(DATA_DIR, 'operationLogs.json');
const LOCK_FILE = path.join(DATA_DIR, 'knowledgeStructure.lock');

// 确保目录存在
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// 文件锁机制
async function acquireLock(): Promise<boolean> {
  ensureDataDir();
  try {
    await fs.promises.writeFile(LOCK_FILE, Date.now().toString(), { flag: 'wx' });
    return true;
  } catch (error) {
    return false;
  }
}

async function releaseLock() {
  if (fs.existsSync(LOCK_FILE)) {
    await fs.promises.unlink(LOCK_FILE);
  }
}

// 知识库结构类型
export interface KnowledgeStructureItem {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  isVirtual: boolean;
  visibility: 'private' | 'team' | 'public';
  isArchived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  children?: KnowledgeStructureItem[];
}

// 操作记录类型
export interface OperationLog {
  id: string;
  type: 'create' | 'update' | 'delete' | 'move' | 'batch-move';
  entityType: 'kb' | 'category' | 'document';
  entityId: string;
  entityName?: string;
  before?: any;
  after?: any;
  userId?: string;
  userName?: string;
  ip?: string;
  timestamp: string;
}

// 初始化默认数据
function getDefaultKnowledgeStructure(): KnowledgeStructureItem[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'uncategorized',
      name: '未分类',
      parentId: null,
      level: 0,
      isVirtual: true,
      visibility: 'private',
      isArchived: false,
      version: 1,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'work-related',
      name: '工作相关',
      parentId: null,
      level: 0,
      isVirtual: false,
      visibility: 'private',
      isArchived: false,
      version: 1,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'tech-docs',
      name: '技术文档',
      parentId: 'work-related',
      level: 1,
      isVirtual: false,
      visibility: 'private',
      isArchived: false,
      version: 1,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'meeting-notes',
      name: '会议记录',
      parentId: 'work-related',
      level: 1,
      isVirtual: false,
      visibility: 'private',
      isArchived: false,
      version: 1,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'personal-data',
      name: '个人资料',
      parentId: null,
      level: 0,
      isVirtual: false,
      visibility: 'private',
      isArchived: false,
      version: 1,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'study-materials',
      name: '学习资料',
      parentId: 'personal-data',
      level: 1,
      isVirtual: false,
      visibility: 'private',
      isArchived: false,
      version: 1,
      createdAt: now,
      updatedAt: now
    }
  ];
}

// 加载知识库结构
export async function loadKnowledgeStructure(): Promise<KnowledgeStructureItem[]> {
  ensureDataDir();
  
  if (!fs.existsSync(KNOWLEDGE_STRUCTURE_FILE)) {
    const defaultData = getDefaultKnowledgeStructure();
    await saveKnowledgeStructure(defaultData);
    return defaultData;
  }
  
  try {
    const data = await fs.promises.readFile(KNOWLEDGE_STRUCTURE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading knowledge structure:', error);
    return getDefaultKnowledgeStructure();
  }
}

// 保存知识库结构
export async function saveKnowledgeStructure(structure: KnowledgeStructureItem[]): Promise<void> {
  ensureDataDir();
  
  // 获取锁
  let lockAcquired = false;
  let retryCount = 0;
  
  while (!lockAcquired && retryCount < 10) {
    lockAcquired = await acquireLock();
    if (!lockAcquired) {
      await new Promise(resolve => setTimeout(resolve, 100));
      retryCount++;
    }
  }
  
  if (!lockAcquired) {
    throw new Error('Failed to acquire lock after multiple attempts');
  }
  
  try {
    await fs.promises.writeFile(
      KNOWLEDGE_STRUCTURE_FILE, 
      JSON.stringify(structure, null, 2), 
      'utf-8'
    );
  } finally {
    await releaseLock();
  }
}

// 加载操作记录
export async function loadOperationLogs(): Promise<OperationLog[]> {
  ensureDataDir();
  
  if (!fs.existsSync(OPERATION_LOGS_FILE)) {
    return [];
  }
  
  try {
    const data = await fs.promises.readFile(OPERATION_LOGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading operation logs:', error);
    return [];
  }
}

// 保存操作记录
export async function saveOperationLogs(logs: OperationLog[]): Promise<void> {
  ensureDataDir();
  await fs.promises.writeFile(
    OPERATION_LOGS_FILE, 
    JSON.stringify(logs, null, 2), 
    'utf-8'
  );
}

// 添加操作记录
export async function addOperationLog(log: Omit<OperationLog, 'id' | 'timestamp'>): Promise<void> {
  const logs = await loadOperationLogs();
  const newLog: OperationLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    ...log
  };
  
  logs.unshift(newLog);
  
  const MAX_LOGS = 1000;
  if (logs.length > MAX_LOGS) {
    logs.splice(MAX_LOGS);
  }
  
  await saveOperationLogs(logs);
}

// 构建树形结构
export function buildTreeFromList(list: KnowledgeStructureItem[]): KnowledgeStructureItem[] {
  const map = new Map<string, KnowledgeStructureItem>();
  const roots: KnowledgeStructureItem[] = [];
  
  list.forEach(item => {
    map.set(item.id, { ...item, children: [] });
  });
  
  list.forEach(item => {
    const node = map.get(item.id)!;
    if (item.parentId === null) {
      roots.push(node);
    } else {
      const parent = map.get(item.parentId);
      if (parent) {
        parent.children!.push(node);
      }
    }
  });
  
  roots.sort((a, b) => {
    if (a.isVirtual) return -1;
    if (b.isVirtual) return 1;
    return a.name.localeCompare(b.name);
  });
  
  roots.forEach(root => {
    if (root.children) {
      root.children.sort((a, b) => a.name.localeCompare(b.name));
    }
  });
  
  return roots;
}

// 生成唯一ID
export function generateId(): string {
  return `kb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
