'use client';

import { useState, useEffect } from 'react';
import { Settings, Info, RefreshCw, Volume2 } from 'lucide-react';

interface ApiOption {
  api_id: string;
  name: string;
  type: string;
  isActive: boolean;
  apiKey: string;
}

interface VoiceConfig {
  voiceApiId: string;
  ttsEngine: string;
  ttsModel: string;
  asrEngine: string;
  asrLanguage: string;
  voiceName: string;
  voiceSpeed: number;
  asrThreshold: number;
}

// 引擎对应的可选模型
const TTS_MODELS: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: 'tts-1', label: 'tts-1 (标准)' },
    { value: 'tts-1-hd', label: 'tts-1-hd (高清)' },
    { value: 'gpt-4o-mini-tts', label: 'gpt-4o-mini-tts' },
  ],
  azure: [
    { value: 'azure-tts', label: 'Azure Neural TTS' },
  ],
  baidu: [
    { value: 'baidu-tts-0', label: '百度普通 TTS' },
    { value: 'baidu-tts-1', label: '百度高品质 TTS' },
  ],
  aliyun: [
    { value: 'qwen3-tts-instruct-flash', label: '千问3-TTS-Instruct（支持语速/情感控制）' },
    { value: 'qwen3-tts-flash', label: '千问3-TTS-Flash（快速）' },
    { value: 'cosyvoice-v1', label: 'CosyVoice v1' },
    { value: 'sambert', label: 'Sambert' },
  ],
  tencent: [
    { value: 'tts-1', label: '腾讯云 TTS' },
  ],
};

const ASR_MODELS: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: 'whisper-1', label: 'Whisper v1' },
  ],
  azure: [
    { value: 'azure-asr', label: 'Azure Speech' },
  ],
  baidu: [
    { value: 'baidu-asr-0', label: '百度短语音识别' },
    { value: 'baidu-asr-1', label: '百度实时语音识别' },
  ],
  aliyun: [
    { value: 'paraformer', label: 'Paraformer' },
  ],
  tencent: [
    { value: 'tencent-asr', label: '腾讯云 ASR' },
  ],
};

