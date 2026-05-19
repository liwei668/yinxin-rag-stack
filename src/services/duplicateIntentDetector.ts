// 重复意图检测服务

import { MemorySystem } from './memorySystem';
import { cosineSimilarity } from '../lib/vectorUtils';

// 重复意图检测结果
export interface DuplicateIntentResult {
  isDuplicate: boolean;
  similarity: number;
  matchedItem?: {
    type: 'preference' | 'branch';
    id: string;
    content: string;
    conclusion?: string;
  };
  historyConclusion?: string;
}

// 重复意图检测器类
class DuplicateIntentDetector {
  private memorySystem: MemorySystem;

  constructor() {
    this.memorySystem = MemorySystem.getInstance();
  }

  // 检测重复意图
  async detectDuplicateIntent(userId: string, input: string, currentBranchId?: string): Promise<DuplicateIntentResult> {
    await this.memorySystem.connect();

    // 1. 检查全局偏好
    const preference = await this.memorySystem.getUserPreference(userId);
    const preferenceTexts = this.extractPreferenceTexts(preference);

    // 2. 检查所有分支
    const branches = await this.memorySystem.getUserBranches(userId);
    const branchTexts = this.extractBranchTexts(branches);

    // 3. 计算相似度
    let maxSimilarity = 0;
    let matchedItem = undefined;

    // 先比对全局偏好相关问题
    for (const text of preferenceTexts) {
      const similarity = this.calculateTextSimilarity(input, text.content);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        matchedItem = {
          type: 'preference' as const,
          id: preference.userId,
          content: text.content,
          conclusion: text.conclusion
        };
      }
    }

    // 再比对当前匹配分支的历史问题
    if (currentBranchId) {
      const currentBranch = branchTexts.find(branch => branch.id === currentBranchId);
      if (currentBranch) {
        for (const text of currentBranch.texts) {
          const similarity = this.calculateTextSimilarity(input, text.content);
          if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
            matchedItem = {
              type: 'branch' as const,
              id: currentBranch.id,
              content: text.content,
              conclusion: text.conclusion
            };
          }
        }
      }
    }

    // 最后比对其他分支的历史问题
    for (const branch of branchTexts) {
      if (branch.id !== currentBranchId) {
        for (const text of branch.texts) {
          const similarity = this.calculateTextSimilarity(input, text.content);
          if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
            matchedItem = {
              type: 'branch' as const,
              id: branch.id,
              content: text.content,
              conclusion: text.conclusion
            };
          }
        }
      }
    }

    // 4. 根据阈值判定
    if (maxSimilarity >= 0.85) {
      // 重复/相似问题
      return {
        isDuplicate: true,
        similarity: parseFloat(maxSimilarity.toFixed(2)),
        matchedItem,
        historyConclusion: matchedItem?.conclusion
      };
    } else if (maxSimilarity >= 0.7) {
      // 相似但非重复问题
      return {
        isDuplicate: false,
        similarity: parseFloat(maxSimilarity.toFixed(2)),
        matchedItem
      };
    } else {
      // 新问题
      return {
        isDuplicate: false,
        similarity: parseFloat(maxSimilarity.toFixed(2))
      };
    }
  }

  // 提取偏好文本
  private extractPreferenceTexts(preference: any): Array<{ content: string; conclusion?: string }> {
    const texts = [];

    // 提取偏好相关的文本
    if (preference.detailLevel !== undefined) {
      texts.push({ content: `详细程度 ${preference.detailLevel}` });
    }
    if (preference.formality !== undefined) {
      texts.push({ content: `正式程度 ${preference.formality}` });
    }
    if (preference.examplePreference !== undefined) {
      texts.push({ content: `示例偏好 ${preference.examplePreference}` });
    }
    if (preference.structurePreference) {
      texts.push({ content: `结构偏好 ${preference.structurePreference}` });
    }
    if (preference.depthPreference) {
      texts.push({ content: `深度偏好 ${preference.depthPreference}` });
    }
    if (preference.proactivity !== undefined) {
      texts.push({ content: `主动性 ${preference.proactivity}` });
    }
    if (preference.learningStyle) {
      texts.push({ content: `学习风格 ${preference.learningStyle}` });
    }

    // 提取全局偏好
    if (preference.globalPreference) {
      const gp = preference.globalPreference;
      if (gp.communicationHabit?.responseStyle) {
        texts.push({ content: `响应风格 ${gp.communicationHabit.responseStyle}` });
      }
      if (gp.communicationHabit?.communicationStyle) {
        texts.push({ content: `沟通方式 ${gp.communicationHabit.communicationStyle}` });
      }
      if (gp.communicationHabit?.outputFormat) {
        texts.push({ content: `输出形式 ${gp.communicationHabit.outputFormat}` });
      }
    }

    return texts;
  }

  // 提取分支文本
  private extractBranchTexts(branches: any[]): Array<{ id: string; texts: Array<{ content: string; conclusion?: string }> }> {
    return branches.map(branch => {
      const texts = [];

      // 提取分支标题和描述
      if (branch.title) {
        texts.push({ content: branch.title });
      }
      if (branch.description) {
        texts.push({ content: branch.description });
      }
      if (branch.keywords && branch.keywords.length > 0) {
        texts.push({ content: branch.keywords.join(' ') });
      }

      // 提取分支特征
      if (branch.feature) {
        if (branch.feature.subject) {
          texts.push({ content: branch.feature.subject });
        }
        if (branch.feature.event) {
          texts.push({ content: branch.feature.event });
        }
        if (branch.feature.request) {
          texts.push({ content: branch.feature.request });
        }
      }

      // 提取分支对话历史（如果有）
      if (branch.conversation) {
        branch.conversation.forEach((msg: any) => {
          if (msg.role === 'user') {
            texts.push({ content: msg.content });
          } else if (msg.role === 'assistant') {
            texts.push({ content: msg.content, conclusion: msg.content });
          }
        });
      }

      return { id: branch.id, texts };
    });
  }

  // 计算文本相似度
  private calculateTextSimilarity(text1: string, text2: string): number {
    const vec1 = this.textToVector(text1);
    const vec2 = this.textToVector(text2);
    return cosineSimilarity(vec1, vec2);
  }

  // 将文本转换为向量
  private textToVector(text: string): number[] {
    const words = text.toLowerCase().split(/\s+/);
    const wordSet = new Set(words);
    const wordMap = new Map<string, number>();

    // 构建词袋
    wordSet.forEach(word => wordMap.set(word, wordMap.size));

    // 生成向量
    const vector: number[] = [];
    wordSet.forEach(word => {
      vector.push(words.filter(w => w === word).length);
    });

    return vector;
  }

  // 处理重复意图
  async handleDuplicateIntent(userId: string, input: string, currentBranchId?: string): Promise<{ 
    isDuplicate: boolean; 
    response: string | null; 
    similarity: number 
  }> {
    const result = await this.detectDuplicateIntent(userId, input, currentBranchId);

    if (result.isDuplicate && result.historyConclusion) {
      // 直接使用历史结论
      return {
        isDuplicate: true,
        response: result.historyConclusion,
        similarity: result.similarity
      };
    }

    return {
      isDuplicate: false,
      response: null,
      similarity: result.similarity
    };
  }
}

export default new DuplicateIntentDetector();
