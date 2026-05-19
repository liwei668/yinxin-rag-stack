'use client';

import { AudioPlayer } from './audioPlayer';
import { TTSProviders } from './ttsProviders';

// 已废弃的语音名称列表
const UNSUPPORTED_VOICES = ['Cherry', 'Ethan', 'zh-CN-YunxiNeural'];
import { CloudSpeechRecognition } from './speechRecognition';

// 阿里云 TTS 单段最大字符数限制
const MAX_TTS_LENGTH = 570;

export interface SpeechConfig {
  mode: 'browser' | 'cloud';
  cloudConfig?: {
    provider: 'openai' | 'azure' | 'baidu' | 'aliyun' | 'tencent';
    apiKey: string;
    ttsApiKey?: string;
    endpoint?: string;
    region?: string;
    voiceName?: string;
    voiceRate?: number;
    voicePitch?: number;
    modelName?: string;
    ttsModelName?: string;
  };
}

interface QueuedAudio {
  blob: Blob;
  text: string;
  index: number;
}

export class SpeechService {
  private static audioQueue: QueuedAudio[] = [];
  private static isPlayingQueue: boolean = false;
  private static isProcessingQueue: boolean = false;
  private static currentSegment: number = 0;
  private static totalSegments: number = 0;
  private static onSegmentChange?: (current: number, total: number) => void;
  private static pendingSynthesis: Map<number, Promise<Blob>> = new Map();
  private static maxConcurrentSynthesis: number = 3;
  private static activeSynthesisCount: number = 0;

  static getConfig(): SpeechConfig {
    // 语音配置由后端 configs.json + apis.json 统一管理
    // 前端只传 provider/voiceName 等提示字段，后端会覆盖为实际值
    return {
      mode: 'cloud',
      cloudConfig: {
        provider: 'aliyun',
        apiKey: '',
        modelName: 'qwen3-asr-flash',
        ttsModelName: 'qwen3-tts-flash',
        voiceName: 'xiaobai'
      }
    };
  }

  static async startSpeechRecognition(
    onResult: (text: string, isFinal: boolean) => void,
    onError: (error: string) => void,
    onStart?: () => void,
    onEnd?: () => void
  ): Promise<void> {
    // 使用阿里云ASR API进行语音转文字
    console.log('使用阿里云ASR API进行语音转文字');
    await CloudSpeechRecognition.start(onResult, onError, onStart, onEnd, () => this.getConfig());
  }

  static stopSpeechRecognition(): void {
    CloudSpeechRecognition.stop();
  }

  /**
   * 智能分段：按句子/段落分割，每段不超过 maxLength
   */
  private static splitTextIntoSegments(text: string, maxLength: number = MAX_TTS_LENGTH): string[] {
    const segments: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        // 剩余文本不超过限制，直接作为最后一段
        segments.push(remaining.trim());
        break;
      }

      // 在限制范围内找最佳分割点
      let splitIndex = maxLength;
      let bestSplit = -1;

      // 优先在句子结束处分割（。！？.\n）
      const sentenceEndChars = ['。', '！', '？', '.', '!', '?', '\n'];
      for (let i = maxLength - 1; i >= maxLength * 0.5; i--) {
        if (sentenceEndChars.includes(remaining[i])) {
          bestSplit = i + 1;
          break;
        }
      }

      // 如果没找到句子结束，尝试在标点处分割
      if (bestSplit === -1) {
        const punctuationChars = ['，', ',', '；', ';', '、', ' '];
        for (let i = maxLength - 1; i >= maxLength * 0.5; i--) {
          if (punctuationChars.includes(remaining[i])) {
            bestSplit = i + 1;
            break;
          }
        }
      }

      // 如果还没找到，强制在 maxLength 处分割
      if (bestSplit === -1) {
        bestSplit = maxLength;
      }

