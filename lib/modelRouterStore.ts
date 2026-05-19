import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const DATA_PATH = path.join(process.cwd(), 'data', 'model-router.json');

export interface RouterRule {
  id: string;
  name: string;
  type: 'keyword' | 'fileType' | 'intent' | 'default';
  keywords?: string[];
  fileTypes?: string[];
  intent?: string;
  modelId: string;
  priority: number;
  comboId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function readData(): RouterRule[] {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const data = fs.readFileSync(DATA_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error reading model router data:', e);
  }
  return [];
}

function writeData(rules: RouterRule[]): void {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_PATH, JSON.stringify(rules, null, 2));
}

export const modelRouterStore = {
  getAll(): RouterRule[] {
    return readData().sort((a, b) => b.priority - a.priority);
  },

  getActive(): RouterRule[] {
    return this.getAll().filter(r => r.isActive);
  },

  findOne(id: string): RouterRule | undefined {
    return readData().find(r => r.id === id);
  },

  create(data: Omit<RouterRule, 'id' | 'createdAt' | 'updatedAt'>): string {
    const rules = readData();
    const newRule: RouterRule = {
      id: uuidv4(),
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    rules.push(newRule);
    writeData(rules);
    return newRule.id;
  },

  update(id: string, data: Partial<RouterRule>): void {
    const rules = readData();
    const index = rules.findIndex(r => r.id === id);
    if (index !== -1) {
      rules[index] = {
        ...rules[index],
        ...data,
        updatedAt: new Date().toISOString(),
      };
      writeData(rules);
    }
  },

  delete(id: string): void {
    const rules = readData().filter(r => r.id !== id);
    writeData(rules);
  },
};