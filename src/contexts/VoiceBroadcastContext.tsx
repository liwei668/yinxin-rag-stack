'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import SpeechService from '../services/textToSpeechService';

interface VoiceBroadcastContextType {
  isEnabled: boolean;
  isPlaying: boolean;
  enableVoiceBroadcast: () => void;
  disableVoiceBroadcast: () => void;
  toggleVoiceBroadcast: () => void;
  speakText: (text: string) => void;
  stopSpeaking: () => void;
  getProgress: () => { current: number; total: number } | null;
  flushPendingText: () => void;
}

const VoiceBroadcastContext = createContext<VoiceBroadcastContextType | undefined>(undefined);

export const useVoiceBroadcast = () => {
  const context = useContext(VoiceBroadcastContext);
  if (!context) {
    throw new Error('useVoiceBroadcast must be used within VoiceBroadcastProvider');
  }
  return context;
};

interface VoiceBroadcastProviderProps {
  children: React.ReactNode;
}

// 文本分段器：智能将长文本拆分成不超过500字符的小段
export const splitTextIntoChunks = (text: string, maxLength: number = 500): string[] => {
  if (!text || text.length === 0) return [];
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  const sentences: string[] = [];
  
  // 第一步：按句子分割（保留分隔符）
  const sentenceEndings = /([。！？.!?\n]+)/g;
  const parts = text.split(sentenceEndings);
  
  let currentSentence = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    // 如果遇到句子结束符
    if (/[。！？.!?\n]+/.test(part)) {
      currentSentence += part;
      sentences.push(currentSentence);
      currentSentence = '';
    } else {
      currentSentence += part;
    }
  }
  
  // 处理最后一部分
  if (currentSentence.trim()) {
    sentences.push(currentSentence);
  }

  // 第二步：将句子组合成不超过maxLength的块
  let currentChunk = '';
  
  for (const sentence of sentences) {
    // 如果单个句子就超过maxLength
    if (sentence.length > maxLength) {
      // 先保存当前chunk（如果有）
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      // 将超长句子按固定长度分割
      const chars = sentence.split('');
      let tempChunk = '';
      
      for (const char of chars) {
        tempChunk += char;
        if (tempChunk.length >= maxLength) {
          // 在单词边界或标点符号处分割
          const lastPunctuation = Math.max(
            tempChunk.lastIndexOf('，'),
            tempChunk.lastIndexOf('、'),
            tempChunk.lastIndexOf(' ')
          );
          
          if (lastPunctuation > maxLength * 0.7) {
            chunks.push(tempChunk.slice(0, lastPunctuation + 1));
            tempChunk = tempChunk.slice(lastPunctuation + 1);
          } else {
            chunks.push(tempChunk);
            tempChunk = '';
          }
        }
      }
      
      // 保存剩余部分
      if (tempChunk.trim()) {
        currentChunk = tempChunk;
      }
    } 
    // 如果加上这个句子会超过maxLength
    else if ((currentChunk + sentence).length > maxLength) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  // 保存最后一个chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.length > 0);
};

