'use client'

import { useState, useRef, useEffect } from 'react'
import { Copy, Volume2, VolumeX, RefreshCw, MoreHorizontal, Download, Trash2 } from 'lucide-react'
import { SpeechService } from '../../src/services/textToSpeechService'
import { convertAndDownload } from '../../utils/messageUtils'
import { splitTextIntoChunks } from '../../src/contexts/VoiceBroadcastContext'

interface MessageActionsProps {
  messageId: string
  content: string
  index: number
  onRegenerate?: (messageId: string) => void
  onDelete?: (messageId: string) => void
}

export default function MessageActions({
  messageId,
  content,
  index,
  onRegenerate,
  onDelete
}: MessageActionsProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [audioProgress, setAudioProgress] = useState<{ current: number; total: number } | null>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const isPlayingRef = useRef(false)

  // 点击外部关闭更多菜单
  useEffect(() => {
    if (!showMore) return
    const handleClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMore(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMore])

  // 播放/暂停
  const handlePlay = async () => {
    if (isPlaying) {
      SpeechService.stopAudio()
      setIsPlaying(false)
      isPlayingRef.current = false
      setAudioProgress(null)
    } else {
      setIsPlaying(true)
      isPlayingRef.current = true
      setAudioProgress({ current: 0, total: 1 })
      
      try {
        // 使用分段器处理长文本
        const chunks = splitTextIntoChunks(content, 500)
        console.log(`[MessageActions] 播放文本，长度 ${content.length}，分割为 ${chunks.length} 段`)
        
        // 逐段播放
        for (let i = 0; i < chunks.length; i++) {
          // 检查是否被停止
          if (!isPlayingRef.current) break
          
          setAudioProgress({ current: i + 1, total: chunks.length })
          await SpeechService.synthesizeAndPlay(chunks[i])
        }
        
        // 播放结束
        setIsPlaying(false)
        isPlayingRef.current = false
        setAudioProgress(null)
      } catch (error) {
        console.error('播放失败:', error)
        setIsPlaying(false)
        isPlayingRef.current = false
        setAudioProgress(null)
        alert('语音播放失败')
      }
    }
  }

  // 复制
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      // 轻提示
      const toast = document.createElement('div')
      toast.className = 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm z-50'
      toast.textContent = '已复制'
      document.body.appendChild(toast)
      setTimeout(() => document.body.removeChild(toast), 1500)
    } catch (error) {
      console.error('复制失败:', error)
    }
  }

  // 刷新/重生成
  const handleRefresh = async () => {
    if (isRefreshing || !onRegenerate) return
    setIsRefreshing(true)
    try {
      await onRegenerate(messageId)
    } catch (error) {
      console.error('刷新失败:', error)
      alert('重新生成失败')
    } finally {
      setIsRefreshing(false)
    }
  }

  // 导出文档
  const handleExport = (format: 'md' | 'docx' | 'pdf') => {
    convertAndDownload(content, format)
    setShowMore(false)
  }

  // 删除
  const handleDelete = () => {
    if (confirm('确定删除这条消息？')) {
      onDelete?.(messageId)
      setShowMore(false)
    }
  }

  return (
    <div className="relative mt-2">
      {/* 操作按钮组 - 始终显示 */}
      <div className="flex items-center gap-1">
        {/* 复制 */}
        <button
          onClick={handleCopy}
          className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
          title="复制"
          aria-label="复制"
        >
          <Copy size={16} className="text-gray-500" />
        </button>

        {/* 播放/暂停 */}
        <button
          onClick={handlePlay}
          className={`p-1.5 rounded-md transition-colors ${isPlaying ? 'bg-blue-100' : 'hover:bg-gray-100'} relative`}
          title={isPlaying ? '暂停' : '播放'}
          aria-label={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? (
            <VolumeX size={16} className="text-blue-600" />
          ) : (
            <Volume2 size={16} className="text-gray-500" />
          )}
          {/* 分段播放进度指示器 */}
          {audioProgress && audioProgress.total > 1 && (
            <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center">
              {audioProgress.current}/{audioProgress.total}
            </span>
          )}
        </button>

        {/* 刷新 */}
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className={`p-1.5 hover:bg-gray-100 rounded-md transition-colors ${isRefreshing ? 'opacity-50' : ''}`}
          title="重新生成"
          aria-label="重新生成"
        >
          <RefreshCw size={16} className={`text-gray-500 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>

        {/* 更多 */}
        <div className="relative" ref={moreRef}>
          <button
            onClick={() => setShowMore(!showMore)}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
            title="更多"
            aria-label="更多"
          >
            <MoreHorizontal size={16} className="text-gray-500" />
          </button>

          {showMore && (
            <div className="absolute left-0 bottom-full mb-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px] z-50">
              <div className="px-3 py-1 text-xs text-gray-400 border-b border-gray-100">导出为</div>
              <button
                onClick={() => handleExport('docx')}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <Download size={14} /> Word
              </button>
              <button
                onClick={() => handleExport('pdf')}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <Download size={14} /> PDF
              </button>
              <button
                onClick={() => handleExport('md')}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <Download size={14} /> Markdown
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={handleDelete}
                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <Trash2 size={14} /> 删除
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
