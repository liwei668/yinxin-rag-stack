// 性能监控服务
// 用于跟踪AI调用、Agent执行等关键操作的性能指标

interface MetricData {
  count: number;
  totalTime: number;
  errors: number;
  minTime: number;
  maxTime: number;
}

interface TimingEntry {
  startTime: number;
  context?: Record<string, any>;
}

export class PerformanceMonitor {
  private metrics = new Map<string, MetricData>();
  private activeTimings = new Map<string, TimingEntry>();
  private readonly WARNING_THRESHOLD = 5000; // 5秒警告阈值
  private readonly ERROR_RATE_THRESHOLD = 0.1; // 10%错误率阈值

  /**
   * 开始计时
   */
  start(name: string, context?: Record<string, any>): void {
    this.activeTimings.set(name, { startTime: Date.now(), context });
  }

  /**
   * 结束计时
   */
  end(name: string, success: boolean = true): { duration: number; avgTime: number } {
    const entry = this.activeTimings.get(name);
    if (!entry) {
      return { duration: 0, avgTime: 0 };
    }

    const duration = Date.now() - entry.startTime;
    this.activeTimings.delete(name);

    // 更新指标
    const metric = this.metrics.get(name) || {
      count: 0,
      totalTime: 0,
      errors: 0,
      minTime: Infinity,
      maxTime: 0,
    };

    metric.count++;
    metric.totalTime += duration;
    if (!success) metric.errors++;
    if (duration < metric.minTime) metric.minTime = duration;
    if (duration > metric.maxTime) metric.maxTime = duration;

    this.metrics.set(name, metric);

    // 检查警告条件
    this.checkWarnings(name, metric, duration);

    return {
      duration,
      avgTime: metric.totalTime / metric.count,
    };
  }

  /**
   * 记录错误
   */
  recordError(name: string, error: Error): void {
    const metric = this.metrics.get(name) || {
      count: 0,
      totalTime: 0,
      errors: 0,
      minTime: Infinity,
      maxTime: 0,
    };

    metric.count++;
    metric.errors++;
    this.metrics.set(name, metric);

    this.checkWarnings(name, metric, 0);
    console.error(`[Performance] Error in ${name}:`, error.message);
  }

  /**
   * 检查警告条件
   */
  private checkWarnings(name: string, metric: MetricData, lastDuration: number): void {
    // 响应时间警告
    if (lastDuration > this.WARNING_THRESHOLD) {
      console.warn(
        `[Performance Warning] ${name} 响应时间过长: ${lastDuration.toFixed(2)}ms`
      );
    }

    // 错误率警告
    if (metric.count >= 10) {
      const errorRate = metric.errors / metric.count;
      if (errorRate > this.ERROR_RATE_THRESHOLD) {
        console.error(
          `[Performance Alert] ${name} 错误率过高: ${(errorRate * 100).toFixed(2)}% (${metric.errors}/${metric.count})`
        );
      }
    }
  }

  /**
   * 获取指标统计
   */
  getMetrics(name?: string): Record<string, MetricData> | MetricData | null {
    if (name) {
      return this.metrics.get(name) || null;
    }
    const result: Record<string, MetricData> = {};
    this.metrics.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * 获取格式化的指标报告
   */
  getReport(): string {
    if (this.metrics.size === 0) {
      return '暂无性能数据';
    }

    let report = '=== 性能监控报告 ===\n';
    this.metrics.forEach((metric, name) => {
      const avgTime = metric.count > 0 ? (metric.totalTime / metric.count).toFixed(2) : '0';
      const errorRate = metric.count > 0 ? ((metric.errors / metric.count) * 100).toFixed(2) : '0';
      
      report += `\n${name}:\n`;
      report += `  调用次数: ${metric.count}\n`;
      report += `  平均耗时: ${avgTime}ms\n`;
      report += `  最小耗时: ${metric.minTime.toFixed(2)}ms\n`;
      report += `  最大耗时: ${metric.maxTime.toFixed(2)}ms\n`;
      report += `  错误次数: ${metric.errors} (${errorRate}%)\n`;
    });

    return report;
  }

  /**
   * 重置指标
   */
  reset(name?: string): void {
    if (name) {
      this.metrics.delete(name);
    } else {
      this.metrics.clear();
    }
  }

  /**
   * 跟踪异步操作
   */
  async track<T>(name: string, fn: () => Promise<T>, context?: Record<string, any>): Promise<T> {
    this.start(name, context);
    try {
      const result = await fn();
      const { duration } = this.end(name, true);
      console.debug(`[Performance] ${name} completed in ${duration.toFixed(2)}ms`);
      return result;
    } catch (error) {
      this.end(name, false);
      throw error;
    }
  }
}

// 创建全局实例
export const performanceMonitor = new PerformanceMonitor();
