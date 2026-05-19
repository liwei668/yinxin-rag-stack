'use client'

import { useState } from 'react'

interface PollingSettingsProps {
  config: {
    id: string
    email_address: string
    poll_enabled?: number
    poll_interval?: number
    last_poll_at?: string
  }
  onUpdate: () => void
}

const intervalOptions = [
  { value: 1, label: '1分钟' },
  { value: 2, label: '2分钟' },
  { value: 5, label: '5分钟' },
  { value: 10, label: '10分钟' },
  { value: 15, label: '15分钟' },
  { value: 30, label: '30分钟' },
  { value: 60, label: '60分钟' }
]

export default function PollingSettings({ config, onUpdate }: PollingSettingsProps) {
  const [enabled, setEnabled] = useState(config.poll_enabled === 1)
  const [interval, setInterval] = useState(config.poll_interval || 5)
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)

  const handleToggle = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/email-marketing/polling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config_id: config.id,
          poll_enabled: !enabled,
          poll_interval: interval
        })
      })
      const data = await res.json()
      if (data.success) {
        setEnabled(!enabled)
        onUpdate()
      } else {
        alert(data.error || '设置失败')
      }
    } catch (error) {
      console.error('设置失败:', error)
      alert('设置失败')
    } finally {
      setLoading(false)
    }
  }

  const handleIntervalChange = async (newInterval: number) => {
    setInterval(newInterval)
    if (enabled) {
      try {
        await fetch('/api/email-marketing/polling', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config_id: config.id,
            poll_enabled: true,
            poll_interval: newInterval
          })
        })
        onUpdate()
      } catch (error) {
        console.error('更新间隔失败:', error)
      }
    }
  }

  const handleExecuteNow = async () => {
    setExecuting(true)
    try {
      const res = await fetch('/api/email-marketing/polling/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_id: config.id })
      })
      const data = await res.json()
      if (data.success) {
        alert(data.message || '收取完成！')
        onUpdate()
      } else {
        alert(data.error || '收取失败')
      }
    } catch (error) {
      console.error('执行失败:', error)
      alert('收取失败')
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <span className={enabled ? 'text-green-600' : 'text-gray-400'}>
              {enabled ? '⏰' : '⏸️'}
            </span>
            自动收取邮件
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {enabled 
              ? `每 ${interval} 分钟自动检查新邮件，收到后自动AI处理`
              : '手动收取邮件'}
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={loading}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            enabled ? 'bg-emerald-500' : 'bg-gray-300'
          } ${loading ? 'opacity-50' : ''}`}
        >
          <span
            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
              enabled ? 'left-7' : 'left-1'
            }`}
          />
        </button>
      </div>

      {enabled && (
        <>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600">收取间隔：</span>
            <select
              value={interval}
              onChange={(e) => handleIntervalChange(parseInt(e.target.value))}
              className="text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              {intervalOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-200">
            <div className="text-xs text-gray-400">
              {config.last_poll_at 
                ? `上次收取: ${new Date(config.last_poll_at).toLocaleString('zh-CN')}`
                : '尚未执行过收取'
              }
            </div>
            <button
              onClick={handleExecuteNow}
              disabled={executing}
              className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {executing ? '收取中...' : '🔄 立即收取'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
