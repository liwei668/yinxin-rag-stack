// 断层续聊服务

import { MemorySystem } from './memorySystem';
import { ThreeDimensionalFeature } from './branchManager';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

// 话题状态
export enum TopicStatus {
  ACTIVE = 'active',
  DORMANT = 'dormant',
  ARCHIVED = 'archived',
  CLOSED = 'closed'
}

// 话题指纹接口
export interface TopicFingerprint {
  subject: string;
  conflict: string;
  origin: string;
  hash: string;
  createdAt: Date;
}

// 断层续聊管理器类
class TopicContinuityManager {
  private memorySystem: MemorySystem;

  constructor() {
    this.memorySystem = MemorySystem.getInstance();
  }

  // 判定未闭合话题
  isUnclosedTopic(branch: any): boolean {
    // 分支状态标记为 "未结案"
    if (branch.status !== 'active') return false;

    // 存在 AI 给出的建议、方案，但未收到用户明确的采纳反馈
    // 这里简化处理，实际应用中需要分析对话历史
    const hasAIResponse = branch.conversation?.some((msg: any) => msg.role === 'assistant');
    const hasUserConfirmation = branch.conversation?.some((msg: any) => 
      msg.role === 'user' && 
      (msg.content.includes('采纳') || msg.content.includes('决定') || msg.content.includes('不再聊'))
    );

    // 无明确的话题结束标识
    const hasEndMarker = branch.conversation?.some((msg: any) => 
      msg.content.includes('结束') || msg.content.includes('不再聊') || msg.content.includes('完了')
    );

    return hasAIResponse && !hasUserConfirmation && !hasEndMarker;
  }

  // 生成话题指纹
  generateTopicFingerprint(branch: any): TopicFingerprint {
    // 提取三个维度的特征
    const subject = branch.feature?.subject || branch.title || '';
    const conflict = branch.feature?.event || branch.description || '';
    const origin = branch.feature?.request || branch.keywords?.join(' ') || '';

    // 生成哈希值
    const hash = createHash('sha256')
      .update(`${subject}-${conflict}-${origin}`)
      .digest('hex');

    return {
      subject,
      conflict,
      origin,
      hash,
      createdAt: new Date()
    };
  }

  // 存储话题指纹
  async storeTopicFingerprint(branchId: string, fingerprint: TopicFingerprint): Promise<void> {
    // 这里需要在MemoryBranch模型中添加fingerprint字段
    // 暂时存储在metadata字段中
    await this.memorySystem.updateBranch(branchId, {
      fingerprint
    });
  }

  // 触发分支休眠
  async dormancyBranch(branchId: string): Promise<void> {
    await this.memorySystem.updateBranch(branchId, {
      status: 'dormant',
      dormancyReason: 'user_switched_topic',
      dormancyAt: new Date()
    });
  }

  // 唤醒休眠分支
  async wakeupBranch(branchId: string): Promise<void> {
    await this.memorySystem.updateBranch(branchId, {
      status: 'active',
      dormancyReason: null,
      dormancyAt: null,
      wakeupAt: new Date()
    });
  }

  // 匹配话题指纹
  async matchFingerprint(userId: string, input: string): Promise<string | null> {
    // 获取用户的所有休眠分支
    const branches = await this.memorySystem.getUserBranches(userId);
    const dormantBranches = branches.filter((branch: any) => branch.status === 'dormant');

    if (dormantBranches.length === 0) return null;

    // 提取输入的特征
    const inputFeature = this.extractInputFeature(input);
    const inputFingerprint = this.generateInputFingerprint(inputFeature);

    // 匹配指纹
    for (const branch of dormantBranches) {
      if (branch.fingerprint) {
        const similarity = this.calculateFingerprintSimilarity(inputFingerprint, branch.fingerprint);
        if (similarity >= 0.8) {
          return branch.id;
        }
      }
    }

    return null;
  }

  // 提取输入特征
  private extractInputFeature(input: string): ThreeDimensionalFeature {
    // 简单的特征提取，实际应用中可以使用branchManager的方法
    const words = input.split(' ');
    return {
      subject: words[0] || '',
      event: words.slice(1, -1).join(' ') || '',
      request: words[words.length - 1] || ''
    };
  }

  // 生成输入指纹
  private generateInputFingerprint(feature: ThreeDimensionalFeature): string {
    return createHash('sha256')
      .update(`${feature.subject}-${feature.event}-${feature.request}`)
      .digest('hex');
  }

  // 计算指纹相似度
  private calculateFingerprintSimilarity(fingerprint1: string, fingerprint2: string): number {
    // 简单的字符串相似度计算，实际应用中可以使用更复杂的算法
    let matches = 0;
    for (let i = 0; i < Math.min(fingerprint1.length, fingerprint2.length); i++) {
      if (fingerprint1[i] === fingerprint2[i]) {
        matches++;
      }
    }
    return matches / Math.max(fingerprint1.length, fingerprint2.length);
  }

  // 处理留白状态
  async handleWhiteSpace(branch: any, newInput: string): Promise<string> {
    // 检索分支的记忆数据
    const conversation = branch.conversation || [];
    
    // 识别已给出的建议
    const aiResponses = conversation.filter((msg: any) => msg.role === 'assistant');
    const lastAIResponse = aiResponses[aiResponses.length - 1];

    // 生成后续响应
    if (lastAIResponse) {
      return `我记得之前我们讨论过关于 ${branch.title} 的问题，我建议 ${lastAIResponse.content.substring(0, 50)}... 现在你有什么新的想法或情况需要补充吗？`;
    }

    return `我们之前讨论过关于 ${branch.title} 的话题，现在你想继续聊这个吗？`;
  }

  // 完整的断层续聊处理
  async handleTopicContinuity(userId: string, input: string): Promise<{ 
    branchId: string | null; 
    isWakeup: boolean; 
    response: string | null 
  }> {
    // 尝试匹配休眠分支
    const matchedBranchId = await this.matchFingerprint(userId, input);

    if (matchedBranchId) {
      // 唤醒分支
      await this.wakeupBranch(matchedBranchId);
      
      // 获取分支信息
      const branch = await this.memorySystem.getBranch(userId, matchedBranchId);
      
      // 处理留白状态
      const response = await this.handleWhiteSpace(branch, input);
      
      return {
        branchId: matchedBranchId,
        isWakeup: true,
        response
      };
    }

    return {
      branchId: null,
      isWakeup: false,
      response: null
    };
  }
}

export default new TopicContinuityManager();