      segments.push(remaining.substring(0, bestSplit).trim());
      remaining = remaining.substring(bestSplit).trim();
    }

    return segments.filter(s => s.length > 0);
  }

  /**
   * 顺序播放队列中的音频，支持边合成边播放
   * 优化：持续检查队列，有新音频就立即播放
   */
  private static async playQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;
    this.isPlayingQueue = true;

    const processNext = async (): Promise<void> => {
      // 检查是否还有内容需要处理
      if (this.audioQueue.length === 0 && this.activeSynthesisCount === 0) {
        this.isPlayingQueue = false;
        this.isProcessingQueue = false;
        console.log('语音播放队列完成');
        return;
      }

      // 查找第一个有效的音频片段（blob 不为 null）
      const queueItem = this.audioQueue.find(q => q.blob && q.blob.size > 0);
      
      if (!queueItem) {
        // 没有可播放的音频，等待合成完成
        if (this.activeSynthesisCount > 0) {
          console.log('[TTS] 等待音频合成...');
          await new Promise(resolve => setTimeout(resolve, 200));
          requestAnimationFrame(processNext);
        } else {
          // 没有合成任务但队列为空，结束播放
          this.isPlayingQueue = false;
          this.isProcessingQueue = false;
        }
        return;
      }

      // 找到有效的音频，从队列中移除
      const index = this.audioQueue.indexOf(queueItem);
      this.audioQueue.splice(index, 1);

      this.currentSegment++;
      console.log(`[TTS] 播放第 ${this.currentSegment}/${this.totalSegments} 段: ${queueItem.text.substring(0, 20)}...`);
      this.onSegmentChange?.(this.currentSegment, this.totalSegments);

      // 播放音频
      await new Promise<void>((resolve) => {
        AudioPlayer.play(queueItem.blob!);
        
        // 使用更短的检查间隔，提高响应速度
        const checkEnded = setInterval(() => {
          if (!AudioPlayer.isPlaying()) {
            clearInterval(checkEnded);
            resolve();
          }
        }, 50); // 50ms 检查一次

        // 最长等待5分钟
        setTimeout(() => {
          clearInterval(checkEnded);
          resolve();
        }, 300000);
      });

      // 立即处理下一个片段
      requestAnimationFrame(processNext);
    };

    // 启动播放循环
    processNext();
  }

  /**
   * 并行合成多个段落并边合成边播放
   * 追加模式：不清空现有队列，而是追加到队列末尾
   */
  private static async synthesizeParallelAndPlay(
    segments: string[],
    config: SpeechConfig['cloudConfig']
  ): Promise<void> {
    // 获取当前队列中的已有片段数量，用于计算索引偏移
    const existingSegmentCount = this.audioQueue.length;
    
    // 更新总片段数（累加）
    this.totalSegments = existingSegmentCount + segments.length;
    
    const startSynthesis = async (index: number, text: string): Promise<void> => {
      // 控制队列长度，避免内存溢出
      while (this.audioQueue.length > 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      this.activeSynthesisCount++;
      try {
        const blob = await TTSProviders.synthesize(text, config!);
        // 使用原始索引确保顺序正确
        this.audioQueue.push({ blob, text, index: existingSegmentCount + index });
        console.log(`[TTS] 合成完成第 ${existingSegmentCount + index + 1} 段，队列长度: ${this.audioQueue.length}`);
      } catch (error) {
        console.error(`合成第 ${existingSegmentCount + index + 1} 段失败:`, error);
        this.audioQueue.push({ blob: new Blob([]), text, index: existingSegmentCount + index });
      } finally {
        this.activeSynthesisCount--;
      }
    };

    // 如果还没有播放队列在运行，启动播放队列
    if (!this.isProcessingQueue) {
      this.playQueue();
    }

    const synthesisPromises: Promise<void>[] = [];
    for (let i = 0; i < segments.length; i++) {
      synthesisPromises.push(startSynthesis(i, segments[i]));
      // 控制并发数量
      if (i < this.maxConcurrentSynthesis) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    await Promise.all(synthesisPromises);

    // 等待所有合成完成
    while (this.activeSynthesisCount > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  static async synthesizeAndPlay(
    text: string, 
    onSegmentChange?: (current: number, total: number) => void
  ): Promise<void> {
    const config = this.getConfig();
    
    // 激活 AudioContext（必须在用户点击事件的调用栈中）
    AudioPlayer.activate();
    
    // 不再停止当前播放的音频，让队列自然播放完成
    // this.stopAudio();
    
    // 清理文本：去除 markdown 标记、多余空行等，只保留纯文本用于朗读
    let cleanText = text
      // 优先去除代码块（包含 ``` 和 ``` 之间的所有内容）
      .replace(/```[\s\S]*?```/g, '')
      // 去除行内代码
      .replace(/`([^`]+)`/g, '$1')
      .replace(/``([^`]+)``/g, '$1')
      // 去除所有加粗标记（包括 **text** 和 __text__）
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      // 去除所有斜体标记（包括 *text* 和 _text_）
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      // 去除标题标记
      .replace(/^#{1,6}\s+/gm, '')
      // 去除引用标记
      .replace(/^>\s+/gm, '')
      // 去除列表标记
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      // 去除链接，保留链接文字
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // 去除图片
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      // 去除水平线
      .replace(/^[-*_]{3,}$/gm, '')
      // 处理不完整的加粗标记（如 **text 或 text**）
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      // 去除多余空格和空行
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .trim()

    // 清理后为空则跳过合成
    if (!cleanText) {
      console.log('文本清理后为空，跳过语音合成');
      return;
    }

    console.log('清理后的文本长度:', cleanText.length);

    // 使用云端TTS
    if (config.cloudConfig) {
      console.log('使用阿里云TTS');
      
      try {
        this.onSegmentChange = onSegmentChange;
        
        // 短文本也加入队列，确保播放顺序正确
        const segments = this.splitTextIntoSegments(cleanText);
        
        if (segments.length === 1 && cleanText.length <= MAX_TTS_LENGTH) {
          // 单个短文本：直接合成并加入队列
          this.totalSegments++;
          const audioBlob = await TTSProviders.synthesize(cleanText, config.cloudConfig);
          
          // 如果播放队列没有在运行，启动它
          if (!this.isProcessingQueue) {
            this.audioQueue.push({ blob: audioBlob, text: cleanText, index: this.totalSegments - 1 });
            this.playQueue();
          } else {
            // 队列正在运行，追加到队列
            this.audioQueue.push({ blob: audioBlob, text: cleanText, index: this.totalSegments - 1 });
          }
          console.log('阿里云TTS短文本已加入播放队列');
          return;
        }

        // 长文本需要分段合成，使用并行合成
        console.log(`文本已分段: ${segments.length} 段`);
        
        await this.synthesizeParallelAndPlay(segments, config.cloudConfig);
        console.log('阿里云TTS并行合成完成');
        
      } catch (error) {
        console.error('阿里云TTS失败:', error);
        throw error;
      }
    } else {
      throw new Error('未配置云端TTS参数');
    }
  }

  static stopAudio(): void {
    // 清空队列
    this.audioQueue = [];
    this.isPlayingQueue = false;
    this.isProcessingQueue = false;
    this.currentSegment = 0;
    this.totalSegments = 0;
    this.activeSynthesisCount = 0;
    this.onSegmentChange = undefined;
    AudioPlayer.stop();
  }

  static isPlaying(): boolean {
    return AudioPlayer.isPlaying() || this.isPlayingQueue || this.audioQueue.length > 0;
  }

  /**
   * 获取当前播放进度
   */
  static getProgress(): { current: number; total: number } | null {
    if (this.totalSegments === 0) return null;
    return {
      current: this.currentSegment,
      total: this.totalSegments
    };
  }
}

export default SpeechService;
