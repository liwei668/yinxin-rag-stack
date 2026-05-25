import { useEffect, useRef, useCallback } from 'react';
import { useUser } from '../contexts/UserContext';

interface SSEOptions {
  onMessage?: (event: string, data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export function useSSE(options: SSEOptions = {}) {
  const { user } = useUser();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);

  const connect = useCallback(() => {
    if (!user || isConnectingRef.current || eventSourceRef.current?.readyState === EventSource.OPEN) {
      return;
    }

    isConnectingRef.current = true;

    try {
      // 创建 SSE 连接
      const eventSource = new EventSource('/api/sse');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('[SSE] 连接成功');
        isConnectingRef.current = false;
        options.onConnect?.();
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[SSE] 收到消息:', event.type, data);
        } catch {
          // 非 JSON 数据，忽略
        }
      };

      // 监听自定义事件
      eventSource.addEventListener('connected', (event: MessageEvent) => {
        console.log('[SSE] 已连接:', JSON.parse(event.data));
      });

      eventSource.addEventListener('conversation:updated', (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        console.log('[SSE] 对话更新:', data);
        options.onMessage?.('conversation:updated', data);
      });

      eventSource.addEventListener('message:new', (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        console.log('[SSE] 新消息:', data);
        options.onMessage?.('message:new', data);
      });

      eventSource.addEventListener('conversation:deleted', (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        console.log('[SSE] 对话删除:', data);
        options.onMessage?.('conversation:deleted', data);
      });

      eventSource.addEventListener('heartbeat', () => {
        // 心跳保活，无需处理
      });

      eventSource.onerror = (error) => {
        console.error('[SSE] 连接错误:', error);
        isConnectingRef.current = false;
        options.onError?.(error);
        
        // 自动重连
        if (eventSource.readyState === EventSource.CLOSED) {
          eventSource.close();
          reconnectTimerRef.current = setTimeout(() => {
            console.log('[SSE] 尝试重连...');
            connect();
          }, 5000);
        }
      };
    } catch (error) {
      console.error('[SSE] 创建连接失败:', error);
      isConnectingRef.current = false;
    }
  }, [user, options]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      options.onDisconnect?.();
    }
  }, [options]);

  useEffect(() => {
    if (user) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [user, connect, disconnect]);

  return {
    connect,
    disconnect,
    isConnected: typeof EventSource !== 'undefined' && eventSourceRef.current?.readyState === EventSource.OPEN,
  };
}
