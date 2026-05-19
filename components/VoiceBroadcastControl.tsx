'use client';

import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useVoiceBroadcast } from '../src/contexts/VoiceBroadcastContext';

const VoiceBroadcastControl: React.FC = () => {
  const { isEnabled, isPlaying, toggleVoiceBroadcast } = useVoiceBroadcast();

  return (
    <div className="relative group">
      <button
        onClick={toggleVoiceBroadcast}
        className={`
          p-2 rounded-md flex items-center justify-center transition-all duration-200
          ${isEnabled 
            ? 'bg-emerald-100 hover:bg-emerald-200' 
            : 'hover:bg-gray-200'
          }
        `}
        title={isEnabled ? '关闭自动语音播报' : '开启自动语音播报'}
      >
        {isEnabled ? (
          <Volume2 
            size={20} 
            className={`transition-colors ${isPlaying ? 'text-emerald-600 animate-pulse' : 'text-emerald-600'}`} 
          />
        ) : (
          <VolumeX 
            size={20} 
            className="text-gray-500" 
          />
        )}
      </button>
      
      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50">
        {isEnabled ? (
          isPlaying ? '语音播报中...' : '已开启自动播报（点击关闭）'
        ) : (
          '点击开启自动语音播报'
        )}
      </div>
      
      {isEnabled && (
        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
      )}
    </div>
  );
};

export default VoiceBroadcastControl;
