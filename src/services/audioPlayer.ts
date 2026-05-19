/**
 * 音频播放器
 * 使用 AudioContext 方案解决浏览器自动播放策略限制：
 * - 首次用户点击时激活 AudioContext
 * - 之后所有播放（包括异步合成后自动播放）都通过已激活的 AudioContext
 */

export class AudioPlayer {
  private static audioPlayer: HTMLAudioElement | null = null;
  private static audioContext: AudioContext | null = null;
  private static activated = false;

  /**
   * 激活 AudioContext（必须在用户点击事件的同步调用栈中调用）
   * 调用一次后，后续所有播放都不再受浏览器自动播放策略限制
   */
  static activate(): void {
    if (AudioPlayer.activated) return;

    try {
      if (!AudioPlayer.audioContext) {
        AudioPlayer.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (AudioPlayer.audioContext.state === 'suspended') {
        AudioPlayer.audioContext.resume();
      }
      AudioPlayer.activated = true;
      console.log('[AudioPlayer] AudioContext 已激活');
    } catch (e) {
      console.error('[AudioPlayer] 激活 AudioContext 失败:', e);
    }
  }

  /**
   * 播放音频 Blob
   * 如果 AudioContext 已激活，播放不受自动播放策略限制
   */
  static play(blob: Blob): void {
    // 先停止当前正在播放的音频
    AudioPlayer.stop();

    // 确保 AudioContext 处于运行状态
    if (AudioPlayer.audioContext && AudioPlayer.audioContext.state === 'suspended') {
      AudioPlayer.audioContext.resume();
    }

    // 创建音频对象并播放
    AudioPlayer.audioPlayer = new Audio();
    const blobUrl = URL.createObjectURL(blob);
    AudioPlayer.audioPlayer.src = blobUrl;

    AudioPlayer.audioPlayer.play().catch(error => {
      console.error('[AudioPlayer] 播放音频失败:', error);
      URL.revokeObjectURL(blobUrl);
      AudioPlayer.audioPlayer = null;
    });

    // 保存 blobUrl 引用以便正确释放
    (AudioPlayer.audioPlayer as any)._blobUrl = blobUrl;

    // 播放完成后释放资源
    AudioPlayer.audioPlayer.onended = () => {
      if (AudioPlayer.audioPlayer && (AudioPlayer.audioPlayer as any)._blobUrl) {
        try {
          URL.revokeObjectURL((AudioPlayer.audioPlayer as any)._blobUrl);
        } catch (e) {
          console.error('[AudioPlayer] 释放blob URL失败:', e);
        }
      }
      AudioPlayer.audioPlayer = null;
    };
  }

  /**
   * 停止播放
   */
  static stop(): void {
    if (AudioPlayer.audioPlayer) {
      try {
        if ((AudioPlayer.audioPlayer as any)._blobUrl) {
          URL.revokeObjectURL((AudioPlayer.audioPlayer as any)._blobUrl);
        }
        AudioPlayer.audioPlayer.pause();
        AudioPlayer.audioPlayer.src = '';
        AudioPlayer.audioPlayer.onended = null;
        AudioPlayer.audioPlayer.onerror = null;
      } catch (e) {
        console.error('[AudioPlayer] 停止音频失败:', e);
      }
      AudioPlayer.audioPlayer = null;
    }
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  }

  /**
   * 是否正在播放
   */
  static isPlaying(): boolean {
    return AudioPlayer.audioPlayer !== null && !AudioPlayer.audioPlayer.paused;
  }

  /**
   * AudioContext 是否已激活
   */
  static isActivated(): boolean {
    return AudioPlayer.activated;
  }
}
