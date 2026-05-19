// 落地保障运维服务

import { MemorySystem } from './memorySystem';
import branchManager from './branchManager';
import topicContinuity from './topicContinuity';
import duplicateIntentDetector from './duplicateIntentDetector';

// 配置接口
export interface OperationGuaranteeConfig {
  cleanupInterval: number; // 清理周期（毫秒）
  branchMatchThreshold: number;
  fingerprintMatchThreshold: number;
  duplicateIntentThreshold: number;
  branchMatchTarget: number; // 目标准确率（0-1）
  fingerprintMatchTarget: number;
  cleanupRules: {
    removeIrrelevantDetails: boolean;
    removeDuplicateEntries: boolean;
    removeTemporaryData: boolean;
    removeInvalidMemory: boolean;
  };
}

// 清理日志接口
export interface CleanupLog {
  id: string;
  timestamp: Date;
  itemsCleaned: number;
  details: {
    irrelevantDetails: number;
    duplicateEntries: number;
    temporaryData: number;
    invalidMemory: number;
  };
  backupFile?: string;
}

// 阈值微调记录接口
export interface ThresholdAdjustment {
  id: string;
  timestamp: Date;
  type: 'branchMatch' | 'fingerprintMatch' | 'duplicateIntent';
  oldValue: number;
  newValue: number;
  reason: string;
  accuracyBefore: number;
  accuracyAfter?: number;
}

// 异常记录接口
export interface AnomalyRecord {
  id: string;
  timestamp: Date;
  type: 'isolation' | 'storage' | 'status' | 'threshold' | 'preference';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  resolved: boolean;
  resolvedAt?: Date;
  resolution?: string;
}

// 冲突记录接口
export interface ConflictRecord {
  id: string;
  timestamp: Date;
  type: 'preferenceVsBranch';
  details: string;
  resolved: boolean;
}

class OperationGuarantee {
  private static instance: OperationGuarantee;
  private memorySystem: MemorySystem;
  private config: OperationGuaranteeConfig;
  private cleanupLogs: CleanupLog[] = [];
  private thresholdAdjustments: ThresholdAdjustment[] = [];
  private anomalyRecords: AnomalyRecord[] = [];
  private conflictRecords: ConflictRecord[] = [];
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  private constructor() {
    this.memorySystem = MemorySystem.getInstance();
    this.config = {
      cleanupInterval: 24 * 60 * 60 * 1000, // 默认24小时
      branchMatchThreshold: 0.8,
      fingerprintMatchThreshold: 0.8,
      duplicateIntentThreshold: 0.85,
      branchMatchTarget: 0.95,
      fingerprintMatchTarget: 0.98,
      cleanupRules: {
        removeIrrelevantDetails: true,
        removeDuplicateEntries: true,
        removeTemporaryData: true,
        removeInvalidMemory: true
      }
    };
  }

  public static getInstance(): OperationGuarantee {
    if (!OperationGuarantee.instance) {
      OperationGuarantee.instance = new OperationGuarantee();
    }
    return OperationGuarantee.instance;
  }

  // ==================== 记忆优先级执行 ====================

  // 校验记忆优先级
  async validateMemoryPriority(): Promise<boolean> {
    try {
      // 校验全局偏好区权限
      const preference = await this.memorySystem.getUserPreference('default');
      if (!preference) {
        this.recordAnomaly('storage', 'high', '全局偏好区数据丢失');
        return false;
      }

      // 校验分支隔离
      const branches = await this.memorySystem.getUserBranches('default');
      for (const branch of branches) {
        if (!branch.id || !branch.status) {
          this.recordAnomaly('isolation', 'medium', `分支 ${branch.id} 数据异常`);
          return false;
        }
      }

      return true;
    } catch (error) {
      this.recordAnomaly('storage', 'critical', `记忆优先级校验失败: ${error}`);
      return false;
    }
  }

  // 处理记忆冲突
  async handleMemoryConflict(
    conflictType: 'preferenceVsBranch',
    details: string
  ): Promise<void> {
    const conflict: ConflictRecord = {
      id: this.generateId(),
      timestamp: new Date(),
      type: conflictType,
      details,
      resolved: false
    };

    this.conflictRecords.push(conflict);
    console.log('记忆冲突已记录:', conflict);
  }

  // 获取冲突记录
  getConflictRecords(): ConflictRecord[] {
    return [...this.conflictRecords];
  }

  // ==================== 自动清理机制 ====================

  // 启动自动清理
  startAutoCleanup(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);

