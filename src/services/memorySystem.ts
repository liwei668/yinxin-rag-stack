import { fileStorage } from '../lib/fileStorage';
import { v4 as uuidv4 } from 'uuid';
import preferenceExtractor from './preferenceExtractor';
import { GlobalPreference } from './preferenceExtractor';

// 临时关联容器接口
export interface TemporaryAssociation {
  id: string;
  userId: string;
  branchIds: string[];
  coreFeatures: {
    subject: string;
    event: string;
    request: string;
  }[];
  createdAt: Date;
  lastAccessedAt: Date;
}

// 重复意图检测结果接口
export interface DuplicateIntentResult {
  isDuplicate: boolean;
  similarity: number;
  matchedItem?: {
    type: 'preference' | 'branch';
    id: string;
    content: string;
  };
  historyConclusion?: string;
}

export interface Preference {
  detailLevel: number;
  formality: number;
  examplePreference: number;
  structurePreference: 'list' | 'paragraph' | 'mixed';
  depthPreference: 'beginner' | 'practical' | 'professional';
  proactivity: number;
  learningStyle: 'visual' | 'textual' | 'mixed';
}

export interface CreateBranchOptions {
  title: string;
  description?: string;
  tags?: string[];
  keywords?: string[];
  isImportant?: boolean;
}

export interface MatchResult {
  branch: any;
  score: number;
  reason: string;
}

export enum BranchStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived'
}

export enum BranchPriority {
  HOT = 'hot',
  WARM = 'warm',
  COLD = 'cold'
}

export class MemorySystem {
  private static instance: MemorySystem;
  private initialized = false;

  private constructor() {}

  public static getInstance(): MemorySystem {
    if (!MemorySystem.instance) {
      MemorySystem.instance = new MemorySystem();
    }
    return MemorySystem.instance;
  }

  async connect() {
    if (!this.initialized) {
      fileStorage.init();
      this.initialized = true;
    }
  }

  async createBranch(userId: string, options: CreateBranchOptions & { feature?: any }) {
    await this.connect();
    
    const branch = {
      id: uuidv4(),
      userId,
      title: options.title,
      description: options.description || '',
      tags: options.tags || [],
      keywords: options.keywords || [],
      feature: options.feature || {
        subject: '',
        event: '',
        request: ''
      },
      isImportant: options.isImportant || false,
      isPinned: false,
      status: BranchStatus.ACTIVE,
      priority: BranchPriority.HOT,
      preference: {
        detailLevel: 0.5,
        formality: 0.5,
        examplePreference: 0.5,
        structurePreference: 'mixed',
        depthPreference: 'practical',
        proactivity: 0.5,
        learningStyle: 'mixed'
      },
      lastAccessedAt: new Date().toISOString(),
      accessedCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    fileStorage.addBranch(userId, branch);
    return branch;
  }

  async getBranch(userId: string, branchId: string) {
    await this.connect();
    
    const branch = fileStorage.findBranch(userId, branchId);
    if (!branch) return null;
    
    // 更新访问信息
    fileStorage.updateBranch(userId, branchId, {
      lastAccessedAt: new Date().toISOString(),
      accessedCount: (branch.accessedCount || 0) + 1,
      priority: BranchPriority.HOT
    });
    
    return fileStorage.findBranch(userId, branchId);
  }

  async updateBranch(branchId: string, updates: any) {
    await this.connect();
    return fileStorage.updateBranchGlobal(branchId, updates);
  }

  async getUserBranches(userId: string, options?: { 
    status?: BranchStatus;
    priority?: BranchPriority;
    limit?: number;
  }) {
    await this.connect();
    
    let branches = fileStorage.getBranches(userId);
    
    // 过滤状态
    const status = options?.status || BranchStatus.ACTIVE;
    branches = branches.filter((b: any) => b.status === status);
    
    // 过滤优先级
    if (options?.priority) {
      branches = branches.filter((b: any) => b.priority === options.priority);
    }
    
    // 排序
    branches.sort((a: any, b: any) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime();
    });
    
    // 限制数量
    const limit = options?.limit || 50;
    branches = branches.slice(0, limit);
    
    return branches;
  }

  async updateBranch(userId: string, branchId: string, updates: Partial<any>) {
    await this.connect();
    return fileStorage.updateBranch(userId, branchId, updates);
  }

