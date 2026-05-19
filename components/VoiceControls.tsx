'use client';
import React, { useState, useEffect, useRef } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { SpeechService } from '../src/services/textToSpeechService'
import VoiceInput from './VoiceInput'
import { splitTextIntoChunks } from '../src/contexts/VoiceBroadcastContext'

interface VoiceControlsProps {
  message: string
  setMessage: (message: string) => void
  loading: boolean
  playingMessageId: number | null
  setPlayingMessageId: (id: number | null) => void
  messages: any[]
}

const VoiceControls: React.FC<VoiceControlsProps> = ({
  message,
  setMessage,
  loading,
  playingMessageId,
  setPlayingMessageId,
  messages
}) => {
  const playingMessageIdRef = useRef<number | null>(null)
  
  // 处理语音识别结果
  const handleVoiceTranscript = (text: string) => {
    console.log('收到语音识别结果:', text);
    setMessage(prev => {
      const newMessage = prev ? prev + ' ' + text : text;
      console.log('更新后的输入框内容:', newMessage);
      return newMessage;
    });
  };

  // 文字转语音功能
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
        console.log(`[VoiceControls] 播放文本，长度 ${text.length}，分割为 ${chunks.length} 段`)
        
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

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      SpeechService.stopAudio()
    }
  }, [])

  return (
    <div className="flex items-center gap-1">
      <VoiceInput 
        onTranscript={handleVoiceTranscript} 
        disabled={loading}
      />
    </div>
  )
}

export default VoiceControls