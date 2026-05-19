interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  variables: string[];
  categories: string[];
  associatedKnowledgeDocs: string[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  isDefault?: boolean;
  // 场景标签：用于智能匹配
  scenario?: string[];
  // 统计字段（轻量，内存计数 + 定时落盘）
  callCount?: number;
  lastUsedAt?: string;
}

// ========== 场景关键词映射表 ==========
// 定义每个场景对应的关键词，用于智能匹配提词器
const SCENARIO_KEYWORDS: Record<string, string[]> = {
  '财务': [
    '税务', '纳税', '申报', '发票', '台账', '报表', '账', '会计', '审计',
    '增值税', '企业所得税', '个税', '社保', '公积金', '工资', '薪酬',
    '财务', '利润', '营收', '成本', '费用', '资产', '负债', '折旧',
    '营业执照', '注册', '注销', '变更', '年报', '汇算清缴',
    '税率', '减免', '优惠', '扣除', '对账', '流水', '凭证', '记账', '出纳',
  ],
  '编程': [
    '代码', '编程', '程序', '脚本', '函数', 'API', '接口', '开发',
    'Python', 'JavaScript', 'TypeScript', 'Java', 'Go', 'Rust', 'C++', 'C#',
    'React', 'Vue', 'Node', 'Next.js', '数据库', 'SQL', 'MongoDB',
    '算法', '数据结构', '调试', 'Bug', '错误', '异常', '部署', '服务器',
    '前端', '后端', '全栈', '移动端', '小程序', '网页', '网站',
  ],
  '写作': [
    '写作', '文章', '文案', '润色', '修改', '编辑', '创作', '撰写',
    '标题', '开头', '结尾', '段落', '结构', '大纲', '摘要',
    '邮件', '通知', '公告', '报告', '方案', '计划', '总结',
    '小说', '故事', '诗歌', '散文', '日记', '博客',
  ],
  '翻译': [
    '翻译', '译', '英文', '中文', '日语', '韩语', '法语', '德语', '西班牙语',
    'English', 'Japanese', 'Korean', 'French', 'German', 'Spanish',
    '中译英', '英译中', '互译', '双语',
  ],
  '分析': [
    '分析', '研究', '调研', '调查', '评估', '诊断', '洞察',
    '数据', '统计', '图表', '趋势', '对比', '比较', '差异',
    '报告', '总结', '归纳', '结论', '建议', '方案',
    '市场', '竞品', '用户', '行业', '企业', '公司',
  ],
  '客服': [
    '客服', '投诉', '咨询', '解答', '回复', '处理', '解决',
    '客户', '用户', '消费者', '顾客', '买家', '卖家',
    '退换', '退款', '售后', '维权', '纠纷',
  ],
  '教育': [
    '教学', '教育', '学习', '课程', '培训', '辅导', '讲解',
    '考试', '测试', '作业', '题目', '答案', '解析',
    '学生', '老师', '教师', '学校', '课堂', '知识点',
    '数学', '物理', '化学', '生物', '历史', '地理', '语文', '英语',
  ],
  '法律': [
    '法律', '法规', '条例', '条款', '合同', '协议', '契约',
    '诉讼', '仲裁', '判决', '裁定', '起诉', '应诉',
    '律师', '法院', '检察院', '公安', '司法',
    '权利', '义务', '责任', '赔偿', '违约', '侵权',
  ],
  '医疗': [
    '医疗', '健康', '疾病', '症状', '治疗', '药物', '医院',
    '医生', '护士', '患者', '病人', '诊断', '检查', '化验',
    '感冒', '发烧', '咳嗽', '头痛', '胃痛', '过敏',
    '中医', '西医', '养生', '保健', '营养',
  ],
};

class PromptManager {
  private templates: Map<string, PromptTemplate> = new Map();
  private storagePath: string = './data/prompts.json';
  private fs: any = null;
  private path: any = null;
  // 内存统计缓存（避免每次调用都写文件）
  private statsCache: Map<string, { callCount: number; lastUsedAt: string }> = new Map();
  // 定时落盘定时器
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  // 落盘间隔（毫秒）
  private static readonly FLUSH_INTERVAL = 30000; // 30秒

  constructor() {
    // 只在服务器端加载fs和path模块
    if (typeof window === 'undefined') {
      try {
        this.fs = require('fs');
        this.path = require('path');
        this.loadFromStorage();
        this.startFlushTimer();
        // 进程退出前兜底落盘
        process.on('exit', () => this.flushStats());
      } catch (error) {
        console.error('Error loading fs/path modules:', error);
        this.initializeDefaultTemplatesInMemory();
      }
    } else {
      // 客户端环境，使用内存存储
      this.initializeDefaultTemplatesInMemory();
    }
  }