  async deleteBranch(userId: string, branchId: string) {
    await this.connect();
    return fileStorage.deleteBranch(userId, branchId);
  }

  async matchBranch(userId: string, input: string): Promise<MatchResult | null> {
    await this.connect();
    
    const branches = await this.getUserBranches(userId);
    if (branches.length === 0) return null;

    const results: MatchResult[] = [];
    const inputLower = input.toLowerCase();

    for (const branch of branches) {
      let score = 0;
      const reasons: string[] = [];

      branch.keywords?.forEach((keyword: string) => {
        if (inputLower.includes(keyword.toLowerCase())) {
          score += 30;
          reasons.push(`关键词匹配: ${keyword}`);
        }
      });

      branch.tags?.forEach((tag: string) => {
        if (inputLower.includes(tag.toLowerCase())) {
          score += 20;
          reasons.push(`标签匹配: ${tag}`);
        }
      });

      const titleLower = branch.title.toLowerCase();
      if (inputLower.split(' ').some(word => titleLower.includes(word))) {
        score += 25;
        reasons.push('标题相似');
      }

      if (branch.isPinned) {
        score += 15;
        reasons.push('固定分支');
      }

      if (score > 0) {
        results.push({
          branch,
          score,
          reason: reasons.join(', ')
        });
      }
    }

    if (results.length === 0) return null;

    results.sort((a, b) => b.score - a.score);
    return results[0];
  }

  async getUserPreference(userId: string) {
    await this.connect();
    
    let preference = fileStorage.getPreference(userId);
    
    if (!preference) {
      preference = {
        userId,
        detailLevel: 0.5,
        formality: 0.5,
        examplePreference: 0.5,
        structurePreference: 'mixed',
        depthPreference: 'practical',
        proactivity: 0.5,
        learningStyle: 'mixed',
        globalPreference: {
          communicationHabit: {},
          fixedAttribute: {
            coreScenarios: [],
            longTermNeeds: [],
            constraints: [],
            taboos: []
          },
          behaviorPattern: {
            questionFrequency: 'low',
            focusPoints: [],
            commonPhrases: [],
            feedbackStyle: 'none'
          }
        },
        interactionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        learningHistory: []
      };
      fileStorage.setPreference(userId, preference);
    }

    return preference;
  }

  async updateUserPreference(userId: string, updates: Partial<Preference>) {
    await this.connect();
    return fileStorage.updatePreference(userId, updates);
  }

  // 提取和更新用户偏好
  async extractAndUpdatePreference(userId: string, input: string) {
    await this.connect();
    
    const preference = await this.getUserPreference(userId);
    const interactionCount = (preference.interactionCount || 0) + 1;
    
    const extractedPreference = preferenceExtractor.extractPreference(input, interactionCount);
    const isActiveCorrection = preferenceExtractor.detectActiveCorrection(input);
    
    const updates: any = {
      interactionCount,
      updatedAt: new Date().toISOString()
    };
    
    if (extractedPreference.communicationHabit) {
      updates['globalPreference.communicationHabit'] = {
        ...(preference.globalPreference?.communicationHabit || {}),
        ...extractedPreference.communicationHabit
      };
    }
    
    if (extractedPreference.fixedAttribute) {
      if (extractedPreference.fixedAttribute.coreScenarios) {
        const existing = preference.globalPreference?.fixedAttribute?.coreScenarios || [];
        const fresh = extractedPreference.fixedAttribute.coreScenarios.filter(
          (s: string) => !existing.includes(s)
        );
        updates['globalPreference.fixedAttribute.coreScenarios'] = [...existing, ...fresh];
      }
      if (extractedPreference.fixedAttribute.longTermNeeds) {
        const existing = preference.globalPreference?.fixedAttribute?.longTermNeeds || [];
        const fresh = extractedPreference.fixedAttribute.longTermNeeds.filter(
          (n: string) => !existing.includes(n)
        );
        updates['globalPreference.fixedAttribute.longTermNeeds'] = [...existing, ...fresh];
      }
      if (extractedPreference.fixedAttribute.constraints) {
        const existing = preference.globalPreference?.fixedAttribute?.constraints || [];
        const fresh = extractedPreference.fixedAttribute.constraints.filter(
          (c: string) => !existing.includes(c)
        );
        updates['globalPreference.fixedAttribute.constraints'] = [...existing, ...fresh];
      }
      if (extractedPreference.fixedAttribute.taboos) {
        const existing = preference.globalPreference?.fixedAttribute?.taboos || [];
        const fresh = extractedPreference.fixedAttribute.taboos.filter(
          (t: string) => !existing.includes(t)
        );
        updates['globalPreference.fixedAttribute.taboos'] = [...existing, ...fresh];
      }
    }
    
    if (extractedPreference.behaviorPattern) {
      updates['globalPreference.behaviorPattern'] = {
        ...(preference.globalPreference?.behaviorPattern || {}),
        ...extractedPreference.behaviorPattern
      };
    }
    
    const learningHistoryEntry = {
      timestamp: new Date().toISOString(),
      signalType: isActiveCorrection ? 'active_correction' : 'implicit_feedback',
      signalValue: extractedPreference,
      confidence: isActiveCorrection ? 0.9 : 0.7
    };
    
    const learningHistory = [...(preference.learningHistory || []), learningHistoryEntry];
    updates.learningHistory = learningHistory;
    
    return fileStorage.updatePreference(userId, updates);
  }