export const VoiceBroadcastProvider: React.FC<VoiceBroadcastProviderProps> = ({ children }) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const isEnabledRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const speakQueueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);
  const pendingTextRef = useRef('');
  const lastSpeakTimeRef = useRef(0);
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const STREAMING_CHUNK_SIZE = 80; // 降低阈值，收到80字符就立即处理
  const FLUSH_TIMEOUT_MS = 300; // 快速刷新，不等待

  // 初始化：从localStorage读取用户偏好
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPreference = localStorage.getItem('yinxin_voice_broadcast_enabled');
      if (savedPreference === 'true') {
        setIsEnabled(true);
        isEnabledRef.current = true;
      }
    }
  }, []);

  // 同步ref和state
  useEffect(() => {
    isEnabledRef.current = isEnabled;
  }, [isEnabled]);

  // 保存用户偏好到localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('yinxin_voice_broadcast_enabled', String(isEnabled));
    }
  }, [isEnabled]);

  const enableVoiceBroadcast = useCallback(() => {
    setIsEnabled(true);
    isEnabledRef.current = true;
  }, []);

  const disableVoiceBroadcast = useCallback(() => {
    setIsEnabled(false);
    isEnabledRef.current = false;
    SpeechService.stopAudio();
  }, []);

  const toggleVoiceBroadcast = useCallback(() => {
    if (isEnabled) {
      disableVoiceBroadcast();
    } else {
      enableVoiceBroadcast();
    }
  }, [isEnabled, enableVoiceBroadcast, disableVoiceBroadcast]);

  const findSentenceBoundary = (text: string): number => {
    const sentenceEndings = ['。', '！', '？', '.', '!', '?', '；', ';', '\n'];
    for (let i = text.length - 1; i >= Math.max(0, text.length - 50); i--) {
      if (sentenceEndings.includes(text[i])) {
        return i + 1;
      }
    }
    return -1;
  };

  const flushPendingText = useCallback(() => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }

    if (!pendingTextRef.current.trim()) {
      return;
    }

    const textToSpeak = pendingTextRef.current.trim();
    pendingTextRef.current = '';
    lastSpeakTimeRef.current = Date.now();

    const chunks = splitTextIntoChunks(textToSpeak, STREAMING_CHUNK_SIZE);
    console.log(`[VoiceBroadcast] 刷新待播报文本 ${textToSpeak.length} 字符，分割为 ${chunks.length} 段`);

    chunks.forEach(chunk => {
      if (!speakQueueRef.current.includes(chunk)) {
        speakQueueRef.current.push(chunk);
      }
    });

    processQueue();
  }, []);

  const doSpeakText = (text: string) => {
    if (!isEnabledRef.current) {
      return;
    }

    if (!text || text.trim().length === 0) {
      return;
    }

    pendingTextRef.current += text;
    lastSpeakTimeRef.current = Date.now();

    // 优化：收到文本立即处理，不等待累积
    // 查找句子边界
    const boundary = findSentenceBoundary(pendingTextRef.current);
    
    // 如果找到完整的句子（长度>=50字符），立即加入队列
    if (boundary >= 50) {
      const segment = pendingTextRef.current.substring(0, boundary);
      pendingTextRef.current = pendingTextRef.current.substring(boundary);
      
      // 分割成小块（不超过 TTS 限制）
      const chunks = splitTextIntoChunks(segment, STREAMING_CHUNK_SIZE);
      chunks.forEach(chunk => {
        if (!speakQueueRef.current.includes(chunk) && chunk.trim()) {
          speakQueueRef.current.push(chunk);
          console.log(`[VoiceBroadcast] 加入播放队列: ${chunk.substring(0, 30)}...`);
        }
      });
      
      // 立即处理队列
      if (!isProcessingRef.current) {
        processQueue();
      }
    }

    // 设置刷新超时，处理剩余的短文本
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
    }
    flushTimeoutRef.current = setTimeout(() => {
      flushPendingText();
    }, FLUSH_TIMEOUT_MS);
  };

  const processQueue = useCallback(() => {
    if (isProcessingRef.current || speakQueueRef.current.length === 0) {
      return;
    }

    isProcessingRef.current = true;

    const processNext = () => {
      if (speakQueueRef.current.length === 0) {
        isProcessingRef.current = false;
        return;
      }

      const text = speakQueueRef.current.shift();
      if (!text) {
        processNext();
        return;
      }

      requestAnimationFrame(() => {
        setIsPlaying(true);
        isSpeakingRef.current = true;
        
        SpeechService.synthesizeAndPlay(text)
          .then(() => {
            console.log('[VoiceBroadcast] 片段播报完成');
          })
          .catch(error => {
            console.error('[VoiceBroadcast] 语音播报失败:', error);
          })
          .finally(() => {
            setIsPlaying(false);
            isSpeakingRef.current = false;
            requestAnimationFrame(() => {
              processNext();
            });
          });
      });
    };

    processNext();
  }, []);

  // 语音播报入口函数
  const speakText = useCallback((text: string) => {
    if (!text || text.trim().length === 0) {
      return;
    }

    doSpeakText(text);
  }, []);

  // 监听语音播报事件
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleVoiceBroadcast = (event: CustomEvent) => {
      const text = event.detail?.text;
      if (text) {
        speakText(text);
      }
    };
    
    window.addEventListener('voice-broadcast-message', handleVoiceBroadcast as EventListener);
    
    return () => {
      window.removeEventListener('voice-broadcast-message', handleVoiceBroadcast as EventListener);
    };
  }, [speakText]);

  const stopSpeaking = useCallback(() => {
    speakQueueRef.current = [];
    SpeechService.stopAudio();
    requestAnimationFrame(() => {
      setIsPlaying(false);
    });
    isSpeakingRef.current = false;
  }, []);

  const getProgress = useCallback(() => {
    return SpeechService.getProgress();
  }, []);

  const value: VoiceBroadcastContextType = {
    isEnabled,
    isPlaying,
    enableVoiceBroadcast,
    disableVoiceBroadcast,
    toggleVoiceBroadcast,
    speakText,
    stopSpeaking,
    getProgress,
    flushPendingText,
  };

  return (
    <VoiceBroadcastContext.Provider value={value}>
      {children}
    </VoiceBroadcastContext.Provider>
  );
};

export default VoiceBroadcastContext;