  private loadFromStorage() {
    if (!this.fs || !this.path) {
      this.initializeDefaultTemplatesInMemory();
      return;
    }

    try {
      const dirPath = this.path.dirname(this.storagePath);

      if (!this.fs.existsSync(dirPath)) {
        this.fs.mkdirSync(dirPath, { recursive: true });
      }

      if (this.fs.existsSync(this.storagePath)) {
        const data = this.fs.readFileSync(this.storagePath, 'utf8');
        const templatesData = JSON.parse(data);
        templatesData.forEach((template: any) => {
          // 兼容旧模板：缺失统计字段和场景字段时自动补默认值
          const normalized: PromptTemplate = {
            callCount: 0,
            lastUsedAt: '',
            scenario: [],
            ...template,
          };
          this.templates.set(normalized.id, normalized);
          // 初始化内存统计缓存
          this.statsCache.set(normalized.id, {
            callCount: normalized.callCount || 0,
            lastUsedAt: normalized.lastUsedAt || '',
          });
        });
      } else {
        this.initializeDefaultTemplates();
      }
    } catch (error) {
      console.error('Error loading prompts from storage:', error);
      this.initializeDefaultTemplatesInMemory();
    }
  }

  private saveToStorage() {
    if (!this.fs) return;

    try {
      const templatesArray = Array.from(this.templates.values()).map(t => ({
        ...t,
        // 合并内存统计缓存到模板数据
        callCount: this.statsCache.get(t.id)?.callCount ?? t.callCount ?? 0,
        lastUsedAt: this.statsCache.get(t.id)?.lastUsedAt ?? t.lastUsedAt ?? '',
      }));
      this.fs.writeFileSync(this.storagePath, JSON.stringify(templatesArray, null, 2));
    } catch (error) {
      console.error('Error saving prompts to storage:', error);
    }
  }

  // ========== 定时落盘机制 ==========

