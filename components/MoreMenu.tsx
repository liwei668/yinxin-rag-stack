'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'

interface MoreMenuProps {
  llmModels: { id: string; modelId: string; name: string; isDefault: boolean }[]
  selectedModel: string
  onModelChange: (modelId: string) => void
  loading: boolean
}

const VOICES = [
  { value: 'Cherry', label: 'Cherry (温柔女声)' },
  { value: 'Serena', label: 'Serena (知性女声)' },
  { value: 'Ethan', label: 'Ethan (沉稳男声)' },
  { value: 'Chelsie', label: 'Chelsie (活力女声)' },
]

export default function MoreMenu({ llmModels, selectedModel, onModelChange, loading }: MoreMenuProps) {
  const [open, setOpen] = useState(false)
  const [currentVoice, setCurrentVoice] = useState('Cherry')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getConfigGroup', data: { group: 'voice' } }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.voiceConfig?.voiceName) setCurrentVoice(data.voiceConfig.voiceName)
      })
      .catch(() => {})
  }, [])

  const handleVoiceChange = async (voice: string) => {
    setCurrentVoice(voice)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateConfigGroup',
          data: { group: 'voice', values: { voiceName: voice } },
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        console.error('保存音色失败:', data.error || res.statusText)
        alert('保存音色失败: ' + (data.error || '未知错误'))
      } else {
        console.log('音色已保存:', voice)
      }
    } catch (e) {
      console.error('保存音色失败:', e)
      alert('保存音色失败: ' + String(e))
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="p-1.5 hover:bg-gray-200 rounded-md"
        onClick={() => setOpen(!open)}
      >
        <ChevronDown size={20} className="text-gray-600" />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-1 flex flex-col gap-0.5 z-50 w-36">
          <select
            className="w-full p-1.5 pr-6 border border-gray-200 rounded-md bg-white text-xs shadow-sm focus:outline-none"
            disabled={loading || llmModels.length === 0}
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
          >
            {llmModels.map(model => (
              <option key={model.id} value={model.modelId}>
                {model.name}
                {model.isDefault ? '（默认）' : ''}
              </option>
            ))}
          </select>
          <select
            className="w-full p-1.5 pr-6 border border-gray-200 rounded-md bg-white text-xs shadow-sm focus:outline-none"
            value={currentVoice}
            onChange={(e) => handleVoiceChange(e.target.value)}
          >
            {VOICES.map(v => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
