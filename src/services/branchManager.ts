// 分支管理服务

import { v4 as uuidv4 } from 'uuid';
import { MemorySystem } from './memorySystem';
import { cosineSimilarity } from '../lib/vectorUtils';

// 三维特征接口
export interface ThreeDimensionalFeature {
  subject: string; // 主体
  event: string; // 核心事件
  request: string; // 核心诉求
}

// 分支匹配结果
export interface BranchMatchResult {
  branchId: string | null;
  similarity: number;
  isNew: boolean;
  feature: ThreeDimensionalFeature;
}

// 分支管理器类
class BranchManager {
  private memorySystem: MemorySystem;
  private currentBranchId: string | null = null;

  constructor() {
    this.memorySystem = MemorySystem.getInstance();
  }

  // 提取三维特征
  extractThreeDimensionalFeature(input: string): ThreeDimensionalFeature {
    // 过滤无关冗余内容
    const filteredInput = this.filterIrrelevantContent(input);

    // 提取主体
    const subject = this.extractSubject(filteredInput);

    // 提取核心事件
    const event = this.extractEvent(filteredInput, subject);

    // 提取核心诉求
    const request = this.extractRequest(filteredInput);

    return {
      subject,
      event,
      request
    };
  }

  // 过滤无关冗余内容
  private filterIrrelevantContent(input: string): string {
    // 移除语气词、无关铺垫、重复表述
    const irrelevantPatterns = [
      /[嗯啊哦呢吧嘛哈嘿]*$/g,
      /^[嗯啊哦呢吧嘛哈嘿]*\s*/g,
      /\s+([^\s]+)\s+\1\s+/g,
      /(请|麻烦|请问|你好|您好|谢谢|多谢)\s*/g
    ];

    let filtered = input;
    irrelevantPatterns.forEach(pattern => {
      filtered = filtered.replace(pattern, '');
    });

    return filtered.trim();
  }

  // 提取主体
  private extractSubject(input: string): string {
    // 简单的主体提取，实际应用中可以使用NLP模型
    const subjectKeywords = [
      '我', '你', '他', '她', '它', '我们', '你们', '他们',
      '这个', '那个', '这些', '那些',
      '产品', '服务', '系统', '功能', '问题', '需求'
    ];

    for (const keyword of subjectKeywords) {
      if (input.includes(keyword)) {
        return keyword;
      }
    }

    // 如果没有找到明显主体，返回"用户"
    return '用户';
  }

  // 提取核心事件
  private extractEvent(input: string, subject: string): string {
    // 提取核心事件
    const eventPatterns = [
      /(需要|想要|希望|要求|请求|建议|投诉|反馈|咨询|询问|了解|学习|使用|购买|升级|维修|安装|配置|调试|测试|部署|运行|维护|优化|改进|解决|处理|应对|预防|避免|减少|增加|提高|降低|改变|调整|更新|升级|降级|替换|删除|添加|创建|修改|删除|查询|搜索|浏览|查看|下载|上传|分享|保存|备份|恢复|重置|重启|关闭|打开|启动|停止|暂停|继续|执行|完成|结束|开始|进行|实施|执行|操作|处理|管理|控制|监控|观察|检查|审核|评估|分析|研究|调查|测试|验证|确认|保证|确保|维持|保持|保护|保障|维护|维修|修复|解决|处理|应对|预防|避免|减少|增加|提高|降低|改变|调整|更新|升级|降级|替换|删除|添加|创建|修改|删除|查询|搜索|浏览|查看|下载|上传|分享|保存|备份|恢复|重置|重启|关闭|打开|启动|停止|暂停|继续|执行|完成|结束|开始|进行|实施|执行|操作|处理|管理|控制|监控|观察|检查|审核|评估|分析|研究|调查|测试|验证|确认|保证|确保|维持|保持|保护|保障)/g
    ];

    let events: string[] = [];
    eventPatterns.forEach(pattern => {
      const matches = input.match(pattern);
      if (matches) {
        events = [...events, ...matches];
      }
    });

    if (events.length > 0) {
      return events.join('、');
    }

    // 如果没有找到明显事件，返回"咨询"
    return '咨询';
  }

  // 提取核心诉求
  private extractRequest(input: string): string {
    // 提取核心诉求
    const requestPatterns = [
      /(什么|怎么|如何|为什么|哪里|何时|多少|是否|能否|可不可以|有没有|是不是|对不对|好不好|行不|可以吗|能吗|会吗|应该|需要|想要|希望|要求|请求|建议|投诉|反馈|咨询|询问|了解|学习|使用|购买|升级|维修|安装|配置|调试|测试|部署|运行|维护|优化|改进|解决|处理|应对|预防|避免|减少|增加|提高|降低|改变|调整|更新|升级|降级|替换|删除|添加|创建|修改|删除|查询|搜索|浏览|查看|下载|上传|分享|保存|备份|恢复|重置|重启|关闭|打开|启动|停止|暂停|继续|执行|完成|结束|开始|进行|实施|执行|操作|处理|管理|控制|监控|观察|检查|审核|评估|分析|研究|调查|测试|验证|确认|保证|确保|维持|保持|保护|保障|维护|维修|修复|解决|处理|应对|预防|避免|减少|增加|提高|降低|改变|调整|更新|升级|降级|替换|删除|添加|创建|修改|删除|查询|搜索|浏览|查看|下载|上传|分享|保存|备份|恢复|重置|重启|关闭|打开|启动|停止|暂停|继续|执行|完成|结束|开始|进行|实施|执行|操作|处理|管理|控制|监控|观察|检查|审核|评估|分析|研究|调查|测试|验证|确认|保证|确保|维持|保持|保护|保障)/g
    ];

    let requests: string[] = [];
    requestPatterns.forEach(pattern => {
      const matches = input.match(pattern);
      if (matches) {
        requests = [...requests, ...matches];
      }
    });

    if (requests.length > 0) {
      return requests.join('、');
    }

    // 如果没有找到明显诉求，返回"了解"
    return '了解';
  }