  async learnFromSignal(userId: string, signalType: string, signalValue: any, confidence = 0.5) {
    await this.connect();
    
    const preference = await this.getUserPreference(userId);
    const updates: Partial<Preference> = {};
    const learningRate = 0.1 * confidence;

    switch (signalType) {
      case 'user_wants_more_detail':
        updates.detailLevel = Math.min(1, (preference.detailLevel || 0.5) + learningRate);
        break;
      case 'user_wants_less_detail':
        updates.detailLevel = Math.max(0, (preference.detailLevel || 0.5) - learningRate);
        break;
      case 'user_wants_examples':
        updates.examplePreference = Math.min(1, (preference.examplePreference || 0.5) + learningRate);
        break;
      case 'user_asks_simpler':
        updates.depthPreference = 'beginner';
        break;
      case 'user_asks_more_technical':
        updates.depthPreference = 'professional';
        break;
    }

    if (Object.keys(updates).length > 0) {
      await this.updateUserPreference(userId, updates);
      
      const updatedPref = fileStorage.getPreference(userId);
      if (updatedPref) {
        if (!updatedPref.learningHistory) {
          updatedPref.learningHistory = [];
        }
        updatedPref.learningHistory.push({
          signalType,
          signalValue,
          confidence,
          timestamp: new Date().toISOString()
        });
        fileStorage.setPreference(userId, updatedPref);
      }
    }

    return updates;
  }

  async updateBranchPriorities(userId: string) {
    await this.connect();
    
    const branches = fileStorage.getBranches(userId);
    const now = Date.now();

    for (const branch of branches) {
      let newPriority = BranchPriority.COLD;
      const daysSinceAccess = (now - new Date(branch.lastAccessedAt).getTime()) / (1000 * 60 * 60 * 24);
      
      if (branch.isPinned || branch.isImportant) {
        newPriority = BranchPriority.HOT;
      } else if (daysSinceAccess <= 7) {
        newPriority = BranchPriority.HOT;
      } else if (daysSinceAccess <= 30) {
        newPriority = BranchPriority.WARM;
      }

      fileStorage.updateBranch(userId, branch.id, { priority: newPriority });
    }
  }

  // 交叉分支处理
  async handleCrossBranch(userId: string, input: string): Promise<TemporaryAssociation | null> {
    await this.connect();
    
    const branches = await this.getUserBranches(userId);
    if (branches.length < 2) return null;

    const inputFeatures = this.extractThreeDimensionalFeatures(input);
    const relevantBranches = [];
    
    for (const branch of branches) {
      const branchFeatures = {
        subject: branch.title || '',
        event: branch.description || '',
        request: branch.keywords?.join(' ') || ''
      };
      
      const similarity = this.calculateFeatureSimilarity(inputFeatures, branchFeatures);
      if (similarity >= 0.6) {
        relevantBranches.push(branch);
      }
    }

    if (relevantBranches.length < 2) return null;

    const association: TemporaryAssociation = {
      id: uuidv4(),
      userId,
      branchIds: relevantBranches.map(b => b.id),
      coreFeatures: relevantBranches.map(b => ({
        subject: b.title || '',
        event: b.description || '',
        request: b.keywords?.join(' ') || ''
      })),
      createdAt: new Date(),
      lastAccessedAt: new Date()
    };

    fileStorage.addAssociation(userId, association);
    return association;
  }

