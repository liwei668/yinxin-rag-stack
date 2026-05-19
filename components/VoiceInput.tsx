'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Mic, MicOff, Info, AlertCircle } from 'lucide-react';
import { SpeechService } from '../src/services/textToSpeechService';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscript, disabled = false }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(mobile);
  }, []);

  // 组件卸载时自动停止录音，释放麦克风
  useEffect(() => {
    return () => {
      if (isListening) {
        SpeechService.stopSpeechRecognition();
      }
    };
  }, [isListening]);

  const startListening = useCallback(async () => {
    // 防重复点击：已在录音中则忽略
    if (isListening || disabled) return;

    setError(null);
    setTranscript('');

    await SpeechService.startSpeechRecognition(
      (text: string, isFinal: boolean) => {
        setTranscript(text);
        if (isFinal) {
          onTranscript(text);
        }
      },
      (errorMsg: string) => {
        setError(errorMsg);
        setIsListening(false);
      },
      () => {
        setIsListening(true);
      },
      () => {
        setIsListening(false);
      }
    );
  }, [isListening, disabled, onTranscript]);

  const stopListening = useCallback(() => {
    SpeechService.stopSpeechRecognition();
    setIsListening(false);
  }, []);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <div className="relative">
      <button
        onClick={toggleListening}
        disabled={disabled}
        className={`
          relative p-3 rounded-full transition-all duration-300
          ${isListening
            ? 'bg-red-100 text-red-600 animate-pulse cursor-pointer'
            : 'hover:bg-gray-200 text-gray-700'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        title={isListening ? '点击停止录音' : '开始语音输入'}
      >
        {isListening ? <MicOff size={isMobile ? 28 : 24} /> : <Mic size={isMobile ? 28 : 24} />}
      </button>

      {isListening && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 flex items-center gap-2 bg-red-100 px-3 py-1.5 rounded-full">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
          <span className="text-xs text-red-700">正在聆听...</span>
        </div>
      )}

      {error && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 max-w-xs">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {transcript && !isListening && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 max-w-xs">
          <p className="text-xs text-green-700">{transcript}</p>
        </div>
      )}
    </div>
  );
};

export default VoiceInput;
