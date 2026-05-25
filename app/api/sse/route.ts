import { NextRequest } from 'next/server';
import { withAuth } from '../../../src/middleware/withAuth';

// 全局存储 SSE 连接
const clients = new Map<string, Set<ReadableStreamDefaultController>>();

export const dynamic = 'force-dynamic';

// GET - 建立 SSE 连接
export const GET = withAuth(async (req: NextRequest & { user: any }) => {
  const userId = req.user.userId;
  
  const stream = new ReadableStream({
    start(controller) {
      // 将客户端加入用户房间
      if (!clients.has(userId)) {
        clients.set(userId, new Set());
      }
      clients.get(userId)!.add(controller);
      
      // 发送连接成功事件
      controller.enqueue(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`);
      
      // 心跳保活
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(`event: heartbeat\ndata: ${Date.now()}\n\n`);
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);
      
      // 清理
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        clients.get(userId)?.delete(controller);
        if (clients.get(userId)?.size === 0) {
          clients.delete(userId);
        }
      });
    },
    cancel(controller) {
      clients.get(userId)?.delete(controller);
      if (clients.get(userId)?.size === 0) {
        clients.delete(userId);
      }
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

// 广播消息给用户的所有设备
export function broadcastToUser(userId: string, event: string, data: any) {
  const userClients = clients.get(userId);
  if (!userClients) return;
  
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  
  userClients.forEach(controller => {
    try {
      controller.enqueue(message);
    } catch (e) {
      // 客户端已断开，忽略错误
      userClients.delete(controller);
    }
  });
}

// 广播对话更新
export function broadcastConversationUpdate(userId: string, conversation: any) {
  broadcastToUser(userId, 'conversation:updated', conversation);
}

// 广播新消息
export function broadcastNewMessage(userId: string, conversationId: string, message: any) {
  broadcastToUser(userId, 'message:new', { conversationId, message });
}

// 广播对话删除
export function broadcastConversationDeleted(userId: string, conversationId: string) {
  broadcastToUser(userId, 'conversation:deleted', { conversationId });
}