  // 校验特征组
  validateFeature(feature: ThreeDimensionalFeature): boolean {
    // 确保三个维度均不缺失、不模糊
    return !!(feature.subject && feature.event && feature.request);
  }

  // 计算特征相似度
  calculateFeatureSimilarity(feature1: ThreeDimensionalFeature, feature2: ThreeDimensionalFeature): number {
    // 将特征转换为向量
    const vec1 = this.featureToVector(feature1);
    const vec2 = this.featureToVector(feature2);

    // 计算余弦相似度
    return cosineSimilarity(vec1, vec2);
  }

  // 将特征转换为向量
  private featureToVector(feature: ThreeDimensionalFeature): number[] {
    // 简单的向量转换，实际应用中可以使用NLP模型
    const text = `${feature.subject} ${feature.event} ${feature.request}`;
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

  // 匹配分支
  async matchBranch(userId: string, input: string): Promise<BranchMatchResult> {
    // 提取三维特征
    const feature = this.extractThreeDimensionalFeature(input);

    // 校验特征组
    if (!this.validateFeature(feature)) {
      return {
        branchId: null,
        similarity: 0,
        isNew: true,
        feature
      };
    }

    // 获取用户的所有分支
    const branches = await this.memorySystem.getUserBranches(userId);

    // 遍历现有分支进行匹配
    let maxSimilarity = 0;
    let matchedBranchId: string | null = null;

    for (const branch of branches) {
      // 假设分支存储了三维特征
      const branchFeature = branch.feature || {
        subject: branch.title || '',
        event: branch.description || '',
        request: branch.keywords?.join(' ') || ''
      };

      // 计算相似度
      const similarity = this.calculateFeatureSimilarity(feature, branchFeature);

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        matchedBranchId = branch.id;
      }
    }

    // 判定是否匹配
    if (maxSimilarity >= 0.8) {
      // 匹配到现有分支
      this.currentBranchId = matchedBranchId;
      return {
        branchId: matchedBranchId,
        similarity: maxSimilarity,
        isNew: false,
        feature
      };
    } else {
      // 无匹配分支，需要新建
      return {
        branchId: null,
        similarity: maxSimilarity,
        isNew: true,
        feature
      };
    }
  }

  // 新建分支
  async createBranch(userId: string, feature: ThreeDimensionalFeature): Promise<string> {
    // 确定一级分类
    const category = this.determineCategory(feature);

    // 生成分支标题
    const title = `${feature.subject} ${feature.event}`;

    // 生成分支描述
    const description = `核心诉求：${feature.request}`;

    // 生成分支关键词
    const keywords = [feature.subject, feature.event, feature.request];

    // 创建分支
    const branch = await this.memorySystem.createBranch(userId, {
      title,
      description,
      tags: [category],
      keywords,
      feature,
      isImportant: false
    });

    // 更新当前分支ID
    this.currentBranchId = branch.id;

    return branch.id;
  }

  // 确定一级分类
  private determineCategory(feature: ThreeDimensionalFeature): string {
    // 根据主体和核心事件确定分类
    const categoryMap: Record<string, string[]> = {
      '技术支持': ['系统', '功能', '问题', '配置', '调试', '测试', '部署', '运行', '维护', '优化', '改进', '解决', '处理'],
      '产品咨询': ['产品', '服务', '功能', '使用', '购买', '升级', '维修', '安装'],
      '业务咨询': ['业务', '流程', '政策', '规则', '要求', '标准'],
      '其他': []
    };

    for (const [category, keywords] of Object.entries(categoryMap)) {
      for (const keyword of keywords) {
        if (feature.event.includes(keyword) || feature.subject.includes(keyword)) {
          return category;
        }
      }
    }

    return '其他';
  }

  // 切换分支
  async switchBranch(branchId: string): Promise<void> {
    // 清空当前上下文
    this.currentBranchId = branchId;

    // 这里可以添加更多切换逻辑，如加载分支数据等
  }

  // 获取当前分支
  getCurrentBranch(): string | null {
    return this.currentBranchId;
  }

  // 锁定分支
  lockBranch(branchId: string): void {
    // 锁定分支，禁止其他分支访问
    this.currentBranchId = branchId;
  }

  // 解锁分支
  unlockBranch(): void {
    // 解锁分支
    this.currentBranchId = null;
  }
}

export default new BranchManager();
