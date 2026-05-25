'use client';
import React, { useState, useEffect, useRef } from 'react'
import { useChat } from '../src/contexts/ChatContext'
import { correctSpelling } from '../src/services/spellCorrectionService'
import { useUser } from '../src/contexts/UserContext'
import { SpeechService } from '../src/services/textToSpeechService'
import { useVoiceBroadcast } from '../src/contexts/VoiceBroadcastContext'
import agentTaskService from '../src/services/agentTaskService'
import MessageList from './message/MessageList'
import InputControl from './InputControl'
import AgentTaskManager from './AgentTaskManager'
import { UploadedFile, formatFileSize } from '../utils/fileUtils'
import MTCGuide from './MTCGuide'
import { MTCConfig, MTC_DEFAULT_CONFIG } from '../utils/mtc'

interface TaskInputProps {
  showAgentPanel?: boolean
  onCloseAgentPanel?: () => void
}

const TaskInput: React.FC<TaskInputProps> = ({ showAgentPanel, onCloseAgentPanel }) => {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState('deepseek-v4-flash')
  const [modelProviders, setModelProviders] = useState<Record<string, string>>({}) // modelId -> provider
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [showDownloadMenu, setShowDownloadMenu] = useState<number | null>(null)
  const [screenshotHistory, setScreenshotHistory] = useState<UploadedFile[]>([])
  const [playingMessageId, setPlayingMessageId] = useState<number | null>(null)
  const [mtcOpen, setMtcOpen] = useState(false)
  const [mtcConfig, setMtcConfig] = useState<MTCConfig>({ ...MTC_DEFAULT_CONFIG })
  const [mtcTargetContent, setMtcTargetContent] = useState<string | null>(null)
  const { currentConversation, addMessageToCurrentConversation, conversations, setConversations, currentConversationId, sendMessage } = useChat()
  const { speakText, stopSpeaking, isEnabled: voiceEnabled } = useVoiceBroadcast()
  const accumulatedTextRef = useRef('')
  const streamAbortControllerRef = useRef<AbortController | null>(null)

  // 辅助函数：添加消息并同步到服务器
  const addMessageAndSync = async (message: { id?: string; role: 'user' | 'assistant'; content: string }) => {
    const messageWithId = {
      ...message,
      id: message.id || crypto.randomUUID(),
    };
    
    // 先更新本地状态（立即显示）
    addMessageToCurrentConversation(messageWithId);
    
    // 然后同步到服务器
    if (currentConversationId && sendMessage) {
      try {
        await sendMessage(currentConversationId, messageWithId);
      } catch (err) {
        console.error('同步消息失败:', err);
      }
    }
    
    return messageWithId.id;
  };

  // 重新生成消息
  const regenerateMessage = async (messageId: string) => {
    if (!currentConversation) return

    // 找到消息索引
    const messageIndex = currentConversation.messages.findIndex(m => m.id === messageId)
    if (messageIndex === -1) return

    // 获取该消息之前的历史（包括用户消息）
    const history = currentConversation.messages.slice(0, messageIndex)
    
    // 找到最近的用户消息索引
    let userMessageIndex = -1
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user') {
        userMessageIndex = i
        break
      }
    }
    
    if (userMessageIndex === -1) return
    
    // 截取到该用户消息的历史
    const truncatedHistory = history.slice(0, userMessageIndex + 1)

    setLoading(true)
    try {
      const response = await fetch('/api/chat/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          conversationId: currentConversation.id,
          history: truncatedHistory,
          model: selectedModel
        })
      })

      if (!response.ok) {
        throw new Error('重新生成失败')
      }

      const data = await response.json()
      
      // 更新消息内容
      setConversations(prev => prev.map(conv => {
        if (conv.id === currentConversationId) {
          const updatedMessages = [...conv.messages]
          updatedMessages[messageIndex] = {
            ...updatedMessages[messageIndex],
            content: data.content
          }
          return { ...conv, messages: updatedMessages }
        }
        return conv
      }))
    } catch (error) {
      console.error('重新生成失败:', error)
      alert('重新生成失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  // 删除消息
  const deleteMessage = (messageId: string) => {
    if (!currentConversation) return
    
    setConversations(prev => prev.map(conv => {
      if (conv.id === currentConversationId) {
        return {
          ...conv,
          messages: conv.messages.filter(m => m.id !== messageId)
        }
      }
      return conv
    }))
  }

  // 监听"转为文档编辑"按钮触发的 MTC 引导
  useEffect(() => {
    const handler = (e: Event) => {
      const { content } = (e as CustomEvent).detail
      if (content) {
        setMtcTargetContent(content)
        setMtcOpen(true)
      }
    }
    window.addEventListener('mtc-trigger', handler)
    return () => window.removeEventListener('mtc-trigger', handler)
  }, [])
  const { user } = useUser()

  const messages = currentConversation?.messages || []

  // 监听 Agent 触发事件
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setMessage(detail);
      }
    };
    window.addEventListener('agent-trigger', handler);
    return () => window.removeEventListener('agent-trigger', handler);
  }, [])

  const handleScreenshotUpload = (files: UploadedFile[]) => {
    setUploadedFiles(prev => [...prev, ...files])
    setScreenshotHistory(prev => [...prev, ...files])
  }

  const handleSend = async () => {
    if ((message.trim() || uploadedFiles.length > 0) && !loading) {
      // 设置加载状态，让用户看到正在处理
      setLoading(true)
      
      // 发送新消息时先停止当前语音播放，避免 blob 中断
      SpeechService.stopAudio()
      setPlayingMessageId(null)
      
      let content = message.trim()
      
      // 拼写纠正：处理同音错字和手滑错字
      const correctedContent = content.split(' ').map(word => correctSpelling(word)).join(' ')
      
      // 先保存上传的文件信息，然后清空上传列表
      const filesToProcess = [...uploadedFiles]
      setMessage('')
      setUploadedFiles([])
      
      let userMessage
      
      // 处理上传的文件
      if (filesToProcess.length > 0) {
        // 检查是否有图片文件
        const imageFiles = filesToProcess.filter(f => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(f.name || ''))
        const nonImageFiles = filesToProcess.filter(f => !/\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(f.name || ''))
        
        // 如果有图片，使用 Vision API 处理所有图片
        if (imageFiles.length > 0) {
          // 立即添加用户消息，列出所有图片
          const imageNames = imageFiles.map(f => f.name).join(', ')
          userMessage = {
            role: 'user' as const,
            content: correctedContent ? `${correctedContent}\n[图片: ${imageNames}]` : `[图片: ${imageNames}]`
          }
          await addMessageAndSync(userMessage)
          
          try {
            // 处理所有图片
            const visionResults: string[] = []
            
            for (let i = 0; i < imageFiles.length; i++) {
              const imageFile = imageFiles[i]
              const formData = new FormData()
              
              if (imageFile.filename) {
                const fileResponse = await fetch(`/uploads/${imageFile.filename}`)
                const blob = await fileResponse.blob()
                formData.append('file', blob, imageFile.name)
              } else if (imageFile.url) {
                formData.append('imageUrl', imageFile.url)
              }
              
              const imagePrompt = imageFiles.length === 1 
                ? (correctedContent || '请识别并描述这张图片的内容')
                : `请识别并描述第${i + 1}张图片的内容：${correctedContent || ''}`
              
              formData.append('message', imagePrompt)
              formData.append('model', selectedModel)
              
              const visionResponse = await fetch('/api/vision', {
                method: 'POST',
                body: formData
              })
              
              if (!visionResponse.ok) {
                const errorData = await visionResponse.json()
                throw new Error(errorData.error || `第${i + 1}张图片识别失败`)
              }
              
              const visionData = await visionResponse.json()
              visionResults.push(`【图片${i + 1}】${visionData.content}`)
            }
            
            // 合并所有图片识别结果
            const combinedContent = visionResults.join('\n\n')
            const assistantMessage = {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: combinedContent
            }
            await addMessageAndSync(assistantMessage)
            setLoading(false)
            return
          } catch (error) {
            console.error('Vision API Error:', error)
            const errorMessage = {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: `抱歉，图片识别失败：${error instanceof Error ? error.message : '未知错误'}`
            }
            await addMessageAndSync(errorMessage)
            setLoading(false)
            return
          }
        }
        
        // 非图片文件的处理
        const fileInfos = []
        
        for (const file of nonImageFiles) {
          if (file.filename) {
            try {
              const parseResponse = await fetch('/api/parse', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ filename: file.filename, type: file.type }),
              })
              
              if (parseResponse.ok) {
                const parseData = await parseResponse.json()
                fileInfos.push(`[文件: ${file.name}]\n${parseData.content.substring(0, 1000)}${parseData.content.length > 1000 ? '...' : ''}`)
              } else {
                fileInfos.push(`[文件: ${file.name} (${formatFileSize(file.size)})]`)
              }
            } catch (error) {
              console.error('Error parsing file:', error)
              fileInfos.push(`[文件: ${file.name} (${formatFileSize(file.size)})]`)
            }
          } else {
            fileInfos.push(`[文件: ${file.name} (${formatFileSize(file.size)})]`)
          }
        }
        
        const fileInfo = fileInfos.join('\n\n')
        const finalContent = correctedContent ? `${correctedContent}\n\n${fileInfo}` : fileInfo
        
        userMessage = {
          role: 'user' as const,
          content: finalContent
        }
        
        await addMessageAndSync(userMessage)
      } else {
        // 没有文件上传的情况
        userMessage = {
          role: 'user' as const,
          content: correctedContent
        }
        
        await addMessageAndSync(userMessage)
      }
      // loading 状态已在函数开始时设置

      // 尝试使用Agent处理任务
      const agentHandled = await agentTaskService.handleAgentTask(correctedContent, addMessageAndSync, user)

      if (!agentHandled) {
        // 正常聊天流程
        try {
          let data: any

          // 判断是否是本地 Ollama 模型（直接从浏览器调用，不经过后端）
          if (modelProviders[selectedModel] === 'ollama') {
            const ollamaMessages = [
              { role: 'system', content: '你是全能AI顾问，具备多重专业能力。' },
              ...messages.filter((m: any) => m.role === 'user' || m.role === 'assistant').map((m: any) => ({ role: m.role, content: m.content })),
              { role: 'user', content: userMessage.content }
            ]
            const ollamaRes = await fetch('http://localhost:11434/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: selectedModel, messages: ollamaMessages, stream: false })
            })
            if (!ollamaRes.ok) {
              throw new Error(`Ollama 请求失败 (${ollamaRes.status}): ${ollamaRes.statusText}`)
            }
            const ollamaData = await ollamaRes.json()
            data = { choices: [{ message: { role: 'assistant', content: ollamaData.message?.content || ollamaData.response || '' } }] }
          } else {
            // 云端模型：使用流式响应
            if (streamAbortControllerRef.current) {
              streamAbortControllerRef.current.abort();
            }
            const abortController = new AbortController();
            streamAbortControllerRef.current = abortController;
            
            // 创建一条空消息用于流式更新
            const assistantMessage: any = {
              role: 'assistant' as const,
              content: ''
            };
            const tempMessageId = addMessageToCurrentConversation(assistantMessage);
            accumulatedTextRef.current = '';
            
            // 发送流式请求
            const response = await fetch('/api/chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: userMessage.content,
                history: messages,
                model: selectedModel,
                conversationId: currentConversation?.id || null,
                stream: true, // 启用流式输出
              }),
              signal: abortController.signal,
            });

            if (!response.ok) {
              let errorMsg = '请求失败'
              try {
                const errorData = await response.json()
                errorMsg = errorData.error || `服务器错误 (${response.status})`
              } catch (_) {
                errorMsg = `服务器错误 (${response.status})`
              }
              throw new Error(errorMsg)
            }

            if (!response.body) {
              throw new Error('响应体为空');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            try {
              console.log('[流式输出] 开始读取流式响应');
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  console.log('[流式输出] 流读取完成');
                  break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || !trimmed.startsWith('data:')) continue;

                  const data = trimmed.slice(5).trim();
                  if (data === '[DONE]') {
                    console.log('[流式输出] 收到 [DONE]');
                    break;
                  }

                  try {
                    const parsed = JSON.parse(data);
                    console.log('[流式输出] 收到数据:', parsed);
                    
                    if (parsed.type === 'start') {
                      // 流开始，可以忽略
                      continue;
                    }
                    
                    if (parsed.type === 'error') {
                      throw new Error(parsed.error || '处理失败');
                    }
                    
                    if (parsed.content) {
                      // 累积文本
                      accumulatedTextRef.current += parsed.content;
                      console.log('[流式输出] 累积文本长度:', accumulatedTextRef.current.length);
                      
                      // 实时更新消息内容
                      setConversations(prev => prev.map(conv => {
                        if (conv.id === currentConversationId) {
                          const updatedMessages = [...conv.messages];
                          const msgIndex = updatedMessages.findIndex(m => m.id === tempMessageId);
                          console.log('[流式输出] 查找消息ID:', tempMessageId, '找到索引:', msgIndex);
                          if (msgIndex !== -1) {
                            updatedMessages[msgIndex] = {
                              ...updatedMessages[msgIndex],
                              content: accumulatedTextRef.current
                            };
                          }
                          return { ...conv, messages: updatedMessages };
                        }
                        return conv;
                      }));
                      
                      // 如果启用了语音播报，实时触发语音合成
                      if (voiceEnabled && parsed.content.trim()) {
                        speakText(parsed.content);
                      }
                    }
                  } catch (e) {
                    console.error('[流式输出] 解析错误:', e);
                    // 忽略解析错误
                  }
                }
              }
            } finally {
              reader.releaseLock();
              streamAbortControllerRef.current = null;
            }
            
            // 流结束后，同步完整消息到服务器
            if (tempMessageId && currentConversationId) {
              try {
                await sendMessage(currentConversationId, {
                  id: tempMessageId,
                  role: 'assistant',
                  content: accumulatedTextRef.current
                });
              } catch (err) {
                console.error('同步AI回复失败:', err);
              }
            }
            
            // 流结束后，如果启用了语音播报，停止
            if (voiceEnabled) {
              // 留一小段时间让最后的语音播放完
            }
          }
        } catch (error) {
          console.error('Error:', error)
          const errorMessage = {
            role: 'assistant' as const,
            content: `抱歉，${error instanceof Error ? error.message : '请求处理失败，请稍后再试。'}`
          }
          await addMessageAndSync(errorMessage)
        } finally {
          setLoading(false)
        }
      } else {
        setLoading(false)
      }
    }
  }

  return (
    <>
    <div className="mt-24">
      {/* Agent 任务选择弹窗 */}
      {showAgentPanel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onCloseAgentPanel}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">🤖 Agent 任务</h3>
              <button onClick={onCloseAgentPanel} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <p className="text-sm text-gray-500 mb-4">选择一个任务类型，或输入自定义任务描述</p>
            <div className="space-y-2 mb-4">
              {
                [
                  { icon: '🔍', label: '搜索信息', desc: '在指定网站搜索内容', prompt: '帮我搜索' },
                  { icon: '🌐', label: '打开网页', desc: '访问指定网站并提取信息', prompt: '帮我打开' },
                  { icon: '📝', label: '填写表单', desc: '自动填写网页表单', prompt: '帮我填写' },
                  { icon: '📊', label: '数据采集', desc: '从网页采集结构化数据', prompt: '帮我采集' },
                  { icon: '📤', label: '发布内容', desc: '自动发布到指定平台', prompt: '帮我发布' },
                  { icon: '🎬', label: '制作视频', desc: '自动制作宣传视频', prompt: '帮我制作' },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setMessage(item.prompt);
                      onCloseAgentPanel?.();
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
                  >
                    <span className="text-xl">{item.icon}</span>
                    <div>
                      <div className="text-sm font-medium text-gray-800">{item.label}</div>
                      <div className="text-xs text-gray-400">{item.desc}</div>
                    </div>
                  </button>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* 聊天消息区域 */}
      <MessageList
        messages={messages}
        loading={loading}
        playingMessageId={playingMessageId}
        setPlayingMessageId={setPlayingMessageId}
        showDownloadMenu={showDownloadMenu}
        setShowDownloadMenu={setShowDownloadMenu}
        user={user}
        onRegenerate={regenerateMessage}
        onDelete={deleteMessage}
      />

      {/* 输入控制区域 */}
      <InputControl
        message={message}
        setMessage={setMessage}
        loading={loading}
        setLoading={setLoading}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        modelProviders={modelProviders}
        setModelProviders={setModelProviders}
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        screenshotHistory={screenshotHistory}
        setScreenshotHistory={setScreenshotHistory}
        onScreenshotUpload={handleScreenshotUpload}
        playingMessageId={playingMessageId}
        setPlayingMessageId={setPlayingMessageId}
        messages={messages}
        currentConversation={currentConversation}
        onSend={handleSend}
      />

      {/* Agent 任务管理 */}
      <AgentTaskManager
        message={message}
        loading={loading}
        setLoading={setLoading}
        addMessageToCurrentConversation={addMessageToCurrentConversation}
        user={user}
      />
    </div>

      {/* MTC 引导弹窗 - 由"转为文档编辑"按钮触发 */}
      <MTCGuide
        open={mtcOpen}
        onClose={() => { setMtcOpen(false); setMtcTargetContent(null); }}
        onComplete={(config) => {
          setMtcConfig(config)
          setMtcOpen(false)
          // 用配置打开编辑器
          if (mtcTargetContent) {
            // 通过 MessageList 的 props 传递配置和内容
            window.dispatchEvent(new CustomEvent('mtc-open-editor', {
              detail: { content: mtcTargetContent, config }
            }))
            setMtcTargetContent(null)
          }
        }}
        onSkip={() => {
          setMtcConfig({ ...MTC_DEFAULT_CONFIG })
          setMtcOpen(false)
          if (mtcTargetContent) {
            window.dispatchEvent(new CustomEvent('mtc-open-editor', {
              detail: { content: mtcTargetContent, config: MTC_DEFAULT_CONFIG }
            }))
            setMtcTargetContent(null)
          }
        }}
      />
    </>
  )
}

export default TaskInput