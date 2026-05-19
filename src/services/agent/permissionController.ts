// 权限控制器 - 管理沙箱白名单和操作权限
import { RiskLevel, SandboxConfig, ToolDefinition } from './types';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SANDBOX_CONFIG_FILE = path.join(DATA_DIR, 'sandbox-config.json');

const DEFAULT_CONFIG: SandboxConfig = {
  allowedDomains: [],       // 空数组表示允许所有域名
  blockedDomains: [],       // 黑名单（可手动添加需要屏蔽的域名）
  maxExecutionTime: 600,    // 10分钟
  maxStepsPerTask: 50,
  screenshotInterval: 3000, // 3秒
  autoApproveSafe: true,
};

class PermissionController {
  private config: SandboxConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): SandboxConfig {
    try {
      if (fs.existsSync(SANDBOX_CONFIG_FILE)) {
        const raw = fs.readFileSync(SANDBOX_CONFIG_FILE, 'utf8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.error('[Agent] 加载沙箱配置失败，使用默认配置:', e);
    }
    return { ...DEFAULT_CONFIG };
  }

  saveConfig() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(SANDBOX_CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (e) {
      console.error('[Agent] 保存沙箱配置失败:', e);
    }
  }

  // 检查 URL 是否在白名单中
  isUrlAllowed(url: string): { allowed: boolean; reason?: string } {
    try {
      const hostname = new URL(url).hostname;

      // 检查黑名单
      if (this.config.blockedDomains.some(d => hostname.includes(d))) {
        return { allowed: false, reason: `域名 "${hostname}" 在黑名单中` };
      }

      // 检查白名单
      if (this.config.allowedDomains.length > 0) {
        const isAllowed = this.config.allowedDomains.some(d => hostname === d || hostname.endsWith('.' + d));
        if (!isAllowed) {
          return { allowed: false, reason: `域名 "${hostname}" 不在白名单中` };
        }
      }

      return { allowed: true };
    } catch {
      return { allowed: false, reason: '无效的 URL' };
    }
  }

  // 检查操作是否需要人工确认
  needsApproval(riskLevel: RiskLevel, toolDef: ToolDefinition): boolean {
    if (riskLevel === 'dangerous') return true;
    if (riskLevel === 'manual') return true;
    if (toolDef.requiresApproval) return true;
    return false;
  }

  // 获取配置
  getConfig(): SandboxConfig {
    return { ...this.config };
  }

  // 更新配置
  updateConfig(updates: Partial<SandboxConfig>) {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  // 添加白名单域名
  addAllowedDomain(domain: string) {
    if (!this.config.allowedDomains.includes(domain)) {
      this.config.allowedDomains.push(domain);
      this.saveConfig();
    }
  }

  // 移除白名单域名
  removeAllowedDomain(domain: string) {
    this.config.allowedDomains = this.config.allowedDomains.filter(d => d !== domain);
    this.saveConfig();
  }

  // 添加黑名单域名
  addBlockedDomain(domain: string) {
    if (!this.config.blockedDomains.includes(domain)) {
      this.config.blockedDomains.push(domain);
      this.saveConfig();
    }
  }
}

export const permissionController = new PermissionController();
export default permissionController;