  async cleanupTemporaryAssociations(userId: string) {
    await this.connect();
    fileStorage.cleanAssociations(userId, 3600000);
  }

  // 重复意图检测
  async detectDuplicateIntent(userId: string, input: string): Promise<DuplicateIntentResult> {
    await this.connect();

    const preference = await this.getUserPreference(userId);
    const preferenceTexts = [
      `detailLevel: ${preference.detailLevel}`,
      `formality: ${preference.formality}`,
      `examplePreference: ${preference.examplePreference}`,
      `structurePreference: ${preference.structurePreference}`,
      `depthPreference: ${preference.depthPreference}`,
      `proactivity: ${preference.proactivity}`,
      `learningStyle: ${preference.learningStyle}`
    ];

    const branches = await this.getUserBranches(userId);
    const branchTexts = branches.map(b => ({
      id: b.id,
      text: `${b.title} ${b.description} ${b.keywords?.join(' ')}`
    }));

    let maxSimilarity = 0;
    let matchedItem = undefined;

    for (const text of preferenceTexts) {
      const similarity = this.calculateTextSimilarity(input, text);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        matchedItem = {
          type: 'preference' as const,
          id: preference.userId,
          content: text
        };
      }
    }

    for (const branch of branchTexts) {
      const similarity = this.calculateTextSimilarity(input, branch.text);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        matchedItem = {
          type: 'branch' as const,
          id: branch.id,
          content: branch.text
        };
      }
    }

    if (maxSimilarity >= 0.85) {
      return { isDuplicate: true, similarity: maxSimilarity, matchedItem };
    } else if (maxSimilarity >= 0.7) {
      return { isDuplicate: false, similarity: maxSimilarity, matchedItem };
    } else {
      return { isDuplicate: false, similarity: maxSimilarity };
    }
  }

  private extractThreeDimensionalFeatures(input: string) {
    return {
      subject: input.split(' ')[0] || '',
      event: input,
      request: input
    };
  }

  private calculateFeatureSimilarity(
    feature1: { subject: string; event: string; request: string },
    feature2: { subject: string; event: string; request: string }
  ): number {
    const subjectSimilarity = this.calculateTextSimilarity(feature1.subject, feature2.subject);
    const eventSimilarity = this.calculateTextSimilarity(feature1.event, feature2.event);
    const requestSimilarity = this.calculateTextSimilarity(feature1.request, feature2.request);
    return (subjectSimilarity + eventSimilarity + requestSimilarity) / 3;
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    const vec1 = this.textToVector(text1);
    const vec2 = this.textToVector(text2);
    return this.cosineSimilarity(vec1, vec2);
  }

  private textToVector(text: string): number[] {
    const words = text.toLowerCase().split(/\s+/);
    const wordSet = new Set(words);
    const wordMap = new Map<string, number>();
    
    wordSet.forEach(word => wordMap.set(word, wordMap.size));
    
    const vector: number[] = new Array(wordMap.size).fill(0);
    words.forEach(word => {
      const index = wordMap.get(word);
      if (index !== undefined) {
        vector[index]++;
      }
    });
    
    return vector;
  }

  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    const maxLength = Math.max(vec1.length, vec2.length);
    const paddedVec1 = [...vec1];
    const paddedVec2 = [...vec2];
    
    while (paddedVec1.length < maxLength) paddedVec1.push(0);
    while (paddedVec2.length < maxLength) paddedVec2.push(0);
    
    let dotProduct = 0;
    for (let i = 0; i < maxLength; i++) {
      dotProduct += paddedVec1[i] * paddedVec2[i];
    }
    
    const magnitude1 = Math.sqrt(paddedVec1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(paddedVec2.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitude1 === 0 || magnitude2 === 0) return 0;
    return dotProduct / (magnitude1 * magnitude2);
  }
}

export default MemorySystem.getInstance();
