'use client';
import React, { useRef, useEffect, useState } from 'react'
import { SpeechService } from '../../src/services/textToSpeechService'
import DocumentDrawer from '../document/DocumentDrawer'
import MessageActions from './MessageActions'
import { splitTextIntoChunks } from '../../src/contexts/VoiceBroadcastContext'

interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  mtcAutoImport?: boolean
}

interface MessageListProps {
  messages: Message[]
  loading: boolean
  playingMessageId: number | null
  setPlayingMessageId: (id: number | null) => void
  showDownloadMenu: number | null
  setShowDownloadMenu: (id: number | null) => void
  user: any
  onRegenerate?: (messageId: string) => void
  onDelete?: (messageId: string) => void
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  loading,
  playingMessageId,
  setPlayingMessageId,
  showDownloadMenu,
  setShowDownloadMenu,
  user,
  onRegenerate,
  onDelete
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const playingMessageIdRef = useRef<number | null>(null)
  const [docDrawerOpen, setDocDrawerOpen] = useState(false)
  const [docContent, setDocContent] = useState('')

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // MTC 完成后打开编辑器
  useEffect(() => {
    const handler = (e: Event) => {
      const { content } = (e as CustomEvent).detail
      if (content) {
        setDocContent(content)
        setDocDrawerOpen(true)
      }
    }
    window.addEventListener('mtc-open-editor', handler)
    return () => window.removeEventListener('mtc-open-editor', handler)
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleTextToSpeech = async (text: string, messageId: number) => {
    try {
      if (playingMessageIdRef.current === messageId) {
        SpeechService.stopAudio()
        setPlayingMessageId(null)
        playingMessageIdRef.current = null
      } else {
        setPlayingMessageId(messageId)
        playingMessageIdRef.current = messageId
        
        // 使用分段器处理长文本
        const chunks = splitTextIntoChunks(text, 500)
        console.log(`[MessageList] 播放文本，长度 ${text.length}，分割为 ${chunks.length} 段`)
        
        // 逐段播放
        for (let i = 0; i < chunks.length; i++) {
          // 检查是否被停止
          if (playingMessageIdRef.current !== messageId) break
          await SpeechService.synthesizeAndPlay(chunks[i])
        }
        
        // 播放结束
        setPlayingMessageId(null)
        playingMessageIdRef.current = null
      }
    } catch (error) {
      console.error('文字转语音失败:', error)
      setPlayingMessageId(null)
      playingMessageIdRef.current = null
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        // 降级方案：使用 textarea 复制
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
    } catch (error) {
      console.error('复制失败:', error)
    }
  }

  // 渲染 LaTeX 公式
  // LaTeX 降级：KaTeX 不可用时转为 Unicode 纯文本
  const latexToPlainText = (latex: string): string => {
    return latex
      .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1/$2)')
      .replace(/\\sqrt\{([^}]*)\}/g, '√($1)')
      .replace(/\\sqrt\[(\d+)\]\{([^}]*)\}/g, 'ⁿ√($2)')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\pm/g, '±')
      .replace(/\\neq/g, '≠')
      .replace(/\\leq/g, '≤')
      .replace(/\\geq/g, '≥')
      .replace(/\\approx/g, '≈')
      .replace(/\\infty/g, '∞')
      .replace(/\\pi/g, 'π')
      .replace(/\\alpha/g, 'α')
      .replace(/\\beta/g, 'β')
      .replace(/\\gamma/g, 'γ')
      .replace(/\\delta/g, 'δ')
      .replace(/\\theta/g, 'θ')
      .replace(/\\lambda/g, 'λ')
      .replace(/\\sigma/g, 'σ')
      .replace(/\\omega/g, 'ω')
      .replace(/\\phi/g, 'φ')
      .replace(/\\angle/g, '∠')
      .replace(/\\triangle/g, '△')
      .replace(/\\perp/g, '⊥')
      .replace(/\\parallel/g, '∥')
      .replace(/\\cdot/g, '·')
      .replace(/\^(\{[^}]*\}|.)/g, (_, exp) => {
        const content = exp.startsWith('{') ? exp.slice(1, -1) : exp
        return content.split('').map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[parseInt(c)] || c).join('')
      })
      .replace(/_(\{[^}]*\}|.)/g, (_, sub) => {
        const content = sub.startsWith('{') ? sub.slice(1, -1) : sub
        return content.split('').map(c => '₀₁₂₃₄₅₆₇₈₉'[parseInt(c)] || c).join('')
      })
  }

  const renderLatex = (text: string, displayMode: boolean = false) => {
    if (typeof window !== 'undefined' && (window as any).katex) {
      try {
        const html = (window as any).katex.renderToString(text, {
          displayMode,
          throwOnError: false,
          output: 'html'
        });
        return <span dangerouslySetInnerHTML={{ __html: html }} />;
      } catch (e) {
        // KaTeX 渲染失败，降级为纯文本
        return <span className="text-red-500">{latexToPlainText(text)}</span>;
      }
    }
    // KaTeX 未加载，降级为 Unicode 纯文本
    return <span className={displayMode ? 'font-mono bg-gray-100 px-2 py-1' : ''}>{latexToPlainText(text)}</span>;
  };

  // 渲染行内 Markdown 格式（加粗、斜体、行内代码、链接、行内公式）
  const renderInline = (text: string) => {
    // 先处理行内代码（避免内部被二次处理）
    const codeParts = text.split(/(`[^`]+`)/);
    return codeParts.map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={`code-${i}`} className="px-1.5 py-0.5 bg-gray-100 text-pink-600 text-sm rounded font-mono">{part.slice(1, -1)}</code>;
      }
      // 处理行内公式 $...$ 和 \(
      const formulaRegex = /\$([^$]+)\$|\\\(([^)]+)\\\)/g;
      const segments: React.ReactNode[] = [];
      let lastIndex = 0;
      let match;
      
      while ((match = formulaRegex.exec(part)) !== null) {
        if (match.index > lastIndex) {
          const beforeText = part.slice(lastIndex, match.index);
          segments.push(...processBoldItalic(beforeText, `inline-${i}-${lastIndex}`));
        }
        const formulaContent = match[1] || match[2];
        segments.push(<span key={`latex-${i}-${match.index}`} className="mx-0.5">{renderLatex(formulaContent, false)}</span>);
        lastIndex = match.index + match[0].length;
      }
      
      if (lastIndex < part.length) {
        const remainingText = part.slice(lastIndex);
        segments.push(...processBoldItalic(remainingText, `inline-${i}-${lastIndex}`));
      }
      
      return segments.length > 0 ? <span key={`part-${i}`}>{segments}</span> : <span key={`part-${i}`}></span>;
    });
  };

  // 处理加粗和斜体
  const processBoldItalic = (text: string, keyPrefix: string): React.ReactNode[] => {
    const boldItalicRegex = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/g;
    const segments: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    
    while ((match = boldItalicRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push(<span key={`${keyPrefix}-${match.index}`}>{text.slice(lastIndex, match.index)}</span>);
      }
      const content = match[0];
      if (content.startsWith('***') && content.endsWith('***')) {
        segments.push(<strong key={`${keyPrefix}-b-${match.index}`} className="font-bold italic">{content.slice(3, -3)}</strong>);
      } else if (content.startsWith('**') && content.endsWith('**')) {
        segments.push(<strong key={`${keyPrefix}-b-${match.index}`} className="font-bold">{content.slice(2, -2)}</strong>);
      } else if (content.startsWith('*') && content.endsWith('*')) {
        segments.push(<em key={`${keyPrefix}-i-${match.index}`}>{content.slice(1, -1)}</em>);
      }
      lastIndex = match.index + content.length;
    }
    
    if (lastIndex < text.length) {
      segments.push(<span key={`${keyPrefix}-rest-${lastIndex}`}>{text.slice(lastIndex)}</span>);
    }
    
    return segments;
  };

  // 渲染完整内容
  const renderContent = (content: string) => {
    if (!content || content.trim() === '') {
      return <span className="text-gray-400">无内容</span>;
    }
    
    // 简单渲染：将换行符转为 <br />
    const lines = content.split('\n');
    return (
      <>
        {lines.map((line, idx) => (
          <span key={idx}>
            {line}
            {idx < lines.length - 1 && <br />}
          </span>
        ))}
      </>
    );
  };

  const renderFormattedLine = (line: string, index: number) => {
    let cleanedLine = line.trim()
    
    // 跳过空行
    if (cleanedLine === '') {
      return <div key={index} className="h-2"></div>
    }
    
    // 识别分隔线
    if (cleanedLine === '---' || cleanedLine === '***') {
      return <hr key={index} className="my-6 border-gray-200" />
    }
    
    // 不再手动移除 ** 符号，交给 renderInline 处理
    
    // 识别排版标记（使用包含匹配）
    if (cleanedLine.includes('【标题】')) {
      const content = cleanedLine.replace('【标题】', '').trim()
      return <h1 key={index} className="text-2xl md:text-3xl font-bold text-gray-900 text-center leading-tight mt-8 mb-6">{content}</h1>
    } else if (cleanedLine.includes('【副标题】')) {
      const content = cleanedLine.replace('【副标题】', '').trim()
      return <h2 key={index} className="text-xl md:text-2xl font-semibold text-gray-800 text-left leading-snug mt-8 mb-4">{content}</h2>
    } else if (cleanedLine.includes('【正文】')) {
      const content = cleanedLine.replace('【正文】', '').trim()
      return <p key={index} className="text-base text-gray-700 text-left leading-relaxed mb-4">{content}</p>
    } else if (cleanedLine.includes('【引用】')) {
      const content = cleanedLine.replace('【引用】', '').trim()
      return <blockquote key={index} className="border-l-4 border-emerald-500 pl-4 py-1 bg-emerald-50 text-gray-700 italic text-sm leading-relaxed my-4">{renderInline(content)}</blockquote>
    } else if (cleanedLine.includes('【列表】')) {
      const content = cleanedLine.replace('【列表】', '').trim()
      return <p key={index} className="text-base text-gray-700 text-left pl-4 leading-relaxed mb-2">{renderInline(content)}</p>
    } else if (cleanedLine.includes('【注释】')) {
      const content = cleanedLine.replace('【注释】', '').trim()
      return <p key={index} className="text-xs text-gray-500 font-mono text-left leading-snug bg-gray-50 p-2 rounded mb-2">{renderInline(content)}</p>
    }
    
    // 识别文档目录
    if (cleanedLine.includes('【文档目录】')) {
      return <div key={index} className="text-lg font-bold text-gray-900 mb-3 mt-6">{cleanedLine.replace('【文档目录】', '').trim()}</div>
    }
    
    // 识别模块标题（【XXX】）
    if (cleanedLine.match(/^【[一二三四五六七八九十]+、.*】$/)) {
      return <h3 key={index} className="text-lg font-semibold text-gray-800 mt-6 mb-3 flex items-center">
        <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></span>
        {cleanedLine}
      </h3>
    }
    
    // 识别重点强调内容
    if (cleanedLine.startsWith('重点：')) {
      const content = cleanedLine.replace('重点：', '').trim()
      return <div key={index} className="bg-amber-50 border-l-4 border-amber-500 p-4 my-4 rounded-r">
        <span className="text-amber-800 font-bold">重要提示：</span>
        <span className="text-amber-700 ml-1">{renderInline(content)}</span>
      </div>
    }
    
    // 识别注释说明
    if (cleanedLine.startsWith('注：')) {
      const content = cleanedLine.replace('注：', '').trim()
      return <p key={index} className="text-xs text-gray-500 bg-gray-50 p-2 rounded mb-2">
        <span className="font-semibold">说明：</span> {content}
      </p>
    }
    
    // 识别法条/依据文本（次要文本）
    if (cleanedLine.match(/^[0-9]+\.\s/)) {
      return <p key={index} className="text-sm text-gray-700 pl-2 border-l-2 border-gray-300 mb-2">{cleanedLine}</p>
    }
    
    // 识别Markdown标题
    if (cleanedLine.match(/^#{1,6}\s/)) {
      const level = (cleanedLine.match(/^#+/) || [''])[0].length
      const content = cleanedLine.replace(/^#+/, '').trim()
      const headingClasses: Record<number, string> = {
        1: 'text-2xl md:text-3xl font-bold text-gray-900 mt-8 mb-6',
        2: 'text-xl md:text-2xl font-semibold text-gray-800 mt-8 mb-4',
        3: 'text-lg font-semibold text-gray-700 mt-6 mb-3',
        4: 'text-base font-semibold text-gray-700 mt-5 mb-2',
        5: 'text-sm font-semibold text-gray-600 mt-4 mb-2',
        6: 'text-xs font-semibold text-gray-600 mt-3 mb-1'
      }
      const className = `${headingClasses[level] || headingClasses[3]} text-left`
      
      switch(level) {
        case 1:
          return <h1 key={index} className={className}>{content}</h1>
        case 2:
          return <h2 key={index} className={className}>{content}</h2>
        case 3:
          return <h3 key={index} className={className}>{content}</h3>
        case 4:
          return <h4 key={index} className={className}>{content}</h4>
        case 5:
          return <h5 key={index} className={className}>{content}</h5>
        case 6:
          return <h6 key={index} className={className}>{content}</h6>
        default:
          return <h3 key={index} className={className}>{content}</h3>
      }
    }
    
    // 识别无序列表
    if (cleanedLine.match(/^[-•*]\s/)) {
      const content = cleanedLine.replace(/^[-•*]\s/, '').trim()
      return <li key={index} className="text-base text-gray-700 ml-6 mb-0.5 list-disc list-inside leading-relaxed">{renderInline(content)}</li>
    }
    
    // 识别有序列表
    if (cleanedLine.match(/^\d+\.\s/)) {
      const content = cleanedLine.replace(/^\d+\.\s/, '').trim()
      return <li key={index} className="text-base text-gray-700 ml-6 mb-0.5 list-decimal list-inside leading-relaxed">{renderInline(content)}</li>
    }
    
    // 其他内容（正文）
    return <p key={index} className="text-base text-gray-700 text-left leading-relaxed mb-3">{renderInline(cleanedLine)}</p>
  }

  return (
    <>
    <div className="mb-4 max-w-6xl mx-auto">
      {messages.map((msg, index) => (
        <div key={index} className="mb-4">
          {/* AI消息布局 */}
          {msg.role === 'assistant' && (
            <div className="flex items-start">
              {/* AI消息气泡 */}
              <div className="flex-1 max-w-4xl">
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 md:p-6 rounded-tl-xl">
                  <div className="mb-2">
                    <span className="text-sm font-semibold text-emerald-700">露丝</span>
                  </div>
                  <div className="text-gray-800 leading-relaxed">
                    {renderContent(msg.content)}
                  </div>
                </div>
                {/* 操作按钮 */}
                <MessageActions
                  messageId={msg.id || index.toString()}
                  content={msg.content}
                  index={index}
                  onRegenerate={onRegenerate}
                  onDelete={onDelete}
                />
              </div>
            </div>
          )}
          
          {/* 用户消息布局 */}
          {msg.role === 'user' && (
            <div className="flex items-start flex-row-reverse">
              {/* 用户消息气泡 */}
              <div className="bg-emerald-500 rounded-2xl p-3 md:p-4 rounded-tr-lg max-w-3xl [&_*]:text-white">
                <div className="leading-relaxed">
                  {renderContent(msg.content)}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
      {loading && (
        <div className="flex items-center gap-2 text-gray-600">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          <span className="text-xs md:text-sm">正在思考...</span>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
    
    {/* 文档编辑抽屉 */}
    <DocumentDrawer
      open={docDrawerOpen}
      content={docContent}
      onClose={() => setDocDrawerOpen(false)}
    />
    </>
  )
}

export default MessageList