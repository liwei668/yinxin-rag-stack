'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Maximize2, X, RefreshCw, Globe, ChevronRight, Plus } from 'lucide-react'

interface WorkspacePanelProps {
  onClose: () => void
  taskId?: string
  userId?: string
  currentUrl?: string
  onUrlChange?: (url: string) => void
}

export default function WorkspacePanel({ onClose, taskId, userId: propUserId, currentUrl: propUrl, onUrlChange: propOnUrlChange }: WorkspacePanelProps) {
  const [inputUrl, setInputUrl] = useState<string>('')
  const [taskScreenshot, setTaskScreenshot] = useState<string | null>(null)
  const [isManualMode, setIsManualMode] = useState(false) // 默认自动模式（Agent 全自动运行）
  const [inputText, setInputText] = useState('')
  const [lastAction, setLastAction] = useState<string>('')
  const [liveFrame, setLiveFrame] = useState<string | null>(null) // 实时帧
  const [showInputPopup, setShowInputPopup] = useState(false) // 输入浮层
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [internalUrl, setInternalUrl] = useState<string>('')
  const [currentTitle, setCurrentTitle] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const screencastRef = useRef<EventSource | null>(null) // screencast SSE
  const inputPopupRef = useRef<HTMLInputElement>(null)

  // 支持外部传入的 URL
  const currentUrl = propUrl !== undefined ? propUrl : internalUrl
  const setCurrentUrl = (url: string) => {
    if (propOnUrlChange) {
      propOnUrlChange(url)
    } else {
      setInternalUrl(url)
    }
  }

  const getDefaultUserId = () => {
    if (typeof window === 'undefined') return 'anonymous'
    try {
      const raw = localStorage.getItem('yinxin_agl_user')
      if (raw) { const user = JSON.parse(raw); if (user?.id) return user.id; }
    } catch {}
    return 'anonymous'
  }

  const baseUserId = propUserId || getDefaultUserId()
  const sharedBrowserUserId = `${baseUserId}_shared`

  // 刷新浏览器状态
  const refreshBrowser = useCallback(async (userId: string) => {
    if (!userId) return

    try {
      setLoading(true)
      
      // 获取浏览器状态
      const statusRes = await fetch(`/api/agent/browser?action=status&userId=${userId}`)
      const statusData = await statusRes.json()

      const validUrl = statusData.url && statusData.url !== 'about:blank' && statusData.url.trim() !== ''
      if (validUrl) {
        setCurrentUrl(statusData.url)
        setCurrentTitle(statusData.title || statusData.url)
      }

      // 获取截图
      const screenshotRes = await fetch('/api/agent/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'screenshot', userId }),
      })
      const screenshotData = await screenshotRes.json()

      if (screenshotData.success && screenshotData.screenshot) {
        setLiveFrame(screenshotData.screenshot)
      }
    } catch (error) {
      console.error('刷新失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // 导航到指定URL
  const handleNavigate = async () => {
    if (!inputUrl || !currentUserId) return

    try {
      setLoading(true)
      const res = await fetch('/api/agent/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'navigate', url: inputUrl, userId: currentUserId }),
      })
      const data = await res.json()
      if (data.success) {
        setInputUrl('')
        setTimeout(() => {
          refreshBrowser(currentUserId)
        }, 1000)
      }
    } catch (error) {
      console.error('导航失败:', error)
    } finally {
      setLoading(false)
    }
  }

  // 点击截图操作
  const handleScreenshotClick = useCallback(async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!currentUserId) return

    const img = e.currentTarget
    const rect = img.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const displayWidth = rect.width
    const displayHeight = rect.height

    setLoading(true)
    setLastAction(`点击坐标(${Math.round(x)}, ${Math.round(y)})...`)

    try {
      const res = await fetch('/api/agent/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cdpClick',
          userId: currentUserId,
          x, y,
          displayWidth,
          displayHeight,
        }),
      })
      const data = await res.json()
      setLastAction(data.success ? `✅ ${data.message}` : `❌ ${data.error || '点击失败'}`)

      // 点击后自动弹出输入浮层
      setShowInputPopup(true)

      // 点击后刷新截图
      await new Promise(r => setTimeout(r, 500))
      refreshBrowser(currentUserId)
    } catch (err: any) {
      setLastAction(`❌ 点击错误: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [isManualMode, currentUserId, refreshBrowser])

  // 输入文字
  const handleTypeText = useCallback(async () => {
    if (!inputText.trim() || !currentUserId) return

    setLastAction('输入文字...')
    try {
      const res = await fetch('/api/agent/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cdpType', userId: currentUserId, text: inputText }),
      })
      const data = await res.json()
      setLastAction(data.success ? `✅ ${data.message}` : `❌ ${data.error || '输入失败'}`)
      if (data.success) { setInputText(''); setShowInputPopup(false); }

      await new Promise(r => setTimeout(r, 300))
      refreshBrowser(currentUserId)
    } catch (err: any) {
      setLastAction(`❌ 输入错误: ${err.message}`)
    }
  }, [inputText, currentUserId, refreshBrowser])

  // 按键操作
  const handleKeyPress = useCallback(async (key: string) => {
    if (!currentUserId) return

    setLastAction(`按键: ${key}...`)
    try {
      const res = await fetch('/api/agent/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cdpType', userId: currentUserId, text: key }),
      })
      const data = await res.json()
      setLastAction(data.success ? `✅ 按键 ${key}` : `❌ ${data.error}`)

      await new Promise(r => setTimeout(r, 300))
      refreshBrowser(currentUserId)
    } catch (err: any) {
      setLastAction(`❌ 按键错误: ${err.message}`)
    }
  }, [currentUserId, refreshBrowser])

  // 滚轮操作
  const handleScreenshotWheel = useCallback(async (e: React.WheelEvent<HTMLImageElement>) => {
    if (!currentUserId) return

    const img = e.currentTarget
    const rect = img.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const displayWidth = rect.width
    const displayHeight = rect.height
    const deltaY = e.deltaY > 0 ? 3 : -3

    try {
      await fetch('/api/agent/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cdpScroll',
          userId: currentUserId,
          x, y,
          deltaX: 0,
          deltaY,
          displayWidth,
          displayHeight,
        }),
      })
    } catch {}
  }, [isManualMode, currentUserId])

  // 处理URL输入回车
  const handleUrlKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNavigate()
    }
  }

  // 处理文字输入回车
  const handleTextKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTypeText()
    }
  }

  // 启动实时屏幕流
  const startScreencast = useCallback((userId: string) => {
    if (!userId) return

    // 关闭旧的 screencast
    if (screencastRef.current) {
      screencastRef.current.close()
      screencastRef.current = null
    }

    const es = new EventSource(`/api/agent/browser?action=screencast&userId=${userId}`)
    screencastRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'screencast' && data.frame) {
          setLiveFrame(data.frame)
        }
      } catch {}
    }

    es.onerror = () => {
      es.close()
      screencastRef.current = null
      // 3秒后重连
      setTimeout(() => {
        if (currentUserId === userId) {
          startScreencast(userId)
        }
      }, 3000)
    }
  }, [currentUserId])

  // 处理任务ID变化
  useEffect(() => {
    if (taskId) {
      fetch(`/api/agent?action=task&taskId=${taskId}`)
        .then(res => res.json())
        .then(data => {
          if (data.task && data.task.userId) {
            setCurrentUserId(data.task.userId)
            startScreencast(data.task.userId)
            refreshBrowser(data.task.userId)
          }
        })
    } else {
      // 默认使用共享浏览器
      setCurrentUserId(sharedBrowserUserId)
      startScreencast(sharedBrowserUserId)
      refreshBrowser(sharedBrowserUserId)
    }
  }, [taskId])

  // 任务截图 SSE
  useEffect(() => {
    if (!taskId) {
      setTaskScreenshot(null)
      return
    }

    const eventSource = new EventSource(`/api/agent?action=subscribe&taskId=${taskId}`)

    eventSource.onmessage = (event) => {
      try {
        const task = JSON.parse(event.data)
        if (task.plan && task.plan.length > 0) {
          const lastStep = task.plan[task.plan.length - 1]
          if (lastStep.screenshot) {
            setTaskScreenshot(lastStep.screenshot)
          }
        }
        if (task.result?.screenshot) {
          setTaskScreenshot(task.result.screenshot)
        }
      } catch {}
    }

    return () => {
      eventSource.close()
    }
  }, [taskId])

  // 清理
  useEffect(() => {
    return () => {
      if (screencastRef.current) {
        screencastRef.current.close()
        screencastRef.current = null
      }
    }
  }, [])

  const displayScreenshot = liveFrame || taskScreenshot

  const handleFullscreen = () => {
    if (!containerRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current.requestFullscreen()
    }
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full bg-gray-100">
      {/* 浏览器顶部栏 - 模拟真实浏览器 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 shrink-0 shadow-sm">
        {/* 浏览器控件 */}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400 cursor-pointer hover:bg-red-500 transition-colors" title="关闭" />
          <div className="w-3 h-3 rounded-full bg-yellow-400 cursor-pointer hover:bg-yellow-500 transition-colors" title="最小化" />
          <div className="w-3 h-3 rounded-full bg-green-400 cursor-pointer hover:bg-green-500 transition-colors" title="最大化" />
        </div>
        
        {/* 地址栏 - 模拟真实浏览器地址栏 */}
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full border border-gray-200">
          <Globe className="w-4 h-4 text-gray-500 shrink-0" />
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={handleUrlKeyPress}
            placeholder="搜索或输入网址"
            className="flex-1 bg-transparent text-gray-800 text-sm focus:outline-none"
          />
          <button
            onClick={handleNavigate}
            className="p-1 rounded hover:bg-gray-200 text-gray-500 transition-colors"
            title="前往"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        
        {/* 浏览器控制按钮 */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => currentUserId && refreshBrowser(currentUserId)}
            className="p-2 rounded hover:bg-gray-200 text-gray-600 transition-colors"
            title="刷新"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleFullscreen}
            className="p-2 rounded hover:bg-gray-200 text-gray-600 transition-colors"
            title="全屏"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-gray-200 text-gray-600 transition-colors"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 浏览器标签页 */}
      <div className="flex items-center gap-1 px-3 py-1 bg-gray-100 border-b border-gray-200">
        <div className="flex items-center gap-2 px-4 py-1.5 bg-white border border-gray-200 rounded-t-lg shadow-sm">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium text-gray-800 truncate max-w-[200px]">{currentTitle || '新标签页'}</span>
        </div>
        <button
          onClick={async () => {
            if (!currentUserId) return
            try {
              await fetch('/api/agent/browser', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'newTab', userId: currentUserId }),
              })
              refreshBrowser(currentUserId)
            } catch {}
          }}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
          title="新建标签页"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* 人工输入浮层（点击截图后自动弹出） */}
      {isManualMode && showInputPopup && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 bg-white rounded-lg shadow-xl border border-gray-200 px-4 py-3 flex items-center gap-2" style={{minWidth: 320}}>
          <input
            ref={inputPopupRef}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); handleTypeText(); } }}
            placeholder="输入文字后按回车..."
            className="flex-1 text-sm px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
            autoFocus
          />
          <button onClick={handleTypeText} className="px-3 py-1.5 bg-emerald-500 text-white rounded text-sm hover:bg-emerald-600">发送</button>
          <button onClick={() => setShowInputPopup(false)} className="p-1 text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      {/* 浏览器显示区域 */}
      <div className="flex-1 relative min-h-0 bg-white overflow-hidden">
        {displayScreenshot ? (
          <div className="w-full h-full flex items-center justify-center relative">
            <img
              src={displayScreenshot}
              alt="浏览器内容"
              className="w-full h-full object-contain bg-gray-900"
              onClick={handleScreenshotClick}
              onWheel={handleScreenshotWheel}
              draggable={false}
            />
            {/* 透明键盘捕获层 - 覆盖在截图上方，捕获键盘输入并转发到真实浏览器 */}
            <textarea
              className="absolute inset-0 w-full h-full opacity-0 cursor-text resize-none"
              style={{ fontSize: '16px', caretColor: 'transparent' }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onKeyDown={async (e) => {
                e.stopPropagation()
                if (!currentUserId) return
                const key = e.key
                // 特殊键：立即发送
                if (['Enter','Backspace','Tab','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Delete','PageUp','PageDown','Home','End','F5','F12'].includes(key)) {
                  e.preventDefault()
                  try {
                    await fetch('/api/agent/browser', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'cdpType', userId: currentUserId, text: key }),
                    })
                  } catch {}
                } else if (e.ctrlKey || e.metaKey) {
                  // Ctrl/Cmd 组合键不处理，让浏览器默认行为
                }
                // 普通字符（英文/数字）等 compositionend 处理
              }}
              onCompositionEnd={async (e) => {
                // 中文输入法确认后触发，获取最终文字
                const text = e.data
                if (!text || !currentUserId) return
                const target = e.target as HTMLTextAreaElement
                target.value = ''
                try {
                  await fetch('/api/agent/browser', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'cdpType', userId: currentUserId, text: text }),
                  })
                } catch {}
              }}
              onInput={async (e) => {
                // 仅处理非 IME 输入（英文、数字等直接输入）
                if ((e.nativeEvent as InputEvent).isComposing) return
                const target = e.target as HTMLTextAreaElement
                const value = target.value
                if (!value || !currentUserId) return
                target.value = ''
                try {
                  await fetch('/api/agent/browser', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'cdpType', userId: currentUserId, text: value }),
                  })
                } catch {}
              }}
            />
          </div>
        ) : (
          <div className="w-full h-full bg-gray-50 flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-3">🌐</div>
              <div className="text-gray-600 text-base">真实浏览器</div>
              <div className="text-gray-500 text-sm mt-1">Powered by Playwright</div>
              {!currentUserId && (
                <div className="text-gray-400 text-xs mt-2">正在初始化浏览器...</div>
              )}
              {currentUserId && !currentUrl && !taskId && (
                <div className="mt-4">
                  <button
                    onClick={() => {
                      setInputUrl('https://www.baidu.com');
                      handleNavigate();
                    }}
                    className="px-4 py-2 bg-emerald-500 text-white rounded hover:bg-emerald-600 transition-colors"
                  >
                    打开百度首页
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* 加载状态 */}
        {loading && (
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-md text-sm text-gray-700 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-emerald-500 animate-spin" />
            <span>加载中...</span>
          </div>
        )}
        
        {/* 浏览器状态栏 */}
        <div className="absolute bottom-0 left-0 right-0 bg-gray-50 border-t border-gray-200 px-4 py-1.5 text-xs text-gray-600 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span>已连接</span>
            {liveFrame && <span className="text-emerald-600 font-medium">● 实时</span>}
          </div>
          <div className="flex items-center gap-4">
            {currentUrl && (
              <span className="truncate max-w-[400px] font-mono">{currentUrl}</span>
            )}
            <span>Playwright</span>
          </div>
        </div>
      </div>
    </div>
  )
}
