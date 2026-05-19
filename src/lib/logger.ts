/**
 * Yinxin.AGI.ai 统一日志工具
 * 功能：分级日志、文件存储、自动切割、敏感信息脱敏、磁盘保护
 */

import fs from 'fs';
import path from 'path';

// ==================== 类型定义 ====================

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
export type LogModule = 'AI_API' | 'AGENT' | 'BROWSER' | 'RAG' | 'SYSTEM' | 'CHAT';

export interface LogEntry {
  time: Date;
  level: LogLevel;
  module: LogModule;
  message: string;
  userId?: string;
  taskId?: string;
  extra?: Record<string, any>;
}

export interface LogConfig {
  enabled: boolean;
  level: LogLevel;
  retentionDays: number;
  maxFileSize: number; // MB
  diskThreshold: number; // %
}

// ==================== 配置 ====================

const LOG_DIR = path.join(process.cwd(), 'data', 'logs');
const CONFIG_FILE = path.join(LOG_DIR, 'config.json');

const DEFAULT_CONFIG: LogConfig = {
  enabled: true,
  level: process.env.NODE_ENV === 'production' ? 'WARN' : 'DEBUG',
  retentionDays: 3,
  maxFileSize: 10,
  diskThreshold: 90,
};

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

// 敏感信息脱敏规则
const SENSITIVE_PATTERNS = [
  { pattern: /sk-[a-zA-Z0-9]{48}/g, mask: '[OPENAI_KEY]' },
  { pattern: /\b[a-f0-9]{32}\b/g, mask: '[API_KEY]' },
  { pattern: /password["']?\s*[:=]\s*["']?[^"'\s]{6,}/gi, mask: '[PASSWORD]' },
  { pattern: /Bearer\s+[A-Za-z0-9_-]{20,}/g, mask: '[TOKEN]' },
  { pattern: /[\w.-]+@[\w.-]+\.\w+/g, mask: '[EMAIL]' },
];

// ==================== 核心类 ====================

