// 桌面控制 WebSocket 服务端
// 由于 Next.js App Router 不原生支持 WebSocket，这里创建一个独立的服务
// 可以通过 `node desktop-ws-server.js` 单独启动，或集成到自定义 server 中
import { WebSocketServer, WebSocket } from 'ws';
import { desktopManager } from './desktopManager';

export function startDesktopWebSocketServer(port = 8765): WebSocketServer {
  const wss = new WebSocketServer({ port });
  console.log(`[DesktopWS] WebSocket 服务已启动: ws://localhost:${port}`);

  wss.on('connection', (ws: WebSocket) => {
    let clientId: string | null = null;

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'register') {
          // 客户端注册
          clientId = desktopManager.registerClient(
            message.userId,
            message.screenResolution || { width: 1920, height: 1080 },
            message.os || 'unknown',
            async (cmd: any) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(cmd));
              }
            }
          ).id;

          ws.send(JSON.stringify({ type: 'registered', clientId, status: 'ok' }));
          console.log(`[DesktopWS] 客户端注册成功: ${message.userId} (${clientId})`);
        } else if (message.type === 'heartbeat') {
          if (clientId) {
            desktopManager.handleMessage(clientId, message);
          }
        } else if (message.type === 'command_response' || message.type === 'screenshot') {
          if (clientId) {
            desktopManager.handleMessage(clientId, message);
          }
        }
      } catch (e) {
        console.error('[DesktopWS] 消息处理失败:', e);
      }
    });

    ws.on('close', () => {
      if (clientId) {
        desktopManager.unregisterClient(clientId);
      }
    });

    ws.on('error', (err) => {
      console.error('[DesktopWS] WebSocket 错误:', err);
    });
  });

  return wss;
}
