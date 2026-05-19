// Agent 自我进化系统 - 记录、发现问题、自动优化
import { AgentTask, AgentStep, ToolResult, EvolutionPattern, EvolutionOptimization, AgentPerformance } from './types';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const DATA_DIR = path.join(process.cwd(), 'data');
const EVOLUTION_DIR = path.join(DATA_DIR, 'agent-logs', 'evolution');

if (!fs.existsSync(EVOLUTION_DIR)) {
  fs.mkdirSync(EVOLUTION_DIR, { recursive: true });
}

const PATTERNS_FILE = path.join(EVOLUTION_DIR, 'patterns.json');
const OPTIMIZATIONS_FILE = path.join(EVOLUTION_DIR, 'optimizations.json');
const PERFORMANCE_FILE = path.join(EVOLUTION_DIR, 'performance.json');

class AgentEvolution {
  private patterns: EvolutionPattern[] = [];
  private optimizations: EvolutionOptimization[] = [];
  private performanceHistory: { date: string; successRate: number; avgDuration: number; taskCount: number }[] = [];

  constructor() {
    this.loadData();
  }

  private loadData() {
    try {
      if (fs.existsSync(PATTERNS_FILE)) {
        this.patterns = JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8'));
      }
      if (fs.existsSync(OPTIMIZATIONS_FILE)) {
        this.optimizations = JSON.parse(fs.readFileSync(OPTIMIZATIONS_FILE, 'utf8'));
      }
      if (fs.existsSync(PERFORMANCE_FILE)) {
        this.performanceHistory = JSON.parse(fs.readFileSync(PERFORMANCE_FILE, 'utf8'));
      }
    } catch (e) {
      console.error('[Agent] 加载进化数据失败:', e);
    }
  }

  private savePatterns() {
    try {
      fs.writeFileSync(PATTERNS_FILE, JSON.stringify(this.patterns, null, 2), 'utf8');
    } catch (e) {
      console.error('[Agent] 保存模式数据失败:', e);
    }
  }

  private saveOptimizations() {
    try {
      fs.writeFileSync(OPTIMIZATIONS_FILE, JSON.stringify(this.optimizations, null, 2), 'utf8');
    } catch (e) {
      console.error('[Agent] 保存优化数据失败:', e);
    }
  }

  private savePerformance() {
    try {
      fs.writeFileSync(PERFORMANCE_FILE, JSON.stringify(this.performanceHistory, null, 2), 'utf8');
    } catch (e) {
      console.error('[Agent] 保存性能数据失败:', e);
    }
  }

  // 记录步骤执行结果
  async recordStep(taskId: string, step: AgentStep, result: ToolResult) {
    // 检查重复失败
    if (!result.success) {
      const recentFailures = this.patterns.filter(p =>
        p.type === 'repeated_failure' &&
        p.toolName === step.toolName &&
        p.stepTitle === step.title &&
        !p.applied
      );

      const existing = recentFailures[0];
      if (existing) {
        existing.count++;
        existing.lastSeen = new Date().toISOString();
        if (existing.count >= 3) {
          existing.autoFix = `建议检查工具 "${step.toolName}" 的实现，连续失败 ${existing.count} 次`;
          this.savePatterns();
        }
      } else {
        this.patterns.push({
          id: uuidv4(),
          type: 'repeated_failure',
          description: `工具 "${step.toolName}" 步骤 "${step.title}" 执行失败`,
          toolName: step.toolName,
          stepTitle: step.title,
          count: 1,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          applied: false,
        });
        this.savePatterns();
      }
    }

    // 记录成功策略（特别是选择器相关的成功经验）
    if (result.success && step.toolParams?.selector) {
      const selector = step.toolParams.selector as string;
      const existingSuccess = this.patterns.find(p =>
        p.type === 'success_pattern' &&
        p.toolName === step.toolName &&
        p.description?.includes(selector)
      );
      if (!existingSuccess) {
        this.patterns.push({
          id: uuidv4(),
          type: 'success_pattern',
          description: `工具 "${step.toolName}" 使用选择器 "${selector}" 成功（${step.title || ''}）`,
          toolName: step.toolName,
          stepTitle: step.title,
          count: 1,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          applied: false,
        });
        this.savePatterns();
      } else {
        existingSuccess.count++;
        existingSuccess.lastSeen = new Date().toISOString();
        this.savePatterns();
      }
    }

    // 记录选择器提示（当模糊匹配或关键词匹配成功时）
    if (result.success && step.toolParams?.matchedStrategy) {
      const strategy = step.toolParams.matchedStrategy as string;
      const existingTip = this.patterns.find(p =>
        p.type === 'selector_tip' &&
        p.description?.includes(step.toolParams.selector as string)
      );
      if (!existingTip) {
        this.patterns.push({
          id: uuidv4(),
          type: 'selector_tip',
          description: `元素 "${step.toolParams.selector}" 需要使用 "${strategy}" 策略匹配`,
          toolName: step.toolName,
          stepTitle: step.title,
          count: 1,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          applied: false,
        });
        this.savePatterns();
      }
    }

    // 检查步骤耗时异常
    if (result.success && step.duration && step.duration > 10000) {
      const existing = this.patterns.find(p =>
        p.type === 'slow_step' &&
        p.toolName === step.toolName &&
        p.stepTitle === step.title &&
        !p.applied
      );
      if (existing) {
        existing.count++;
        existing.lastSeen = new Date().toISOString();
      } else {
        this.patterns.push({
          id: uuidv4(),
          type: 'slow_step',
          description: `步骤 "${step.title}" 耗时 ${Math.round(step.duration / 1000)}s，超过 10 秒阈值`,
          toolName: step.toolName,
          stepTitle: step.title,
          count: 1,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          applied: false,
        });
        this.savePatterns();
      }
    }
  }

