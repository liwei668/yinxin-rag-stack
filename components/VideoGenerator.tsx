'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface VideoGeneratorProps {
  onClose?: () => void
}

const STORAGE_KEY = 'video_gen_task'

export default function VideoGenerator({ onClose }: VideoGeneratorProps) {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('wan2.7-t2v')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [statusText, setStatusText] = useState('')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollCount, setPollCount] = useState(0)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const MAX_POLL = 240 // 最多轮询240次（8分钟）

  // 组件卸载时清理轮询
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // 恢复未完成的任务
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const { task_id, model: savedModel, timestamp } = JSON.parse(saved)
        // 24小时内有效
        if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
          setModel(savedModel)
          setLoading(true)
          setStatus('RUNNING')
          setStatusText('恢复上次任务...')
          startPolling(task_id)
        } else {
          localStorage.removeItem(STORAGE_KEY)
        }
      }
    } catch {}
  }, [])

  const startPolling = useCallback((taskId: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    setPollCount(0)

    pollRef.current = setInterval(async () => {
      setPollCount(prev => {
        if (prev >= MAX_POLL) {
          if (pollRef.current) clearInterval(pollRef.current)
          setLoading(false)
          setError('生成超时，请稍后重试')
          localStorage.removeItem(STORAGE_KEY)
          return prev
        }
        return prev + 1
      })

      try {
        const res = await fetch(`/api/video/query?task_id=${taskId}`)
        const data = await res.json()

        if (data.task_status === 'SUCCEEDED' && data.video_url) {
          if (pollRef.current) clearInterval(pollRef.current)
          setLoading(false)
          setVideoUrl(data.video_url)
          setStatus('SUCCEEDED')
          setStatusText('生成成功')
          localStorage.removeItem(STORAGE_KEY)
        } else if (data.task_status === 'FAILED') {
          if (pollRef.current) clearInterval(pollRef.current)
          setLoading(false)
          setError(data.message || '生成失败，请重试')
          localStorage.removeItem(STORAGE_KEY)
        } else {
          setStatus(data.task_status || 'RUNNING')
          setStatusText(data.task_status_text || '生成中...')
        }
      } catch (e: any) {
        console.error('轮询出错:', e)
      }
    }, 2000)
  }, [])

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return

    setError(null)
    setVideoUrl(null)
    setLoading(true)
    setStatus('PENDING')
    setStatusText('提交中...')

    try {
      const res = await fetch('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), model }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '提交失败')
        setLoading(false)
        return
      }

      const taskId = data.task_id
      // 缓存到 localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        task_id: taskId,
        model,
        timestamp: Date.now(),
      }))

      setStatusText(data.message || '任务已提交')
      startPolling(taskId)
    } catch (e: any) {
      setError('网络错误，请重试')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-lg border border-gray-200">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-800">🎬 AI 文生视频</h3>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        )}
      </div>

      {/* 输入区域 */}
      <div className="p-4 space-y-3 border-b border-gray-100">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="描述你想要生成的视频画面，例如：一只小猫在草地上追蝴蝶，阳光明媚..."
          className="w-full h-24 p-3 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          disabled={loading}
          maxLength={2500}
        />
        <div className="flex items-center gap-3">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="flex-1 p-2 border border-gray-300 rounded-lg text-sm bg-white"
            disabled={loading}
          >
            <option value="wan2.7-t2v">标准版 720P（快速）</option>
            <option value="happyhorse-1.0-t2v">高清电影版 1080P（较慢）</option>
          </select>
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || loading}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '生成中...' : '生成视频'}
          </button>
        </div>
        <p className="text-xs text-gray-400">💡 视频生成预计1-5分钟，生成后自动播放。每日限10次。</p>
      </div>

      {/* 状态/结果区域 */}
      <div className="flex-1 p-4 overflow-auto">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            ❌ {error}
          </div>
        )}

        {loading && !videoUrl && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <div className="w-8 h-8 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">{statusText}</p>
            <p className="text-xs text-gray-400">已等待 {pollCount * 2} 秒</p>
          </div>
        )}

        {videoUrl && (
          <div className="space-y-2">
            <p className="text-sm text-green-600 font-medium">✅ 视频生成成功</p>
            <video
              src={videoUrl}
              controls
              className="w-full rounded-lg bg-black"
              style={{ aspectRatio: '16/9' }}
              autoPlay
            />
            <p className="text-xs text-gray-400">⚠️ 视频链接24小时有效</p>
          </div>
        )}

        {!loading && !videoUrl && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-300">
            <div className="text-4xl mb-2">🎥</div>
            <p className="text-sm">输入描述，开始生成视频</p>
          </div>
        )}
      </div>
    </div>
  )
}
