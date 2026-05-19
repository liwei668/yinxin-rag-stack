// 桌面控制管理器 - 通过WebSocket与本地Python客户端通信
import { v4 as uuidv4 } from 'uuid';

export interface DesktopClient {
  id: string;
  userId: string;
  connectedAt: string;
  lastHeartbeat: string;
  screenResolution: { width: number; height: number };
  os: string;
}

export type DesktopCommand =
  | { action: 'click'; x: number; y: number; button?: 'left' | 'right' | 'double' }
  | { action: 'type'; text: string; clearFirst?: boolean }
  | { action: 'hotkey'; keys: string[] }
  | { action: 'screenshot' }
  | { action: 'scroll'; direction: 'up' | 'down'; amount: number }
  | { action: 'drag'; fromX: number; fromY: number; toX: number; toY: number }
  | { action: 'key_press'; key: string };

type CommandCallback = (response: any) => void;
type ScreenshotCallback = (base64: string) => void;

class DesktopManager {
  private clients: Map<string, { info: DesktopClient; sendCommand: (cmd: any) => Promise<any> }> = new Map();
  private pendingCommands: Map<string, { resolve: CommandCallback; reject: (err: Error) => void; timeout: NodeJS.Timeout }> = new Map();
  private screenshotCallbacks: Map<string, ScreenshotCallback> = new Map();
  private commandIdCounter = 0;

  // 注册客户端连接
  registerClient(userId: string, screenResolution: { width: number; height: number }, os: string, sendCommand: (cmd: any) => Promise<any>): DesktopClient {
    const id = uuidv4();
    const client: DesktopClient = {
      id,
      userId,
      connectedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      screenResolution,
      os,
    };
    this.clients.set(id, { info: client, sendCommand });
    console.log(`[DesktopManager] 客户端已连接: ${userId} (${os}, ${screenResolution.width}x${screenResolution.height})`);
    return client;
  }

  // 注销客户端
  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      console.log(`[DesktopManager] 客户端已断开: ${client.info.userId}`);
      this.clients.delete(clientId);
    }
  }

  // 处理客户端发来的消息
  handleMessage(clientId: string, message: any): void {
    if (message.type === 'heartbeat') {
      const client = this.clients.get(clientId);
      if (client) client.info.lastHeartbeat = new Date().toISOString();
    } else if (message.type === 'command_response') {
      const pending = this.pendingCommands.get(message.commandId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingCommands.delete(message.commandId);
        pending.resolve(message.data);
      }
    } else if (message.type === 'screenshot') {
      // 通知所有等待截图的回调
      for (const [id, cb] of this.screenshotCallbacks) {
        cb(message.data);
        this.screenshotCallbacks.delete(id);
      }
    }
  }

  // 发送命令到客户端
  async sendCommand(userId: string, command: DesktopCommand, timeoutMs = 10000): Promise<any> {
    const clientEntry = Array.from(this.clients.values()).find(c => c.info.userId === userId);
    if (!clientEntry) {
      throw new Error(`用户 ${userId} 没有连接桌面客户端`);
    }

    const commandId = `cmd_${++this.commandIdCounter}`;
    const fullCommand = { ...command, commandId };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error('桌面命令超时'));
      }, timeoutMs);

      this.pendingCommands.set(commandId, { resolve, reject, timeout });
      clientEntry.sendCommand(fullCommand).catch(err => {
        clearTimeout(timeout);
        this.pendingCommands.delete(commandId);
        reject(err);
      });
    });
  }

  // 获取截图
  async getScreenshot(userId: string): Promise<string | null> {
    try {
      const result = await this.sendCommand(userId, { action: 'screenshot' }, 5000);
      return result?.base64 || null;
    } catch {
      return null;
    }
  }

  // 注册截图回调（用于实时推送）
  onScreenshot(userId: string, callback: ScreenshotCallback): string {
    const id = uuidv4();
    this.screenshotCallbacks.set(id, callback);
    return id;
  }

  removeScreenshotCallback(id: string): void {
    this.screenshotCallbacks.delete(id);
  }

  // 查询客户端状态
  getClientInfo(userId: string): DesktopClient | null {
    const entry = Array.from(this.clients.values()).find(c => c.info.userId === userId);
    return entry?.info || null;
  }

  isClientConnected(userId: string): boolean {
    return Array.from(this.clients.values()).some(c => c.info.userId === userId);
  }

  getAllClients(): DesktopClient[] {
    return Array.from(this.clients.values()).map(c => c.info);
  }
}

export const desktopManager = new DesktopManager();
