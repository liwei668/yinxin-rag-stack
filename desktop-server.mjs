// 桌面控制 WebSocket + HTTP 服务端
// 同时提供 WebSocket（给 Python 客户端）和 HTTP（给 Next.js API）接口
import { startDesktopWebSocketServer } from '../src/services/agent/desktopManager';
import http from 'http';

const PORT = parseInt(process.env.DESKTOP_WS_PORT || '8765');
const wss = startDesktopWebSocketServer(PORT);

// HTTP 接口（供 Next.js API 路由调用）
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/status')) {
    const params = new URL(req.url || '/', `http://localhost:${PORT}`).searchParams;
    const userId = params.get('userId') || '';
    // 通过动态导入获取 desktopManager
    import('../src/services/agent/desktopManager').then(({ desktopManager }) => {
      const isConnected = desktopManager.isClientConnected(userId);
      const clientInfo = desktopManager.getClientInfo(userId);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ connected: isConnected, client: clientInfo }));
    });
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/screenshot')) {
    const params = new URL(req.url || '/', `http://localhost:${PORT}`).searchParams;
    const userId = params.get('userId') || '';
    import('../src/services/agent/desktopManager').then(async ({ desktopManager }) => {
      const base64 = await desktopManager.getScreenshot(userId);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ screenshot: base64 }));
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/command') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { userId, command } = JSON.parse(body);
        import('../src/services/agent/desktopManager').then(async ({ desktopManager }) => {
          const result = await desktopManager.sendCommand(userId, command);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: true, result }));
        }).catch(err => {
          res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: err.message }));
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// 将 WebSocket server 附加到 HTTP server
wss.on('connection', (ws, req) => {
  // WebSocket 连接由 desktopWebSocketServer 处理
});

console.log(`[DesktopServer] HTTP+WebSocket 服务已启动: http://localhost:${PORT}`);