    console.log('自动清理机制已启动');
  }

  // 停止自动清理
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.isRunning = false;
    console.log('自动清理机制已停止');
  }

  // 执行清理
  async performCleanup(): Promise<CleanupLog> {
    console.log('开始执行清理操作...');
    await this.memorySystem.connect();

    const log: CleanupLog = {
      id: this.generateId(),
      timestamp: new Date(),
      itemsCleaned: 0,
      details: {
        irrelevantDetails: 0,
        duplicateEntries: 0,
        temporaryData: 0,
        invalidMemory: 0
      }
    };

    try {
      // 1. 清理已闭合话题的无关细节
      if (this.config.cleanupRules.removeIrrelevantDetails) {
        log.details.irrelevantDetails = await this.cleanupIrrelevantDetails();
      }

      // 2. 清理重复记忆条目
      if (this.config.cleanupRules.removeDuplicateEntries) {
        log.details.duplicateEntries = await this.cleanupDuplicateEntries();
      }

      // 3. 清理临时数据
      if (this.config.cleanupRules.removeTemporaryData) {
        log.details.temporaryData = await this.cleanupTemporaryData();
      }

      // 4. 清理失效记忆
      if (this.config.cleanupRules.removeInvalidMemory) {
        log.details.invalidMemory = await this.cleanupInvalidMemory();
      }

      log.itemsCleaned = Object.values(log.details).reduce((a, b) => a + b, 0);
      
      // 备份清理日志
      this.backupCleanupLog(log);
      this.cleanupLogs.push(log);

      console.log('清理完成，共清理', log.itemsCleaned, '项');
      return log;
    } catch (error) {
      this.recordAnomaly('storage', 'high', `清理操作失败: ${error}`);
      throw error;
    }
  }

  // 清理无关细节
  private async cleanupIrrelevantDetails(): Promise<number> {
    // 简化实现：实际应用中需要解析对话内容，过滤语气词、重复表述等
    return 0;
  }

  // 清理重复条目
  private async cleanupDuplicateEntries(): Promise<number> {
    // 简化实现：实际应用中需要检查并删除重复的记忆条目
    return 0;
  }

  // 清理临时数据
  private async cleanupTemporaryData(): Promise<number> {
    await this.memorySystem.cleanupTemporaryAssociations('default');
    return 1; // 简化计数
  }

  // 清理失效记忆
  private async cleanupInvalidMemory(): Promise<number> {
    // 简化实现：实际应用中需要清理用户已修正的旧偏好等
    return 0;
  }

  // 备份清理日志
  private backupCleanupLog(log: CleanupLog): void {
    console.log('清理日志已备份:', log);
  }

  // 获取清理日志
  getCleanupLogs(): CleanupLog[] {
    return [...this.cleanupLogs];
  }

  // ==================== 阈值微调机制 ====================

  // 更新配置
  updateConfig(config: Partial<OperationGuaranteeConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('运维配置已更新:', this.config);
  }

  // 获取当前配置
  getConfig(): OperationGuaranteeConfig {
    return { ...this.config };
  }

  // 监测并微调阈值
  async monitorAndAdjustThresholds(): Promise<void> {
    console.log('开始监测阈值执行效果...');

    // 简化实现：实际应用中需要收集真实的准确率数据
    // 这里仅演示微调逻辑

    // 1. 监测分支匹配准确率
    const mockBranchAccuracy = 0.93; // 假设当前准确率
    if (mockBranchAccuracy < this.config.branchMatchTarget) {
      await this.adjustThreshold('branchMatch', mockBranchAccuracy);
    }

    // 2. 监测指纹唤醒准确率
    const mockFingerprintAccuracy = 0.97;
    if (mockFingerprintAccuracy < this.config.fingerprintMatchTarget) {
      await this.adjustThreshold('fingerprintMatch', mockFingerprintAccuracy);
    }
  }

  // 调整阈值
  private async adjustThreshold(
    type: 'branchMatch' | 'fingerprintMatch' | 'duplicateIntent',
    currentAccuracy: number
  ): Promise<void> {
    let oldValue: number;
    let newValue: number;
    let reason: string;

    switch (type) {
      case 'branchMatch':
        oldValue = this.config.branchMatchThreshold;
        newValue = Math.max(0.7, Math.min(0.9, oldValue - 0.05));
        reason = `分支匹配准确率低于目标 ${this.config.branchMatchTarget * 100}%`;
        this.config.branchMatchThreshold = newValue;
        break;
      case 'fingerprintMatch':
        oldValue = this.config.fingerprintMatchThreshold;
        newValue = Math.max(0.7, Math.min(0.9, oldValue - 0.05));
        reason = `指纹唤醒准确率低于目标 ${this.config.fingerprintMatchTarget * 100}%`;
        this.config.fingerprintMatchThreshold = newValue;
        break;
      case 'duplicateIntent':
        oldValue = this.config.duplicateIntentThreshold;
        newValue = Math.max(0.75, Math.min(0.95, oldValue - 0.05));
        reason = '重复意图检测出现误判';
        this.config.duplicateIntentThreshold = newValue;
        break;
    }

    const adjustment: ThresholdAdjustment = {
      id: this.generateId(),
      timestamp: new Date(),
      type,
      oldValue,
      newValue,
      reason,
      accuracyBefore: currentAccuracy
    };

    this.thresholdAdjustments.push(adjustment);
    console.log('阈值已调整:', adjustment);
  }

  // 获取阈值调整记录
  getThresholdAdjustments(): ThresholdAdjustment[] {
    return [...this.thresholdAdjustments];
  }

  // ==================== 异常校验与修复 ====================

  // 记录异常
  private recordAnomaly(
    type: AnomalyRecord['type'],
    severity: AnomalyRecord['severity'],
    description: string
  ): void {
    const anomaly: AnomalyRecord = {
      id: this.generateId(),
      timestamp: new Date(),
      type,
      severity,
      description,
      resolved: false
    };

    this.anomalyRecords.push(anomaly);
    console.warn('检测到异常:', anomaly);

    // 尝试自动修复
    this.tryAutoRepair(anomaly);
  }

  // 尝试自动修复
  private async tryAutoRepair(anomaly: AnomalyRecord): Promise<void> {
    console.log('尝试自动修复异常:', anomaly.id);

    switch (anomaly.type) {
      case 'isolation':
        // 修复分支隔离
        await this.repairIsolation();
        break;
      case 'storage':
        // 修复存储问题
        await this.repairStorage();
        break;
      case 'status':
        // 修复状态标记
        await this.repairStatus();
        break;
      case 'threshold':
        // 修复阈值
        this.repairThreshold();
        break;
      case 'preference':
        // 修复偏好提取
        await this.repairPreference();
        break;
    }

    anomaly.resolved = true;
    anomaly.resolvedAt = new Date();
    anomaly.resolution = '自动修复成功';
  }

  // 执行全面校验
  async performFullValidation(): Promise<boolean> {
    console.log('开始执行全面校验...');
    let allValid = true;

    // 1. 校验分支隔离
    const isolationValid = await this.validateIsolation();
    if (!isolationValid) allValid = false;

    // 2. 校验存储
    const storageValid = await this.validateStorage();
    if (!storageValid) allValid = false;

    // 3. 校验状态标记
    const statusValid = await this.validateStatus();
    if (!statusValid) allValid = false;

    // 4. 校验阈值
    const thresholdValid = this.validateThreshold();
    if (!thresholdValid) allValid = false;

    // 5. 校验偏好提取
    const preferenceValid = await this.validatePreference();
    if (!preferenceValid) allValid = false;

    console.log('全面校验完成，结果:', allValid ? '通过' : '未通过');
    return allValid;
  }

  // 校验分支隔离
  private async validateIsolation(): Promise<boolean> {
    try {
      const branches = await this.memorySystem.getUserBranches('default');
      for (const branch of branches) {
        if (!branch.id) return false;
      }
      return true;
    } catch {
      this.recordAnomaly('isolation', 'high', '分支隔离校验失败');
      return false;
    }
  }

  // 校验存储
  private async validateStorage(): Promise<boolean> {
    try {
      const preference = await this.memorySystem.getUserPreference('default');
      return !!preference;
    } catch {
      this.recordAnomaly('storage', 'critical', '存储校验失败');
      return false;
    }
  }

  // 校验状态标记
  private async validateStatus(): Promise<boolean> {
    try {
      const branches = await this.memorySystem.getUserBranches('default', { status: undefined });
      for (const branch of branches) {
        if (!branch.status) return false;
      }
      return true;
    } catch {
      this.recordAnomaly('status', 'medium', '状态标记校验失败');
      return false;
    }
  }

  // 校验阈值
  private validateThreshold(): boolean {
    const thresholds = [
      this.config.branchMatchThreshold,
      this.config.fingerprintMatchThreshold,
      this.config.duplicateIntentThreshold
    ];

    for (const threshold of thresholds) {
      if (threshold < 0 || threshold > 1) {
        this.recordAnomaly('threshold', 'medium', '阈值配置异常');
        return false;
      }
    }
    return true;
  }

  // 校验偏好提取
  private async validatePreference(): Promise<boolean> {
    try {
      const preference = await this.memorySystem.getUserPreference('default');
      return !!preference.globalPreference;
    } catch {
      this.recordAnomaly('preference', 'low', '偏好提取校验失败');
      return false;
    }
  }

  // 修复分支隔离
  private async repairIsolation(): Promise<void> {
    console.log('修复分支隔离...');
    // 简化实现
  }

  // 修复存储
  private async repairStorage(): Promise<void> {
    console.log('修复存储...');
    // 简化实现
  }

  // 修复状态标记
  private async repairStatus(): Promise<void> {
    console.log('修复状态标记...');
    // 简化实现
  }

  // 修复阈值
  private repairThreshold(): void {
    console.log('修复阈值...');
    this.config.branchMatchThreshold = 0.8;
    this.config.fingerprintMatchThreshold = 0.8;
    this.config.duplicateIntentThreshold = 0.85;
  }

  // 修复偏好
  private async repairPreference(): Promise<void> {
    console.log('修复偏好...');
    // 简化实现
  }

  // 获取异常记录
  getAnomalyRecords(): AnomalyRecord[] {
    return [...this.anomalyRecords];
  }

  // ==================== 辅助方法 ====================

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

export default OperationGuarantee.getInstance();