  // 记录任务完成
  async recordTask(task: AgentTask) {
    const today = new Date().toISOString().split('T')[0];
    const duration = task.startedAt && task.completedAt
      ? new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()
      : 0;
    const success = task.status === 'completed';

    // 更新每日性能
    const todayEntry = this.performanceHistory.find(p => p.date === today);
    if (todayEntry) {
      todayEntry.taskCount++;
      todayEntry.successRate = (todayEntry.successRate * (todayEntry.taskCount - 1) + (success ? 1 : 0)) / todayEntry.taskCount;
      todayEntry.avgDuration = (todayEntry.avgDuration * (todayEntry.taskCount - 1) + duration) / todayEntry.taskCount;
    } else {
      this.performanceHistory.push({
        date: today,
        successRate: success ? 1 : 0,
        avgDuration: duration,
        taskCount: 1,
      });
    }
    this.savePerformance();

    // 检查成功率下降趋势
    if (this.performanceHistory.length >= 3) {
      const recent = this.performanceHistory.slice(-3);
      if (recent[0].successRate > recent[1].successRate && recent[1].successRate > recent[2].successRate) {
        const existing = this.patterns.find(p => p.type === 'success_rate_drop' && !p.applied);
        if (!existing) {
          this.patterns.push({
            id: uuidv4(),
            type: 'success_rate_drop',
            description: `任务成功率连续下降: ${recent.map(r => `${Math.round(r.successRate * 100)}%`).join(' → ')}`,
            toolName: 'all',
            stepTitle: 'all',
            count: 1,
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            applied: false,
          });
          this.savePatterns();
        }
      }
    }
  }

  // 获取性能报告
  getPerformance(): AgentPerformance {
    const total = this.performanceHistory.reduce((sum, d) => sum + d.taskCount, 0);
    const recent = this.performanceHistory.slice(-7);
    const successRate = recent.length > 0
      ? recent.reduce((sum, d) => sum + d.successRate, 0) / recent.length
      : 0;
    const avgDuration = recent.length > 0
      ? recent.reduce((sum, d) => sum + d.avgDuration, 0) / recent.length
      : 0;

    return {
      totalTasks: total,
      successRate,
      avgDuration,
      trend: this.performanceHistory.slice(-30).map(d => ({
        date: d.date,
        successRate: d.successRate,
        avgDuration: d.avgDuration,
      })),
    };
  }

  // 获取未处理的问题
  getActivePatterns(): EvolutionPattern[] {
    return this.patterns.filter(p => !p.applied);
  }

  /**
   * 生成供 AI system prompt 使用的进化建议
   * 将历史失败模式和成功策略转化为 AI 可理解的建议
   */
  getEvolutionPrompt(maxItems = 15): string {
    const activePatterns = this.patterns.filter(p => !p.applied);
    if (activePatterns.length === 0) return '';

    const tips: string[] = [];

    // 1. 失败模式提示（出现2次以上的）
    const failures = activePatterns
      .filter(p => p.type === 'repeated_failure' && p.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, maxItems);

    for (const f of failures) {
      const fix = f.autoFix ? `，建议: ${f.autoFix}` : '';
      tips.push(`- [避免] ${f.description}（已失败 ${f.count} 次${fix}）`);
    }

    // 2. 成功策略提示
    const successes = activePatterns
      .filter(p => p.type === 'success_pattern')
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    for (const s of successes) {
      tips.push(`- [推荐] ${s.description}（已成功 ${s.count} 次）`);
    }

    // 3. 选择器提示
    const selectorTips = activePatterns
      .filter(p => p.type === 'selector_tip')
      .slice(0, 5);

    for (const t of selectorTips) {
      tips.push(`- [选择器] ${t.description}`);
    }

    if (tips.length === 0) return '';

    return `\n\n📋 已知优化建议（来自历史执行经验，请务必遵守）：\n${tips.join('\n')}`;
  }

  // 获取已应用的优化
  getOptimizations(): EvolutionOptimization[] {
    return this.optimizations;
  }

  // 标记问题已处理
  markPatternResolved(patternId: string) {
    const pattern = this.patterns.find(p => p.id === patternId);
    if (pattern) {
      pattern.applied = true;
      this.savePatterns();
    }
  }

  // 手动添加优化
  addOptimization(patternId: string, description: string, oldBehavior: string, newBehavior: string) {
    this.optimizations.push({
      id: uuidv4(),
      patternId,
      description,
      toolName: '',
      oldBehavior,
      newBehavior,
      appliedAt: new Date().toISOString(),
      effectiveness: 0,
    });
    this.saveOptimizations();
  }
}

export const agentEvolution = new AgentEvolution();
export default agentEvolution;
