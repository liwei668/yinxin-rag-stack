'use client';
import React, { useState, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'
import PromptSuggestions from './PromptSuggestions'
import ScreenshotTool from './ScreenshotTool'
import FileUploader from './FileUploader'
import VoiceControls from './VoiceControls'
import MoreMenu from './MoreMenu'
import ImagePreview from './ImagePreview'

/** 管理面板中的模型数据结构 */
interface LLMModel {
  id: string
  name: string
  modelId: string
  provider: string
  isEnabled: boolean
  isDefault: boolean
}

interface InputControlProps {
  message: string
  setMessage: (message: string) => void
  loading: boolean
  setLoading: (loading: boolean) => void
  selectedModel: string
  setSelectedModel: (model: string) => void
  modelProviders: Record<string, string>
  setModelProviders: (providers: Record<string, string>) => void
  uploadedFiles: any[]
  setUploadedFiles: (files: any[]) => void
  screenshotHistory: any[]
  setScreenshotHistory: (files: any[]) => void
  onScreenshotUpload: (files: any[]) => void
  playingMessageId: number | null
  setPlayingMessageId: (id: number | null) => void
  messages: any[]
  currentConversation: any
  onSend: () => void
}

const InputControl: React.FC<InputControlProps> = ({
  message,
  setMessage,
  loading,
  setLoading,
  selectedModel,
  setSelectedModel,
  modelProviders,
  setModelProviders,
  uploadedFiles,
  setUploadedFiles,
  screenshotHistory,
  setScreenshotHistory,
  onScreenshotUpload,
  playingMessageId,
  setPlayingMessageId,
  messages,
  currentConversation,
  onSend
}) => {
  // 从管理面板动态获取大语言模型列表
  const [llmModels, setLlmModels] = useState<LLMModel[]>([])

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/models')
        if (!res.ok) return
        const data = await res.json()
        // API 已经过滤，直接使用
        const enabled = (data.models || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          modelId: m.modelId,
          provider: m.provider,
          isDefault: m.isDefault,
        }))
        setLlmModels(enabled)

        // 回传 provider 信息给父组件，用于判断是否走本地 Ollama
        const providerMap: Record<string, string> = {}
        enabled.forEach((m: LLMModel) => { providerMap[m.modelId] = m.provider })
        setModelProviders(providerMap)

        // 如果当前选中的模型不在列表中，自动切换到默认模型
        const modelIds = enabled.map((m: LLMModel) => m.modelId)
        if (enabled.length > 0 && !modelIds.includes(selectedModel)) {
          const defaultModel = enabled.find((m: LLMModel) => m.isDefault)
          if (defaultModel) setSelectedModel(defaultModel.modelId)
          else setSelectedModel(enabled[0].modelId)
        }
      } catch (e) {
        console.error('获取模型列表失败:', e)
      }
    }
    fetchModels()
    // 每 30 秒刷新一次，保持与管理面板同步
    const interval = setInterval(fetchModels, 30000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // 处理输入框变化
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value)
    // 自动撑高
    const ta = e.target as HTMLTextAreaElement
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 300) + 'px'
  }

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // IME 正在组合中（拼音候选框还在），回车归输入法管，不拦截
      if (e.nativeEvent?.isComposing) return;
      e.preventDefault()
      onSend()
    }
  }

  return (
    <>
      {/* 图片预览区域 - 独立显示在输入框上方 */}
      <ImagePreview
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        screenshotHistory={screenshotHistory}
        setScreenshotHistory={setScreenshotHistory}
      />

      {/* 输入区域 */}
      <div className="max-w-6xl mx-auto">
        <div className="rounded-2xl bg-gray-50/80 shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/40 focus-within:bg-white transition-all duration-200 overflow-hidden">
          {/* 文字输入区域 - 100% 宽度 */}
          <textarea
            value={message}
            onChange={handleInputChange}
            placeholder="输入你的问题或需求..."
            className="w-full p-4 md:p-6 border-0 bg-transparent text-sm resize-none focus:outline-none"
            style={{ height: '100px', minHeight: '100px', maxHeight: '300px' }}
            onKeyDown={handleKeyDown}
          />
          
          {/* 底部工具栏 */}
          <div className="flex items-center justify-between px-3 md:px-4 py-2">
            {/* 左侧工具按钮 */}
            <div className="flex items-center gap-1">
              <FileUploader
                uploadedFiles={uploadedFiles}
                setUploadedFiles={setUploadedFiles}
                screenshotHistory={screenshotHistory}
                setScreenshotHistory={setScreenshotHistory}
                loading={loading}
                onScreenshotUpload={onScreenshotUpload}
              />
              <ScreenshotTool 
                onScreenshotUpload={onScreenshotUpload} 
                disabled={loading}
              />
              {/* 语音按钮：手机端显示 VoiceInput，桌面端显示 VoiceControls */}
              <VoiceControls
                message={message}
                setMessage={setMessage}
                loading={loading}
                playingMessageId={playingMessageId}
                setPlayingMessageId={setPlayingMessageId}
                messages={messages}
              />
            </div>

            {/* 右侧：手机端显示更多菜单，桌面端显示模型选择 */}
            <div className="flex items-center gap-1">
              {/* 手机端：更多菜单（模型+音色） */}
              <div className="md:hidden">
                <MoreMenu
                  llmModels={llmModels}
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  loading={loading}
                />
              </div>
              {/* 桌面端：模型选择下拉框 */}
              <select
                className="hidden md:block p-1.5 md:p-2 border border-gray-300 rounded-md bg-white text-xs"
                disabled={loading || llmModels.length === 0}
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {llmModels.length === 0 && (
                  <option value="">加载模型中...</option>
                )}
                {llmModels.map(model => (
                  <option key={model.id} value={model.modelId}>
                    {model.name}
                    {model.isDefault ? '（默认）' : ''}
                  </option>
                ))}
              </select>
              <button 
                className="p-1.5 md:p-2 hover:bg-gray-200 rounded-md disabled:opacity-50"
                onClick={onSend}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 size={20} className="text-gray-600 animate-spin" />
                ) : (
                  <Send size={20} className="text-gray-600" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* 提词建议区域 */}
      <div className="max-w-6xl mx-auto">
        <PromptSuggestions
          currentInput={message}
          onSelectPrompt={setMessage}
          conversationId={currentConversation?.id || null}
        />
      </div>
    </>
  )
}

export default InputControl