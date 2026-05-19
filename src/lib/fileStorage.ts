// 文件持久化存储 - 替代 MongoDB
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'memory-store.json');

interface MemoryStoreData {
  branches: Record<string, any[]>;    // userId -> branch[]
  preferences: Record<string, any>;   // userId -> preference
  associations: Record<string, any[]>; // userId -> association[]
}

class FileStorage {
  private data: MemoryStoreData = {
    branches: {},
    preferences: {},
    associations: {}
  };
  private initialized = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;

    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(MEMORY_FILE)) {
        const raw = fs.readFileSync(MEMORY_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = {
          branches: parsed.branches || {},
          preferences: parsed.preferences || {},
          associations: parsed.associations || {}
        };
        const totalBranches = Object.values(this.data.branches).reduce((sum: number, arr: any) => sum + arr.length, 0);
        console.log(`FileStorage 初始化成功，${totalBranches} 个分支，${Object.keys(this.data.preferences).length} 个用户偏好`);
      } else {
        console.log('FileStorage 初始化成功，无已有数据');
      }
    } catch (error) {
      console.error('FileStorage 初始化失败:', error);
    }
  }

  private save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (error) {
      console.error('FileStorage 保存失败:', error);
    }
  }

  // === 分支操作 ===
  getBranches(userId: string): any[] {
    return this.data.branches[userId] || [];
  }

  addBranch(userId: string, branch: any) {
    if (!this.data.branches[userId]) {
      this.data.branches[userId] = [];
    }
    this.data.branches[userId].push(branch);
    this.save();
  }

  findBranch(userId: string, branchId: string): any | null {
    const branches = this.data.branches[userId] || [];
    return branches.find((b: any) => b.id === branchId) || null;
  }

  findBranchGlobal(branchId: string): { userId: string; branch: any } | null {
    for (const [userId, branches] of Object.entries(this.data.branches)) {
      const branch = (branches as any[]).find((b: any) => b.id === branchId);
      if (branch) return { userId, branch };
    }
    return null;
  }

  updateBranch(userId: string, branchId: string, updates: any): any | null {
    const branches = this.data.branches[userId] || [];
    const index = branches.findIndex((b: any) => b.id === branchId);
    if (index === -1) return null;

    branches[index] = { ...branches[index], ...updates, updatedAt: new Date().toISOString() };
    this.data.branches[userId] = branches;
    this.save();
    return branches[index];
  }

  updateBranchGlobal(branchId: string, updates: any): any | null {
    const result = this.findBranchGlobal(branchId);
    if (!result) return null;
    return this.updateBranch(result.userId, branchId, updates);
  }

  deleteBranch(userId: string, branchId: string): any | null {
    const branches = this.data.branches[userId] || [];
    const index = branches.findIndex((b: any) => b.id === branchId);
    if (index === -1) return null;

    const deleted = branches[index];
    branches[index] = { ...deleted, status: 'archived', updatedAt: new Date().toISOString() };
    this.data.branches[userId] = branches;
    this.save();
    return branches[index];
  }

  // === 偏好操作 ===
  getPreference(userId: string): any | null {
    return this.data.preferences[userId] || null;
  }

  setPreference(userId: string, preference: any) {
    this.data.preferences[userId] = preference;
    this.save();
  }

  updatePreference(userId: string, updates: any): any {
    const existing = this.data.preferences[userId] || {};
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.data.preferences[userId] = updated;
    this.save();
    return updated;
  }

  // === 关联操作 ===
  getAssociations(userId: string): any[] {
    return this.data.associations[userId] || [];
  }

  addAssociation(userId: string, association: any) {
    if (!this.data.associations[userId]) {
      this.data.associations[userId] = [];
    }
    this.data.associations[userId].push(association);
    this.save();
  }

  cleanAssociations(userId: string, maxAgeMs: number = 3600000) {
    const associations = this.data.associations[userId] || [];
    const now = Date.now();
    this.data.associations[userId] = associations.filter((a: any) => {
      return now - new Date(a.lastAccessedAt).getTime() <= maxAgeMs;
    });
    this.save();
  }
}

export const fileStorage = new FileStorage();
