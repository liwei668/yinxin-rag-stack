import type { SpeechConfig } from './textToSpeechService';

export class CloudSpeechRecognition {
  private static mediaRecorder: MediaRecorder | null = null;
  private static audioChunks: Blob[] = [];
  private static audioStream: MediaStream | null = null;
  private static isRecording = false;

  static async start(
    onResult: (text: string, isFinal: boolean) => void,
    onError: (error: string) => void,
    onStart?: () => void,
    onEnd?: () => void,
    getConfig?: () => SpeechConfig
  ): Promise<void> {
    // 防重复点击：已在录音中则忽略
    if (CloudSpeechRecognition.isRecording) {
      return;
    }

    const config = getConfig ? getConfig() : { mode: 'cloud' as const };
    if (!config.cloudConfig) {
      onError('未配置云端语音识别参数');
      return;
    }

    try {
      // 检查浏览器兼容性
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        onError('您的浏览器不支持麦克风功能，请使用现代浏览器');
        return;
      }

      // 检查权限状态
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });

          if (permissionStatus.state === 'denied') {
            onError('麦克风权限已被拒绝，请在浏览器设置中开启权限');
            return;
          }
        }
      } catch (permError) {
        // HTTP 环境下权限检查可能失败，继续执行
      }

      // 获取麦克风权限
      try {
        this.audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (permError: any) {
        if (permError.name === 'NotAllowedError') {
          onError('麦克风权限被拒绝，请在浏览器设置中开启权限');
        } else if (permError.name === 'NotFoundError') {
          onError('未找到麦克风设备');
        } else if (permError.name === 'NotReadableError') {
          onError('麦克风设备被占用');
        } else {
          onError('获取麦克风权限失败，请检查设备和浏览器设置');
        }
        return;
      }

      // 启动录音
      this.audioChunks = [];
      this.isRecording = true;

      if (!window.MediaRecorder) {
        onError('您的浏览器不支持音频录制功能');
        this.cleanup();
        return;
      }

      // 配置 MediaRecorder
      let mediaRecorderOptions: MediaRecorderOptions = {
        audioBitsPerSecond: 128000
      };

      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mediaRecorderOptions.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mediaRecorderOptions.mimeType = 'audio/ogg;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mediaRecorderOptions.mimeType = 'audio/mp4';
      }

      this.mediaRecorder = new MediaRecorder(this.audioStream, mediaRecorderOptions);

      // 只收集音频数据，不实时发送请求（避免重复请求导致429）
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // 录音错误处理
      this.mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder错误:', event.error);
        onError('录音失败，请检查设备');
        this.cleanup();
      };

      // 录音停止时，发送一次最终识别请求
      this.mediaRecorder.onstop = async () => {
        // 只在有音频数据时才发送请求
        if (this.audioChunks.length === 0) {
          this.cleanup();
          if (onEnd) onEnd();
          return;
        }

        const audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });

        try {
          const formData = new FormData();
          formData.append('provider', config.cloudConfig?.provider || 'aliyun');
          formData.append('modelName', config.cloudConfig?.modelName || 'qwen3-asr-flash');
          if (config.cloudConfig?.endpoint) {
            formData.append('endpoint', config.cloudConfig.endpoint);
          }
          formData.append('file', audioBlob, 'audio.webm');

          console.log('发送语音识别请求...');
          const response = await fetch('/api/speech', {
            method: 'POST',
            body: formData
          });

          if (!response.ok) {
            throw new Error(`语音识别请求失败: ${response.status}`);
          }

          const data = await response.json();
          console.log('收到语音识别结果:', data);
          onResult(data.text, true);
        } catch (error: any) {
          console.error('语音识别失败:', error);
          // 429 限流提示
          if (error?.message?.includes('429')) {
            onError('语音识别请求过于频繁，请稍后再试');
          } else {
            onError('语音识别失败，请检查网络连接');
          }
        }

        this.cleanup();
        if (onEnd) onEnd();
      };

      if (onStart) onStart();

      // 开始录音，每1000ms收集一次数据（只收集不发请求）
      this.mediaRecorder.start(1000);

    } catch (error) {
      console.error('启动语音识别失败:', error);
      onError('启动语音识别失败，请检查设备和网络连接');
      this.cleanup();
    }
  }

  static stop(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        console.error('停止录音失败:', e);
      }
    }
    // 注意：不在这里清空 audioChunks 和 mediaRecorder
    // onstop 回调需要用到它们，由 onstop 完成后调用 cleanup() 清理
  }

  /**
   * 清理所有资源（在 onstop 回调末尾调用）
   */
  private static cleanup(): void {
    this.isRecording = false;

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }

    this.audioChunks = [];
    this.mediaRecorder = null;
  }
}
