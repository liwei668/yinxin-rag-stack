import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const DATA_PATH = path.join(process.cwd(), 'data', 'customer-archives.json');
const CUSTOMERS_DIR = path.join(process.cwd(), 'data', 'customers');

export interface CustomerProfile {
  id: string;
  customerId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  industry?: string;
  notes?: string;
  tags?: string[];
  status?: string;
  createdAt: string;
  updatedAt: string;
}

function readData(): CustomerProfile[] {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const data = fs.readFileSync(DATA_PATH, 'utf8');
      const parsed = JSON.parse(data);
      // 支持两种格式：直接数组或 { archives: [] }
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (parsed && parsed.archives && Array.isArray(parsed.archives)) {
        return parsed.archives;
      }
    }
  } catch (e) {
    console.error('Error reading customer archive data:', e);
  }
  return [];
}

function writeData(customers: CustomerProfile[]): void {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_PATH, JSON.stringify({ archives: customers }, null, 2));
}

export function readCustomerFile(customerId: string): string {
  const filePath = path.join(CUSTOMERS_DIR, `${customerId}.txt`);
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
  } catch (e) {
    console.error('Error reading customer file:', e);
  }
  return `[客户画像]
公司名称：
行业：
关注：

[对话记录]

[待办事项]
`;
}

export function writeCustomerFile(customerId: string, content: string): void {
  if (!fs.existsSync(CUSTOMERS_DIR)) {
    fs.mkdirSync(CUSTOMERS_DIR, { recursive: true });
  }
  const filePath = path.join(CUSTOMERS_DIR, `${customerId}.txt`);
  fs.writeFileSync(filePath, content);
}

export const customerArchiveStore = {
  getAll(): CustomerProfile[] {
    return readData();
  },

  findOne(id: string): CustomerProfile | undefined {
    return readData().find(c => c.id === id);
  },

  findByCustomerId(customerId: string): CustomerProfile | undefined {
    return readData().find(c => c.customerId === customerId);
  },

  findByEmail(email: string): CustomerProfile | undefined {
    return readData().find(c => c.contactEmail.toLowerCase() === email.toLowerCase());
  },

  create(data: Omit<CustomerProfile, 'id' | 'createdAt' | 'updatedAt'>): string {
    const customers = readData();
    const newCustomer: CustomerProfile = {
      id: uuidv4(),
      ...data,
      status: data.status || 'active',
      tags: data.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    customers.push(newCustomer);
    writeData(customers);
    return newCustomer.id;
  },

  update(id: string, data: Partial<CustomerProfile>): void {
    const customers = readData();
    const index = customers.findIndex(c => c.id === id);
    if (index !== -1) {
      customers[index] = {
        ...customers[index],
        ...data,
        updatedAt: new Date().toISOString(),
      };
      writeData(customers);
    }
  },

  delete(id: string): void {
    const customers = readData().filter(c => c.id !== id);
    writeData(customers);
  },
};