const SpeechSettings = () => {
  const [apis, setApis] = useState<ApiOption[]>([]);
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({
    voiceApiId: '',
    ttsEngine: 'openai',
    ttsModel: 'tts-1',
    asrEngine: 'openai',
    asrLanguage: 'auto',
    voiceName: '',
    voiceSpeed: 1.0,
    asrThreshold: 0.5,
  });
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [apisRes, configRes] = await Promise.all([
          fetch('/api/admin?action=apis'),
          fetch('/api/admin?action=config'),
        ]);

        if (apisRes.ok) {
          const apisData = await apisRes.json();
          if (apisData.success) {
            setApis(apisData.apis || []);
          }
        }

        if (configRes.ok) {
          const configData = await configRes.json();
          if (configData.success && configData.configs?.voice) {
            setVoiceConfig(prev => ({ ...prev, ...configData.configs.voice }));
          }
        }
      } catch (error) {
        console.error('加载语音设置失败:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSaveSettings = async () => {
    setSaveStatus('saving');
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateConfigGroup',
          data: {
            group: 'voice',
            values: voiceConfig,
          },
        }),
      });

      if (!response.ok) throw new Error('保存失败');

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('保存语音设置失败:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const handleTestVoice = async () => {
    setTestStatus('testing');
    try {
      const response = await fetch('/api/speech/synthesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: '你好，这是一段语音试听测试',
          voiceName: voiceConfig.voiceName || 'xiaobai',
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: '语音合成失败' }));
        throw new Error(errData.error || '语音合成失败');
      }
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      audio.play();
      setTestStatus('success');
      setTimeout(() => setTestStatus('idle'), 2000);
    } catch (e: any) {
      console.error('试听失败:', e);
      setTestStatus('error');
      setTimeout(() => setTestStatus('idle'), 2000);
    }
  };

  const updateVoiceConfig = (key: keyof VoiceConfig, value: any) => {
    setVoiceConfig(prev => {
      const updated = { ...prev, [key]: value };
      // 切换 TTS 引擎时，自动选择该引擎的第一个模型
      if (key === 'ttsEngine' && TTS_MODELS[value]) {
        updated.ttsModel = TTS_MODELS[value][0].value;
      }
      return updated;
    });
  };

  if (loading) {
    return <div className="p-4 text-gray-500">加载中...</div>;
  }

  const voiceApis = apis.filter(api => api.isActive && (api.type === '语音' || api.type === 'LLM'));
  const currentTtsModels = TTS_MODELS[voiceConfig.ttsEngine] || [];
  const currentAsrModels = ASR_MODELS[voiceConfig.asrEngine] || [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">

        <div className="space-y-5">
          {/* 语音 API 选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">语音 API</label>
            <select
              value={voiceConfig.voiceApiId}
              onChange={(e) => updateVoiceConfig('voiceApiId', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">-- 请选择语音 API --</option>
              {voiceApis.map(api => (
                <option key={api.api_id} value={api.api_id}>
                  {api.name} ({api.type})
                </option>
              ))}
            </select>
            {voiceApis.length === 0 && (
              <p className="mt-1.5 text-xs text-amber-600">暂无可用的语音 API，请先在「模型服务」中添加语音类型的 API。</p>
            )}
          </div>

          {/* TTS 引擎 + TTS 模型 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">TTS 引擎</label>
              <select
                value={voiceConfig.ttsEngine}
                onChange={(e) => updateVoiceConfig('ttsEngine', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="openai">OpenAI</option>
                <option value="azure">Azure</option>
                <option value="baidu">百度</option>
                <option value="aliyun">阿里云</option>
                <option value="tencent">腾讯云</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">TTS 模型</label>
              <select
                value={voiceConfig.ttsModel}
                onChange={(e) => updateVoiceConfig('ttsModel', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                {currentTtsModels.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ASR 引擎 + ASR 语言 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">ASR 引擎</label>
              <select
                value={voiceConfig.asrEngine}
                onChange={(e) => updateVoiceConfig('asrEngine', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="openai">OpenAI</option>
                <option value="azure">Azure</option>
                <option value="baidu">百度</option>
                <option value="aliyun">阿里云</option>
                <option value="tencent">腾讯云</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">ASR 语言</label>
              <select
                value={voiceConfig.asrLanguage}
                onChange={(e) => updateVoiceConfig('asrLanguage', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="auto">自动识别</option>
                <option value="zh">中文</option>
                <option value="en">英文</option>
              </select>
            </div>
          </div>

          {/* 音色 + 语速 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">音色</label>
              <select
                value={voiceConfig.voiceName || ''}
                onChange={(e) => updateVoiceConfig('voiceName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">默认音色</option>
                <option value="Cherry">Cherry (温柔女声)</option>
                <option value="Serena">Serena (知性女声)</option>
                <option value="Ethan">Ethan (沉稳男声)</option>
                <option value="Chelsie">Chelsie (活力女声)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                语速 <span className="text-gray-400 font-normal">{voiceConfig.voiceSpeed.toFixed(1)}</span>
              </label>
              <input
                type="range"
                min="0.1"
                max="2"
                step="0.1"
                value={voiceConfig.voiceSpeed || 1.0}
                onChange={(e) => updateVoiceConfig('voiceSpeed', parseFloat(e.target.value))}
                className="w-full mt-2"
              />
            </div>
          </div>

          {/* 识别阈值 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              识别阈值 <span className="text-gray-400 font-normal">{voiceConfig.asrThreshold.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={voiceConfig.asrThreshold || 0.5}
              onChange={(e) => updateVoiceConfig('asrThreshold', parseFloat(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-gray-400 mt-1">值越高，识别越严格</p>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-3 pt-3 border-t">
            <button
              onClick={handleTestVoice}
              disabled={testStatus === 'testing'}
              className="px-4 py-2 border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm"
            >
              <Volume2 size={16} />
              {testStatus === 'testing' ? '试听中...' : testStatus === 'success' ? '试听成功！' : '试听'}
            </button>
            <button
              onClick={handleSaveSettings}
              disabled={saveStatus === 'saving'}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm"
            >
              {saveStatus === 'saving' && <RefreshCw size={16} className="animate-spin" />}
              {saveStatus === 'saving' ? '保存中...' : saveStatus === 'success' ? '保存成功！' : '保存'}
            </button>
            {saveStatus === 'error' && <span className="text-red-600 text-sm">保存失败</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpeechSettings;