  /** 启动定时落盘（仅服务端） */
  private startFlushTimer() {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      this.flushStats();
    }, PromptManager.FLUSH_INTERVAL);
  }

  /** 将内存统计缓存批量写入文件（只更新统计字段，不重写 content） */
  flushStats() {
    if (!this.fs || this.statsCache.size === 0) return;
    try {
      // 读取文件当前内容（保留管理后台可能修改的最新 content）
      if (!this.fs.existsSync(this.storagePath)) {
        this.saveToStorage();
        return;
      }
      const fileData = JSON.parse(this.fs.readFileSync(this.storagePath, 'utf8'));
      let changed = false;
      fileData.forEach((fileTemplate: any) => {
        const stats = this.statsCache.get(fileTemplate.id);
        if (stats) {
          if (fileTemplate.callCount !== stats.callCount || fileTemplate.lastUsedAt !== stats.lastUsedAt) {
            fileTemplate.callCount = stats.callCount;
            fileTemplate.lastUsedAt = stats.lastUsedAt;
            changed = true;
          }
        }
      });
      if (changed) {
        this.fs.writeFileSync(this.storagePath, JSON.stringify(fileData, null, 2));
      }
    } catch (error) {
      console.error('Error flushing stats:', error);
    }
  }

  /** 销毁定时器 */
  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushStats();
  }

  // ========== 场景匹配 ==========

  /**
   * 根据用户消息匹配最合适的提词器
   * @param message 用户消息
   * @returns 匹配到的提词器，无匹配返回 null
   */
  matchScenario(message: string): PromptTemplate | null {
    // 获取所有启用的提词器
    const activeTemplates = Array.from(this.templates.values())
      .filter(t => t.isActive && t.scenario && t.scenario.length > 0);

    if (activeTemplates.length === 0) {
      return null;
    }

    // 计算每个提词器的匹配分数
    let bestMatch: { template: PromptTemplate; score: number } | null = null;

    for (const template of activeTemplates) {
      if (!template.scenario) continue;

      let score = 0;
      for (const scenarioName of template.scenario) {
        const keywords = SCENARIO_KEYWORDS[scenarioName];
        if (!keywords) continue;

        for (const keyword of keywords) {
          if (message.includes(keyword)) {
            score += 1;
          }
        }
      }

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { template, score };
      }
    }

    return bestMatch?.template || null;
  }

  /**
   * 根据用户消息获取系统提示词（智能匹配 + 默认回退）
   * @param message 用户消息
   * @param templateId 指定的模板ID（优先级最高）
   * @returns 系统提示词内容
   */
  getSystemPromptByMessage(message: string, templateId?: string): string {
    // 优先级1：指定了模板ID
    if (templateId) {
      const result = this.renderTemplate(templateId);
      if (result.success && result.content) {
        return result.content;
      }
    }

    // 优先级2：场景智能匹配
    const matchedTemplate = this.matchScenario(message);
    if (matchedTemplate) {
      console.log(`[提词器] 场景匹配: ${matchedTemplate.name}`);
      // 更新统计
      const cached = this.statsCache.get(matchedTemplate.id) || { callCount: 0, lastUsedAt: '' };
      cached.callCount += 1;
      cached.lastUsedAt = new Date().toISOString();
      this.statsCache.set(matchedTemplate.id, cached);
      return matchedTemplate.content;
    }

    // 优先级3：默认模板
    const defaultResult = this.getDefaultTemplate();
    if (defaultResult.success && defaultResult.template) {
      return defaultResult.template.content;
    }

    // 优先级4：返回空（由调用方处理兜底）
    return '';
  }

  /**
   * 获取所有可用的场景标签
   */
  getAvailableScenarios(): string[] {
    return Object.keys(SCENARIO_KEYWORDS);
  }

  // ========== 渲染引擎 ==========

  /**
   * 渲染模板：根据模板ID读取内容，替换变量，返回完整提示词
   * 同时自动计数+1
   */
  renderTemplate(templateId: string, variables?: Record<string, string>): { success: boolean; content?: string; templateName?: string; error?: string } {
    let template = this.templates.get(templateId);

    // 模板不存在或已禁用，回退到默认模板
    if (!template || !template.isActive) {
      const defaultResult = this.getDefaultTemplate();
      if (defaultResult.success && defaultResult.template) {
        template = defaultResult.template;
      } else {
        return { success: false, error: '模板不可用且无默认模板' };
      }
    }

    let content = template.content;

    // 替换变量
    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        content = content.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }
    }

    // 内存计数 +1（仅真正渲染给大模型使用时才计数）
    const cached = this.statsCache.get(template.id) || { callCount: 0, lastUsedAt: '' };
    cached.callCount += 1;
    cached.lastUsedAt = new Date().toISOString();
    this.statsCache.set(template.id, cached);

    return { success: true, content, templateName: template.name };
  }

  // ========== 初始化默认模板 ==========

  private initializeDefaultTemplates() {
    const defaultTemplates: PromptTemplate[] = [
      {
        id: '1',
        name: '文档摘要生成',
        description: '根据文档内容生成简洁的摘要',
        content: '请为以下文档生成一个简洁、准确的摘要：\n\n{document_content}\n\n请确保摘要包含文档的核心要点，不超过300字。',
        variables: ['document_content'],
        categories: ['文档处理', '摘要生成'],
        associatedKnowledgeDocs: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        isDefault: true,
        scenario: ['分析'],
        callCount: 0,
        lastUsedAt: '',
      },
      {
        id: '2',
        name: '问题解答',
        description: '基于知识库内容回答用户问题',
        content: '请基于以下知识库内容回答用户的问题：\n\n知识库内容：\n{knowledge_base}\n\n用户问题：\n{user_question}\n\n请提供准确、详细的回答。',
        variables: ['knowledge_base', 'user_question'],
        categories: ['问答', '知识库应用'],
        associatedKnowledgeDocs: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        isDefault: false,
        scenario: [],
        callCount: 0,
        lastUsedAt: '',
      }
    ];

    defaultTemplates.forEach(template => {
      this.templates.set(template.id, template);
      this.statsCache.set(template.id, { callCount: 0, lastUsedAt: '' });
    });
    this.saveToStorage();
  }

  private initializeDefaultTemplatesInMemory() {
    const defaultTemplates: PromptTemplate[] = [
      {
        id: '1',
        name: '文档摘要生成',
        description: '根据文档内容生成简洁的摘要',
        content: '请为以下文档生成一个简洁、准确的摘要：\n\n{document_content}\n\n请确保摘要包含文档的核心要点，不超过300字。',
        variables: ['document_content'],
        categories: ['文档处理', '摘要生成'],
        associatedKnowledgeDocs: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        isDefault: true,
        scenario: ['分析'],
        callCount: 0,
        lastUsedAt: '',
      },
      {
        id: '2',
        name: '问题解答',
        description: '基于知识库内容回答用户问题',
        content: '请基于以下知识库内容回答用户的问题：\n\n知识库内容：\n{knowledge_base}\n\n用户问题：\n{user_question}\n\n请提供准确、详细的回答。',
        variables: ['knowledge_base', 'user_question'],
        categories: ['问答', '知识库应用'],
        associatedKnowledgeDocs: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        isDefault: false,
        scenario: [],
        callCount: 0,
        lastUsedAt: '',
      }
    ];

    defaultTemplates.forEach(template => {
      this.templates.set(template.id, template);
      this.statsCache.set(template.id, { callCount: 0, lastUsedAt: '' });
    });
  }

  // ========== CRUD 方法 ==========

  getTemplates(includeInactive = false): { success: boolean; templates: PromptTemplate[] } {
    const templates = Array.from(this.templates.values())
      .filter(t => includeInactive || t.isActive)
      .map(t => ({
        ...t,
        callCount: this.statsCache.get(t.id)?.callCount ?? t.callCount ?? 0,
        lastUsedAt: this.statsCache.get(t.id)?.lastUsedAt ?? t.lastUsedAt ?? '',
      }));
    return { success: true, templates };
  }

  getTemplate(id: string): { success: boolean; template?: PromptTemplate; error?: string } {
    const template = this.templates.get(id);
    if (template) {
      return {
        success: true,
        template: {
          ...template,
          callCount: this.statsCache.get(id)?.callCount ?? template.callCount ?? 0,
          lastUsedAt: this.statsCache.get(id)?.lastUsedAt ?? template.lastUsedAt ?? '',
        },
      };
    }
    return { success: false, error: 'Template not found' };
  }

  getDefaultTemplate(): { success: boolean; template?: PromptTemplate; error?: string } {
    const defaultTemplate = Array.from(this.templates.values()).find(t => t.isActive && t.isDefault);
    if (defaultTemplate) {
      return {
        success: true,
        template: {
          ...defaultTemplate,
          callCount: this.statsCache.get(defaultTemplate.id)?.callCount ?? defaultTemplate.callCount ?? 0,
          lastUsedAt: this.statsCache.get(defaultTemplate.id)?.lastUsedAt ?? defaultTemplate.lastUsedAt ?? '',
        },
      };
    }
    return { success: false, error: 'No default template found' };
  }

  setDefaultTemplate(id: string): { success: boolean; error?: string } {
    const template = this.templates.get(id);
    if (!template) {
      return { success: false, error: 'Template not found' };
    }

    // 先将所有模板的isDefault设为false
    this.templates.forEach((t, key) => {
      if (t.isDefault) {
        this.templates.set(key, {
          ...t,
          isDefault: false,
          updatedAt: new Date().toISOString()
        });
      }
    });

    // 将指定模板设为默认
    this.templates.set(id, {
      ...template,
      isDefault: true,
      updatedAt: new Date().toISOString()
    });

    this.saveToStorage();
    return { success: true };
  }

  createTemplate(templateData: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>): { success: boolean; template?: PromptTemplate; error?: string } {
    const id = Date.now().toString();
    const template: PromptTemplate = {
      ...templateData,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      callCount: 0,
      lastUsedAt: '',
      scenario: templateData.scenario || [],
    };
    this.templates.set(id, template);
    this.statsCache.set(id, { callCount: 0, lastUsedAt: '' });
    this.saveToStorage();
    return { success: true, template };
  }

  updateTemplate(id: string, templateData: Partial<PromptTemplate>): { success: boolean; template?: PromptTemplate; error?: string } {
    const existingTemplate = this.templates.get(id);
    if (!existingTemplate) {
      return { success: false, error: 'Template not found' };
    }

    const updatedTemplate: PromptTemplate = {
      ...existingTemplate,
      ...templateData,
      id,
      updatedAt: new Date().toISOString(),
      callCount: this.statsCache.get(id)?.callCount ?? existingTemplate.callCount ?? 0,
      lastUsedAt: this.statsCache.get(id)?.lastUsedAt ?? existingTemplate.lastUsedAt ?? '',
    };
    this.templates.set(id, updatedTemplate);
    this.saveToStorage();
    return { success: true, template: updatedTemplate };
  }

  deleteTemplate(id: string): { success: boolean; error?: string } {
    if (this.templates.has(id)) {
      this.templates.delete(id);
      this.statsCache.delete(id);
      this.saveToStorage();
      return { success: true };
    }
    return { success: false, error: 'Template not found' };
  }

  testTemplate(id: string, variables: Record<string, string>): { success: boolean; result?: string; error?: string } {
    const template = this.templates.get(id);
    if (!template) {
      return { success: false, error: 'Template not found' };
    }

    let result = template.content;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }

    return { success: true, result };
  }
}

export const promptManager = new PromptManager();
