// 桌面控制 WebSocket + HTTP 服务端
// 同时提供 WebSocket（给 Python 客户端）和 HTTP（给 Next.js API）接口
// 使用方式: npx tsx desktop-server.ts
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { desktopManager } from './src/services/agent/desktopManager';

const PORT = parseInt(process.env.DESKTOP_WS_PORT || '8765');

// 创建 HTTP server
const server = http.createServer((req, res) => {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  // GET /status?userId=xxx — 查询客户端连接状态
  if (req.method === 'GET' && url.pathname === '/status') {
    const userId = url.searchParams.get('userId') || '';
    const isConnected = desktopManager.isClientConnected(userId);
    const clientInfo = desktopManager.getClientInfo(userId);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ connected: isConnected, client: clientInfo }));
    return;
  }

  // GET /screenshot?userId=xxx — 获取桌面截图
  if (req.method === 'GET' && url.pathname === '/screenshot') {
    const userId = url.searchParams.get('userId') || '';
    desktopManager.getScreenshot(userId).then(base64 => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ screenshot: base64 }));
    }).catch(() => {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: '无法获取截图' }));
    });
    return;
  }

  // POST /command — 发送命令到桌面客户端
  if (req.method === 'POST' && url.pathname === '/command') {
    let body = '';
    req.on('data', (chunk: Buffer) => body += chunk);
    req.on('end', () => {
      try {
        const { userId, command } = JSON.parse(body);
        desktopManager.sendCommand(userId, command).then(result => {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: true, result }));
        }).catch(err => {
          res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: err.message }));
        });
      } catch (e: any) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// 将 WebSocket server 附加到 HTTP server（共享同一端口）
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  let clientId: string | null = null;

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'register') {
        clientId = desktopManager.registerClient(
          message.userId,
          message.screenResolution || { width: 1920, height: 1080 },
          message.os || 'unknown',
          async (cmd: any) => {
        console.log(`[DesktopServer] 发送命令到客户端 ${message.userId}: ${cmd.action} (ws.readyState=${ws.readyState})`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'command', ...cmd }));
        } else {
          console.error(`[DesktopServer] WebSocket 未打开 (state=${ws.readyState})，无法发送命令`);
        }
      }
        ).id;

        ws.send(JSON.stringify({ type: 'registered', clientId, status: 'ok' }));
        console.log(`[DesktopServer] 客户端注册成功: ${message.userId} (${clientId})`);
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
      console.error('[DesktopServer] 消息处理失败:', e);
    }
  });

  ws.on('close', () => {
    if (clientId) {
      desktopManager.unregisterClient(clientId);
    }
  });

  ws.on('error', (err) => {
    console.error('[DesktopServer] WebSocket 错误:', err);
  });
});

server.listen(PORT, () => {
  console.log(`[DesktopServer] HTTP+WebSocket 服务已启动: http://localhost:${PORT}`);
  console.log(`[DesktopServer]   WebSocket: ws://localhost:${PORT} (Python 客户端连接)`);
  console.log(`[DesktopServer]   HTTP API:   http://localhost:${PORT}/status, /screenshot, /command`);
});
