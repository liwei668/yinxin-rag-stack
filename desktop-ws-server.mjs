// 桌面控制 WebSocket 服务端启动脚本
import { startDesktopWebSocketServer } from './src/services/agent/desktopWebSocketServer';

const PORT = parseInt(process.env.DESKTOP_WS_PORT || '8765');
startDesktopWebSocketServer(PORT);

console.log(`[DesktopWS] 服务已启动，按 Ctrl+C 停止`);
