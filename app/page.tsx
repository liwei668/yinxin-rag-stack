'use client';
import React, { useState, createContext, useContext, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../components/Sidebar'
import TopBar from '../components/TopBar'
import TaskCard from '../components/TaskCard'
import VideoGenerator from '../components/VideoGenerator'
import TaskInput from '../components/TaskInput'
import VoiceBroadcastControl from '../components/VoiceBroadcastControl'
import { VoiceBroadcastProvider } from '../src/contexts/VoiceBroadcastContext'
const DocumentUpload = React.lazy(() => import('../src/components/rag/DocumentUpload'))
const KnowledgeBaseV3 = React.lazy(() => import('../src/components/rag/KnowledgeBaseV3'))
const AccountingPanel = React.lazy(() => import('../components/accounting/AccountingPanel'))
const AgentTaskPanel = React.lazy(() => import('../src/components/agent/AgentTaskPanel'))
const WorkspacePanel = React.lazy(() => import('../src/components/agent/WorkspacePanel'))
const EmailMarketingPanel = React.lazy(() => import('../components/email-marketing/EmailMarketingPanel'))
import { Globe, FileText, Code, X, PanelLeft, PanelLeftClose, MessageSquare } from 'lucide-react'
import ErrorBoundary from '../components/ErrorBoundary'
import { useUser } from '../src/contexts/UserContext'

/** 获取当前用户 ID（与 AgentControlPanel 一致） */
function getDefaultUserId(): string {
  if (typeof window === 'undefined') return 'anonymous'
  try {
    const raw = localStorage.getItem('yinxin_agl_user')
    if (raw) { const user = JSON.parse(raw); if (user?.id) return user.id; }
  } catch {}
  return 'anonymous'
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  pinned?: boolean
  pinnedAt?: Date
}

interface ChatContextType {
  conversations: Conversation[]
  currentConversationId: string | null
  createNewConversation: () => void
  selectConversation: (id: string) => void
  deleteConversation: (id: string) => void
  currentConversation: Conversation | null
  addMessageToCurrentConversation: (message: Message) => void
  togglePinConversation: (id: string) => void
  renameConversation: (id: string, newTitle: string) => void
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

export const useChat = () => {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return context
}

const Home: React.FC = () => {
  const router = useRouter()
  const { user, isLoading } = useUser()

  // 未登录自动跳转到登录页
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [user, isLoading, router])

  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [showAccounting, setShowAccounting] = useState(false)
  const [showVideo, setShowVideo] = useState(false)
  const [showEmailMarketing, setShowEmailMarketing] = useState(false)
  const [emailMarketingHasNotification, setEmailMarketingHasNotification] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false)
  const [showAgentPanel, setShowAgentPanel] = useState(false)
  const [activeAgentQuestion, setActiveAgentQuestion] = useState<string | null>(null)
  const [showAgentWorkspace, setShowAgentWorkspace] = useState(false)
  const [activeAgentTaskId, setActiveAgentTaskId] = useState<string | null>(null)
  const [agentWorkspaceWidth, setAgentWorkspaceWidth] = useState(60) // 浏览器面板占百分比（默认60%）
  const [isResizing, setIsResizing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null)
  const [messageToBroadcast, setMessageToBroadcast] = useState<string | null>(null)

  // 监听 Agent 请求人工介入事件
  useEffect(() => {
    const handleHumanRequest = (e: any) => {
      if (e.detail?.question) {
        setActiveAgentQuestion(e.detail.question);
      }
    };
    window.addEventListener('agent-human-request', handleHumanRequest);
    return () => window.removeEventListener('agent-human-request', handleHumanRequest);
  }, []);

  // 监听 Agent 任务执行事件，自动打开工作区
  useEffect(() => {
    const handleAgentTaskStart = (e: any) => {
      if (e.detail?.taskId) {
        setActiveAgentTaskId(e.detail.taskId);
        setShowAgentWorkspace(true);
      }
    };
    window.addEventListener('agent-task-start', handleAgentTaskStart);
    return () => window.removeEventListener('agent-task-start', handleAgentTaskStart);
  }, []);

  // 监听需要播报的新消息
  useEffect(() => {
    if (messageToBroadcast) {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('voice-broadcast-message', {
          detail: { text: messageToBroadcast }
        }));
      });
      // 清除以避免重复播报
      setMessageToBroadcast(null);
    }
  }, [messageToBroadcast]);

  // 处理工作区宽度调整
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing) return;

    const containerRect = document.querySelector('.flex-1.flex.overflow-hidden.order-2')?.getBoundingClientRect();
    if (containerRect) {
      const offsetX = e.clientX - containerRect.left;
      const percent = (offsetX / containerRect.width) * 100;
      // 限制：聊天区最小20%，浏览器区最小30%
      if (percent >= 20 && percent <= 70) {
        setAgentWorkspaceWidth(percent);
      }
    }
  };

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  // 添加全局鼠标事件监听器
  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing]);

  // 防抖函数
  const debounce = (func: Function, delay: number) => {
    let timeoutId: NodeJS.Timeout
    return (...args: any[]) => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => func.apply(null, args), delay)
    }
  }

  // 防抖处理的localStorage操作
  const debouncedSaveConversations = useCallback(
    debounce((conv: Conversation[]) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('yinxin_agl_conversations', JSON.stringify(conv))
      }
    }, 500),
    []
  )

  const debouncedSaveCurrentConversation = useCallback(
    debounce((id: string | null) => {
      if (typeof window !== 'undefined') {
        if (id) {
          localStorage.setItem('yinxin_agl_current_conversation', id)
        } else {
          localStorage.removeItem('yinxin_agl_current_conversation')
        }
      }
    }, 500),
    []
  )

  // 仅在客户端加载数据
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('yinxin_agl_conversations')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          // 兼容旧数据：给没有 id 的消息自动补 id
          setConversations(parsed.map((conv: any) => ({
            ...conv,
            createdAt: new Date(conv.createdAt),
            messages: (conv.messages || []).map((msg: any) => ({
              ...msg,
              id: msg.id || crypto.randomUUID()
            }))
          })))
        } catch (e) {
          console.error('Failed to parse conversations:', e)
        }
      }
      
      const currentId = localStorage.getItem('yinxin_agl_current_conversation')
      if (currentId) {
        setCurrentConversationId(currentId)
      }
    }
  }, [])

  // 监听路由变化，当从其他页面返回时重新获取用户信息
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handlePopState = async () => {
        // 触发一个自定义事件，通知 UserContext 重新获取用户信息
        const event = new CustomEvent('refreshUser')
        window.dispatchEvent(event)
      }

      window.addEventListener('popstate', handlePopState)
      return () => {
        window.removeEventListener('popstate', handlePopState)
      }
    }
  }, [])

  useEffect(() => {
    debouncedSaveConversations(conversations)
  }, [conversations, debouncedSaveConversations])

  useEffect(() => {
    debouncedSaveCurrentConversation(currentConversationId)
  }, [currentConversationId, debouncedSaveCurrentConversation])

  const createNewConversation = useCallback(() => {
    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: '新对话',
      messages: [],
      createdAt: new Date()
    }
    setConversations(prev => [newConversation, ...prev])
    setCurrentConversationId(newConversation.id)
  }, [])

  const selectConversation = useCallback((id: string) => {
    setCurrentConversationId(id)
  }, [])

  const deleteConversation = useCallback((id: string) => {
    setConversationToDelete(id)
    setShowDeleteConfirm(true)
  }, [])

  const confirmDeleteConversation = useCallback(() => {
    if (conversationToDelete) {
      setConversations(prev => prev.filter(conv => conv.id !== conversationToDelete))
      if (currentConversationId === conversationToDelete) {
        setCurrentConversationId(null)
      }
      setShowDeleteConfirm(false)
      setConversationToDelete(null)
    }
  }, [conversationToDelete, currentConversationId])

  const cancelDeleteConversation = useCallback(() => {
    setShowDeleteConfirm(false)
    setConversationToDelete(null)
  }, [])

  const togglePinConversation = useCallback((id: string) => {
    setConversations(prev => prev.map(conv => {
      if (conv.id === id) {
        return {
          ...conv,
          pinned: !conv.pinned,
          pinnedAt: !conv.pinned ? new Date() : undefined
        }
      }
      return conv
    }))
  }, [])

  const renameConversation = useCallback((id: string, newTitle: string) => {
    const trimmedTitle = newTitle.trim().slice(0, 50)
    if (trimmedTitle) {
      setConversations(prev => prev.map(conv => {
        if (conv.id === id) {
          return { ...conv, title: trimmedTitle }
        }
        return conv
      }))
    }
  }, [])

  const currentConversation = useMemo(() => {
    return currentConversationId 
      ? conversations.find(c => c.id === currentConversationId) || null
      : null
  }, [currentConversationId, conversations])

  // 生成唯一ID（兼容移动端HTTP环境）
  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  const addMessageToCurrentConversation = useCallback((message: Message): string | undefined => {
    // 自动补 id（兼容旧数据）
    const messageWithId: Message = {
      ...message,
      id: message.id || generateId()
    }

    let targetConversationId = currentConversationId
    if (!targetConversationId) {
      // 同步创建新对话并获取 ID
      const newId = Date.now().toString()
      const newConversation: Conversation = {
        id: newId,
        title: '新对话',
        messages: [],
        createdAt: new Date()
      }
      setConversations(prev => [newConversation, ...prev])
      setCurrentConversationId(newId)
      targetConversationId = newId
    }

    let newMessageId: string | undefined;
    setConversations(prev => prev.map(conv => {
      if (conv.id === targetConversationId) {
        const updatedMessages = [...conv.messages, messageWithId]
        let updatedTitle = conv.title
        if (updatedTitle === '新对话' && message.role === 'user') {
          // AI自动提取标题，不超过10个字
          updatedTitle = message.content.slice(0, 10) + (message.content.length > 10 ? '...' : '')
        }
        
        newMessageId = messageWithId.id;
        
        return {
          ...conv,
          messages: updatedMessages,
          title: updatedTitle
        }
      }
      return conv
    }))

    // 在 setConversations 之外设置语音播报状态
    if (message.role === 'assistant') {
      setMessageToBroadcast(message.content);
    }
    
    return newMessageId;
  }, [currentConversationId])

  const contextValue: ChatContextType = useMemo(() => ({
    conversations,
    currentConversationId,
    createNewConversation,
    selectConversation,
    deleteConversation,
    currentConversation,
    addMessageToCurrentConversation,
    togglePinConversation,
    renameConversation,
    setConversations
  }), [
    conversations,
    currentConversationId,
    createNewConversation,
    selectConversation,
    deleteConversation,
    currentConversation,
    addMessageToCurrentConversation,
    togglePinConversation,
    renameConversation,
    setConversations
  ])

  // 加载中或未登录时显示加载状态
  if (isLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
    <VoiceBroadcastProvider>
    <ChatContext.Provider value={contextValue}>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        {/* 删除确认框 */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4 w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">删除对话</h3>
              <p className="text-gray-600 mb-6">确定删除对话？删除后，聊天记录将不可恢复。</p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={cancelDeleteConversation}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={confirmDeleteConversation}
                  className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* 移动端侧边栏覆盖层 */}
        {showMobileSidebar && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setShowMobileSidebar(false)}
          />
        )}
        
        {/* 移动端侧边栏 */}
        <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 md:hidden ${showMobileSidebar ? 'translate-x-0' : '-translate-x-full'}`}>
          <Sidebar 
            collapsed={false} 
            onToggle={() => setShowMobileSidebar(false)} 
            onConversationSelect={() => setShowMobileSidebar(false)}
          />
        </div>
        
        {/* 桌面端侧边栏 - 伸缩式布局，位于左侧 */}
        <div className="flex-shrink-0 order-1 md:block hidden">
          <Sidebar 
            collapsed={sidebarCollapsed} 
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
          />
        </div>
        
        {/* 主聊天区域 + 浏览器工作区（左右分栏） */}
        <div className="flex-1 flex overflow-hidden order-2">
          {/* 主聊天区域 */}
          <div className="flex flex-col overflow-hidden" style={{ width: showAgentWorkspace ? `${100 - agentWorkspaceWidth}%` : '100%', flexShrink: 0 }}>
          <div className="bg-white border-b border-gray-200 py-2 md:py-3 px-4 md:px-6 flex items-center justify-between relative">
            <div className="flex items-center gap-1 md:gap-2">
              <div className="relative group">
                <button 
                  className="p-2 hover:bg-gray-200 rounded-md flex items-center justify-center"
                  onClick={() => {
                    if (window.innerWidth < 768) {
                      setShowMobileSidebar(!showMobileSidebar)
                    } else {
                      setSidebarCollapsed(!sidebarCollapsed)
                    }
                  }}
                  style={{ minWidth: '40px' }}
                >
                  {sidebarCollapsed 
                    ? <PanelLeft size={22} className="text-gray-500" strokeWidth={1.5} />
                    : <PanelLeftClose size={22} className="text-gray-500" strokeWidth={1.5} />
                  }
                </button>
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50">
                  {sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
                </div>
              </div>
              {/* 新建对话按钮 */}
              <div className="relative group">
                <button 
                  className="p-2 hover:bg-emerald-50 rounded-md flex items-center justify-center"
                  onClick={() => {
                    createNewConversation()
                    if (window.innerWidth < 768) {
                      setShowMobileSidebar(false)
                    }
                  }}
                  style={{ minWidth: '40px' }}
                >
                  <MessageSquare size={20} className="text-gray-500 group-hover:text-emerald-500 transition-colors" />
                </button>
                {/* 自定义 Tooltip */}
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50">
                  新建对话
                </div>
              </div>
              
              {/* 语音播报控制按钮 */}
              <div className="relative group">
                <VoiceBroadcastControl />
              </div>
              
              <div className="flex items-center">
                <span className="text-green-500 font-bold text-sm md:text-lg">Yinxin.AGI</span>
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="w-full">
              {!currentConversation || currentConversation.messages.length === 0 ? (
                <>
                  <div className="text-center mb-8 md:mb-12">
                    <h1 className="text-2xl md:text-3xl font-bold mb-2">
                      <span className="text-green-500">Yinxin.AGI</span>
                    </h1>
                    <p className="text-gray-600">你的任务，交给Yinxin搞定</p>
                  </div>
                  
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-32 max-w-6xl mx-auto">
                    <TaskCard
                      title="文生视频"
                      description="AI视频生成"
                      icon={<span className="text-base">🎬</span>}
                      onClick={() => setShowVideo(true)}
                    />
                    <TaskCard
                      title="市场运营"
                      description="AI自动化营销与客户管理"
                      icon={<span className="text-base">🌐</span>}
                      onClick={() => {
                        setShowEmailMarketing(true);
                        setEmailMarketingHasNotification(false);
                      }}
                      hasNotification={emailMarketingHasNotification}
                    />
                    <TaskCard
                      title="财税法合"
                      description="财税法务合规顾问"
                      icon={<Code size={16} className="text-green-500" />}
                    />
                    <TaskCard
                      title="智能记账"
                      description="凭证报表结转"
                      icon={<span className="text-base">📒</span>}
                      onClick={() => setShowAccounting(true)}
                    />
                    <TaskCard
                      title="数据分析"
                      description="趋势分析可视化"
                      icon={<span className="text-base">📊</span>}
                      onClick={() => router.push('/stocks')}
                    />
                    <TaskCard
                      title="Agent引擎"
                      description="自动执行网页操作"
                      icon={<img src="/agent-icon.png" alt="Agent" className="w-6 h-6" />}
                      onClick={() => router.push('/agent')}
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-4 mb-4">
                  {/* 消息列表由 TaskInput 中的 MessageList 组件渲染 */}
                </div>
              )}
              
              <TaskInput showAgentPanel={showAgentPanel} onCloseAgentPanel={() => setShowAgentPanel(false)} />
            </div>
          </div>
          </div>
          
          {/* 拖拽分隔条 */}
          <div
            className={`w-1.5 cursor-col-resize flex-shrink-0 transition-colors ${isResizing ? 'bg-emerald-400' : 'bg-gray-200 hover:bg-emerald-300'}`}
            onMouseDown={handleMouseDown}
            title="拖拽调整宽度"
          />

          {/* 浏览器工作区面板 */}
          {showAgentWorkspace && (
            <div className="flex flex-col overflow-hidden border-l border-gray-200 bg-white" style={{ width: `${agentWorkspaceWidth}%`, flexShrink: 0 }}>
              {/* 面板头部 */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-500" />
                  <h3 className="font-medium text-gray-800 text-sm">浏览器</h3>
                </div>
                <button
                  onClick={() => setShowAgentWorkspace(false)}
                  className="p-1 rounded hover:bg-gray-200 text-gray-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* 浏览器内容（全高） */}
              <div className="flex-1 overflow-hidden">
                <React.Suspense fallback={<div className="flex items-center justify-center h-full text-gray-500">加载浏览器...</div>}>
                  <WorkspacePanel
                    onClose={() => setShowAgentWorkspace(false)}
                    taskId={activeAgentTaskId || undefined}
                  />
                </React.Suspense>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* 智能记账面板 */}
      {showAccounting && (
        <AccountingPanel
          isOpen={showAccounting}
          onClose={() => setShowAccounting(false)}
        />
      )}

      {/* 文生视频面板 */}
      {showVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-lg h-[500px] mx-4">
            <VideoGenerator onClose={() => setShowVideo(false)} />
          </div>
        </div>
      )}

      {/* 市场运营面板 */}
      {showEmailMarketing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-4xl h-[600px] mx-4">
            <React.Suspense fallback={<div className="flex items-center justify-center h-full text-gray-500 bg-white rounded-lg">加载市场运营面板...</div>}>
              <EmailMarketingPanel onClose={() => setShowEmailMarketing(false)} />
            </React.Suspense>
          </div>
        </div>
      )}
    </ChatContext.Provider>
    </VoiceBroadcastProvider>
    </ErrorBoundary>
  )
}

export default Home