class Logger {
  private config: LogConfig;
  private writeQueue: LogEntry[] = [];
  private writeTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.config = this.loadConfig();
    this.ensureLogDir();
    this.scheduleCleanup();
    this.scheduleWrite();
  }

  // 加载配置
  private loadConfig(): LogConfig {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      }
    } catch (e) {
      console.error('加载日志配置失败:', e);
    }
    return DEFAULT_CONFIG;
  }

  // 保存配置
  saveConfig(config: Partial<LogConfig>) {
    this.config = { ...this.config, ...config };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
  }

  // 确保日志目录存在
  private ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  }

  // 检查磁盘空间
  private async checkDiskSpace(): Promise<boolean> {
    try {
      const stats = await fs.promises.statfs(LOG_DIR);
      const freePercent = (stats.bfree / stats.blocks) * 100;
      return freePercent > (100 - this.config.diskThreshold);
    } catch {
      return true;
    }
  }

  // 敏感信息脱敏
  private sanitize(text: string): string {
    return SENSITIVE_PATTERNS.reduce(
      (t, { pattern, mask }) => t.replace(pattern, mask),
      text
    );
  }

  // 格式化日志条目（使用北京时间 UTC+8）
  private formatEntry(entry: LogEntry): string {
    // 转换为北京时间（UTC+8）
    const beijingTime = new Date(entry.time.getTime() + 8 * 60 * 60 * 1000);
    const year = beijingTime.getUTCFullYear();
    const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getUTCDate()).padStart(2, '0');
    const hours = String(beijingTime.getUTCHours()).padStart(2, '0');
    const minutes = String(beijingTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(beijingTime.getUTCSeconds()).padStart(2, '0');
    const time = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

    const parts: string[] = [`[${time}]`, `[${entry.level}]`, `[${entry.module}]`];

    if (entry.userId) parts.push(`[user:${entry.userId}]`);
    if (entry.taskId) parts.push(`[task:${entry.taskId}]`);

    parts.push(this.sanitize(entry.message));

    if (entry.extra) {
      try {
        parts.push(JSON.stringify(entry.extra));
      } catch {
        // 序列化失败则跳过 extra
      }
    }

    return parts.join(' ');
  }

  // 获取当前日志文件路径
  private getLogFile(): string {
    const date = new Date().toISOString().split('T')[0];
    return path.join(LOG_DIR, `${date}.log`);
  }

  // 检查文件大小并切割
  private async checkFileSize() {
    const logFile = this.getLogFile();

    try {
      if (!fs.existsSync(logFile)) return;

      const stats = await fs.promises.stat(logFile);
      const sizeMB = stats.size / (1024 * 1024);

      if (sizeMB >= this.config.maxFileSize) {
        const ext = path.extname(logFile);
        const base = logFile.slice(0, -ext.length);
        let index = 1;
        let newFile = `${base}_${index}${ext}`;

        while (fs.existsSync(newFile)) {
          index++;
          newFile = `${base}_${index}${ext}`;
        }

        await fs.promises.rename(logFile, newFile);
      }
    } catch {
      // 文件操作失败，跳过切割
    }
  }

  // 批量写入
  private async flushQueue() {
    if (this.writeQueue.length === 0) return;

    const diskOk = await this.checkDiskSpace();
    if (!diskOk) {
      console.error('[LOGGER] 磁盘空间不足，暂停日志写入');
      this.writeQueue = [];
      return;
    }

    await this.checkFileSize();

    const logFile = this.getLogFile();
    const content = this.writeQueue.map(e => this.formatEntry(e)).join('\n') + '\n';

    try {
      await fs.promises.appendFile(logFile, content, 'utf-8');
    } catch (e) {
      console.error('[LOGGER] 写入日志失败:', e);
    }

    this.writeQueue = [];
  }

  // 定时写入（每秒一次）
  private scheduleWrite() {
    this.writeTimer = setInterval(() => {
      this.flushQueue();
    }, 1000);
  }

  // 清理过期日志
  private async cleanupOldLogs() {
    try {
      if (!fs.existsSync(LOG_DIR)) return;

      const files = await fs.promises.readdir(LOG_DIR);
      const now = Date.now();
      const maxAge = this.config.retentionDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (!file.endsWith('.log')) continue;

        const filePath = path.join(LOG_DIR, file);
        try {
          const stats = await fs.promises.stat(filePath);

          if (now - stats.mtime.getTime() > maxAge) {
            await fs.promises.unlink(filePath);
            console.log(`[LOGGER] 清理过期日志: ${file}`);
          }
        } catch {
          // 单个文件删除失败，跳过
        }
      }
    } catch {
      // 清理失败，不影响服务
    }
  }

  // 定时清理：启动时 + 每日0点
  private scheduleCleanup() {
    // 启动时清理一次
    this.cleanupOldLogs();

    // 每日0点清理
    const scheduleNext = () => {
      const now = new Date();
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);

      const delay = next.getTime() - now.getTime();

      setTimeout(() => {
        this.cleanupOldLogs();
        scheduleNext();
      }, delay);
    };

    scheduleNext();
  }

  // 主日志方法
  log(level: LogLevel, module: LogModule, message: string, options?: {
    userId?: string;
    taskId?: string;
    extra?: Record<string, any>;
  }) {
    if (!this.config.enabled) return;
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.config.level]) return;

    const entry: LogEntry = {
      time: new Date(),
      level,
      module,
      message,
      ...options,
    };

    this.writeQueue.push(entry);

    // FATAL 级别立即写入
    if (level === 'FATAL') {
      this.flushQueue();
    }
  }

  // 便捷方法
  debug(module: LogModule, message: string, options?: { userId?: string; taskId?: string; extra?: Record<string, any> }) {
    this.log('DEBUG', module, message, options);
  }

  info(module: LogModule, message: string, options?: { userId?: string; taskId?: string; extra?: Record<string, any> }) {
    this.log('INFO', module, message, options);
  }

  warn(module: LogModule, message: string, options?: { userId?: string; taskId?: string; extra?: Record<string, any> }) {
    this.log('WARN', module, message, options);
  }

  error(module: LogModule, message: string, options?: { userId?: string; taskId?: string; extra?: Record<string, any> }) {
    this.log('ERROR', module, message, options);
  }

  fatal(module: LogModule, message: string, options?: { userId?: string; taskId?: string; extra?: Record<string, any> }) {
    this.log('FATAL', module, message, options);
  }

  // 获取配置
  getConfig(): LogConfig {
    return { ...this.config };
  }

  // 关闭
  async close() {
    if (this.writeTimer) {
      clearInterval(this.writeTimer);
    }
    await this.flushQueue();
  }
}

// 单例导出
export const logger = new Logger();

// 进程退出时关闭
process.on('SIGINT', async () => {
  await logger.close();
  process.exit(0);
});

process.on('uncaughtException', async (err) => {
  logger.fatal('SYSTEM', '未捕获异常', { extra: { stack: (err as Error).stack } });
  await logger.close();
  process.exit(1);
});
