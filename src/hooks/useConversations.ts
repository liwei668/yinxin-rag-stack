import { useState, useEffect, useCallback } from 'react';
import { useUser } from '../contexts/UserContext';
import { useSSE } from './useSocket';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt?: Date;
  pinned?: boolean;
  pinnedAt?: Date;
}

const STORAGE_KEY = 'yinxin_agl_conversations';
const STORAGE_KEY_CURRENT = 'yinxin_agl_current_conversation';

// 从 localStorage 加载
function loadFromLocalStorage(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((conv: any) => ({
        ...conv,
        createdAt: new Date(conv.createdAt),
        updatedAt: conv.updatedAt ? new Date(conv.updatedAt) : undefined,
        pinnedAt: conv.pinnedAt ? new Date(conv.pinnedAt) : undefined,
        messages: (conv.messages || []).map((msg: any) => ({
          ...msg,
          id: msg.id || crypto.randomUUID(),
          createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
        })),
      }));
    }
  } catch (e) {
    console.error('Failed to load from localStorage:', e);
  }
  return [];
}

// 保存到 localStorage
function saveToLocalStorage(conversations: Conversation[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
}

export function useConversations() {
  const { user } = useUser();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useLocalMode, setUseLocalMode] = useState(false);

  // 初始加载 - 先尝试从 localStorage 加载
  useEffect(() => {
    const localData = loadFromLocalStorage();
    if (localData.length > 0) {
      setConversations(localData);
    }
    const savedCurrentId = localStorage.getItem(STORAGE_KEY_CURRENT);
    if (savedCurrentId) {
      setCurrentConversationId(savedCurrentId);
    }
  }, []);

  // 加载对话列表
  const loadConversations = useCallback(async () => {
    if (!user) {
      setConversations([]);
      return;
    }
    
    // 如果已经在本地模式，跳过 API 调用
    if (useLocalMode) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/conversations');
      const data = await response.json();
      
      if (data.success) {
        const loadedConversations = data.conversations.map((c: any) => ({
          ...c,
          createdAt: new Date(c.createdAt),
          updatedAt: c.updatedAt ? new Date(c.updatedAt) : undefined,
          pinnedAt: c.pinnedAt ? new Date(c.pinnedAt) : undefined,
        }));
        setConversations(loadedConversations);
        // 同时保存到 localStorage 作为备份
        saveToLocalStorage(loadedConversations);
      } else {
        // API 返回错误，切换到本地模式
        console.warn('API 加载失败，切换到本地模式:', data.error);
        setUseLocalMode(true);
        setError('云端同步暂时不可用，已切换到本地模式');
      }
    } catch (err: any) {
      console.warn('API 连接失败，切换到本地模式:', err.message);
      setUseLocalMode(true);
      setError('云端同步暂时不可用，已切换到本地模式');
    } finally {
      setIsLoading(false);
    }
  }, [user, useLocalMode]);

  // 当用户变化时尝试加载
  useEffect(() => {
    if (user && !useLocalMode) {
      loadConversations();
    }
  }, [user, loadConversations, useLocalMode]);

  // 保存到 localStorage（防抖）
  useEffect(() => {
    if (useLocalMode || conversations.length > 0) {
      saveToLocalStorage(conversations);
    }
  }, [conversations, useLocalMode]);

  // 保存当前对话 ID
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (currentConversationId) {
        localStorage.setItem(STORAGE_KEY_CURRENT, currentConversationId);
      } else {
        localStorage.removeItem(STORAGE_KEY_CURRENT);
      }
    }
  }, [currentConversationId]);

  // 创建新对话
  const createConversation = useCallback(async () => {
    const newId = Date.now().toString();
    const newConv: Conversation = {
      id: newId,
      title: '新对话',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setConversations(prev => [newConv, ...prev]);
    setCurrentConversationId(newId);
    
    // 如果不在本地模式，尝试同步到服务器
    if (!useLocalMode && user) {
      try {
        const response = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: '新对话' }),
        });
        const data = await response.json();
        if (data.success) {
          // 更新为服务器返回的 ID
          const serverId = data.conversation.id;
          setConversations(prev => prev.map(c => 
            c.id === newId ? { ...c, id: serverId } : c
          ));
          setCurrentConversationId(serverId);
        }
      } catch (err) {
        console.warn('同步到服务器失败:', err);
      }
    }
    
    return newId;
  }, [user, useLocalMode]);

  // 更新对话
  const updateConversation = useCallback(async (id: string, updates: Partial<Conversation>) => {
    // 乐观更新
    setConversations(prev => prev.map(conv => 
      conv.id === id ? { ...conv, ...updates, updatedAt: new Date() } : conv
    ));
    
    // 如果不在本地模式，尝试同步到服务器
    if (!useLocalMode && user) {
      try {
        await fetch('/api/conversations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...updates }),
        });
      } catch (err) {
        console.warn('同步到服务器失败:', err);
      }
    }
  }, [user, useLocalMode]);

  // 删除对话
  const deleteConversation = useCallback(async (id: string) => {
    // 乐观更新
    setConversations(prev => prev.filter(conv => conv.id !== id));
    
    if (currentConversationId === id) {
      setCurrentConversationId(null);
    }
    
    // 如果不在本地模式，尝试同步到服务器
    if (!useLocalMode && user) {
      try {
        await fetch(`/api/conversations?id=${id}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.warn('同步到服务器失败:', err);
      }
    }
  }, [user, useLocalMode, currentConversationId]);

  // 置顶/取消置顶
  const togglePin = useCallback(async (id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    
    const newPinned = !conv.pinned;
    await updateConversation(id, {
      pinned: newPinned,
      pinnedAt: newPinned ? new Date() : undefined,
    });
  }, [conversations, updateConversation]);

  // 重命名
  const renameConversation = useCallback(async (id: string, title: string) => {
    await updateConversation(id, { title });
  }, [updateConversation]);

  // 选择对话
  const selectConversation = useCallback((id: string | null) => {
    setCurrentConversationId(id);
  }, []);

  // 获取当前对话
  const currentConversation = conversations.find(c => c.id === currentConversationId) || null;

  // SSE 实时同步
  useSSE({
    onMessage: (event, data) => {
      if (useLocalMode) return; // 本地模式不处理 SSE
      
      switch (event) {
        case 'conversation:updated':
          setConversations(prev => {
            const exists = prev.find(c => c.id === data.id);
            if (exists) {
              return prev.map(c => c.id === data.id ? { ...data, createdAt: new Date(data.createdAt) } : c);
            } else {
              return [{ ...data, createdAt: new Date(data.createdAt) }, ...prev];
            }
          });
          break;
        case 'message:new':
          setConversations(prev => prev.map(conv => {
            if (conv.id === data.conversationId) {
              const messageExists = conv.messages.find((m: Message) => m.id === data.message.id);
              if (messageExists) return conv;
              return {
                ...conv,
                messages: [...conv.messages, { ...data.message, createdAt: new Date(data.message.createdAt) }],
                updatedAt: new Date()
              };
            }
            return conv;
          }));
          break;
        case 'conversation:deleted':
          setConversations(prev => prev.filter(c => c.id !== data.conversationId));
          if (currentConversationId === data.conversationId) {
            setCurrentConversationId(null);
          }
          break;
      }
    },
  });

  // 发送消息到服务器
  const sendMessage = useCallback(async (conversationId: string, message: Omit<Message, 'createdAt'>) => {
    if (useLocalMode || !user) {
      // 本地模式：直接更新 state
      setConversations(prev => prev.map(conv => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            messages: [...conv.messages, { ...message, createdAt: new Date() }],
            updatedAt: new Date()
          };
        }
        return conv;
      }));
      return;
    }
    
    // 检查 conversationId 是否是有效的 MongoDB ObjectId（24位十六进制）
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(conversationId);
    if (!isValidObjectId) {
      // 本地创建的对话（时间戳ID），不同步到服务器
      return;
    }
    
    try {
      const response = await fetch('/api/conversations/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message }),
      });
      const data = await response.json();
      if (!data.success) {
        console.error('发送消息失败:', data.error);
      }
    } catch (err) {
      console.error('发送消息失败:', err);
    }
  }, [user, useLocalMode]);

  return {
    conversations,
    setConversations,
    currentConversation,
    currentConversationId,
    isLoading,
    error,
    useLocalMode,
    createConversation,
    updateConversation,
    deleteConversation,
    togglePin,
    renameConversation,
    selectConversation,
    sendMessage,
    refresh: loadConversations,
  };
}
