'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react'
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

const EmailMarketingPanel = React.lazy(() => import('../components/email-marketing/EmailMarketingPanel'))
import { Globe, FileText, Code, X, PanelLeft, PanelLeftClose, MessageSquare } from 'lucide-react'
import ErrorBoundary from '../components/ErrorBoundary'
import { useUser } from '../src/contexts/UserContext'
import { useConversations } from '../src/hooks/useConversations'
import { ChatContext, ChatContextType, Message, Conversation } from '../src/contexts/ChatContext'

/** 获取当前用户 ID（与 AgentControlPanel 一致） */
function getDefaultUserId(): string {
  if (typeof window === 'undefined') return 'anonymous'
  try {
    const raw = localStorage.getItem('yinxin_agl_user')
    if (raw) { const user = JSON.parse(raw); if (user?.id) return user.id; }
  } catch {}
  return 'anonymous'
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
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null)
  const [messageToBroadcast, setMessageToBroadcast] = useState<string | null>(null)

  // 使用云端同步的 conversations hook
  const {
    conversations,
    setConversations,
    currentConversation,
    currentConversationId,
    createConversation,
    deleteConversation: deleteConversationFromServer,
    togglePin,
    renameConversation,
    selectConversation,
    sendMessage,
  } = useConversations()

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

  const createNewConversation = useCallback(async () => {
    await createConversation()
  }, [createConversation])

  const handleDeleteConversation = useCallback((id: string) => {
    setConversationToDelete(id)
    setShowDeleteConfirm(true)
  }, [])

  const confirmDeleteConversation = useCallback(async () => {
    if (conversationToDelete) {
      await deleteConversationFromServer(conversationToDelete)
      setShowDeleteConfirm(false)
      setConversationToDelete(null)
    }
  }, [conversationToDelete, deleteConversationFromServer])

  const cancelDeleteConversation = useCallback(() => {
    setShowDeleteConfirm(false)
    setConversationToDelete(null)
  }, [])

  const handleTogglePinConversation = useCallback((id: string) => {
    togglePin(id)
  }, [togglePin])

  const handleRenameConversation = useCallback((id: string, newTitle: string) => {
    const trimmedTitle = newTitle.trim().slice(0, 50)
    if (trimmedTitle) {
      renameConversation(id, trimmedTitle)
    }
  }, [renameConversation])

  const handleSelectConversation = useCallback((id: string) => {
    selectConversation(id)
  }, [selectConversation])

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
      // 没有当前对话时，创建新对话
      createNewConversation()
      return messageWithId.id
    }

    // 将消息添加到当前对话
    setConversations(prev => prev.map(conv => {
      if (conv.id === targetConversationId) {
        const updatedMessages = [...conv.messages, messageWithId]
        let updatedTitle = conv.title
        if (updatedTitle === '新对话' && message.role === 'user') {
          // AI自动提取标题，不超过10个字
          updatedTitle = message.content.slice(0, 10) + (message.content.length > 10 ? '...' : '')
        }
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

    return messageWithId.id
  }, [currentConversationId, createNewConversation, setConversations])

  const contextValue: ChatContextType = useMemo(() => ({
    conversations,
    currentConversationId,
    createNewConversation,
    selectConversation: handleSelectConversation,
    deleteConversation: handleDeleteConversation,
    currentConversation,
    addMessageToCurrentConversation,
    togglePinConversation: handleTogglePinConversation,
    renameConversation: handleRenameConversation,
    setConversations,
    sendMessage,
  }), [
    conversations,
    setConversations,
    currentConversationId,
    createNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    currentConversation,
    addMessageToCurrentConversation,
    handleTogglePinConversation,
    handleRenameConversation,
    sendMessage,
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
        
        {/* 主聊天区域 */}
        <div className="flex-1 flex overflow-hidden order-2">
          {/* 主聊天区域 */}
          <div className="flex flex-col overflow-hidden w-full">
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
                  </div>
                </>
              ) : (
                <div className="space-y-4 mb-4">
                  {/* 消息列表由 TaskInput 中的 MessageList 组件渲染 */}
                </div>
              )}
              
              <TaskInput />
            </div>
          </div>
          </div>
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