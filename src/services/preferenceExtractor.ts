// 偏好提取服务

// 偏好类型定义
export interface CommunicationHabit {
  responseStyle: 'concise' | 'detailed' | 'bullet';
  communicationStyle: 'direct' | 'detailed' | 'avoid反问';
  outputFormat: 'plain' | 'highlight';
}

export interface FixedAttribute {
  coreScenarios: string[];
  longTermNeeds: string[];
  constraints: string[];
  taboos: string[];
}

export interface BehaviorPattern {
  questionFrequency: 'high' | 'medium' | 'low';
  focusPoints: string[];
  commonPhrases: string[];
  feedbackStyle: 'corrective' | 'supplementary' | 'none';
}

export interface GlobalPreference {
  communicationHabit: CommunicationHabit;
  fixedAttribute: FixedAttribute;
  behaviorPattern: BehaviorPattern;
  learningHistory: Array<{
    timestamp: Date;
    signalType: string;
    signalValue: any;
    confidence: number;
  }>;
}

// 偏好提取器类
class PreferenceExtractor {
  // 从用户输入中提取沟通习惯
  extractCommunicationHabit(input: string): Partial<CommunicationHabit> {
    const result: Partial<CommunicationHabit> = {};

    // 响应风格
    if (input.includes('精简') || input.includes('简洁') || input.includes('简短')) {
      result.responseStyle = 'concise';
    } else if (input.includes('详细') || input.includes('具体') || input.includes('全面')) {
      result.responseStyle = 'detailed';
    } else if (input.includes('分点') || input.includes('列表') || input.includes('逐条')) {
      result.responseStyle = 'bullet';
    }

    // 沟通方式
    if (input.includes('直接') || input.includes('不要反问') || input.includes('拒绝反问')) {
      result.communicationStyle = 'direct';
    } else if (input.includes('详细说明') || input.includes('详细解释')) {
      result.communicationStyle = 'detailed';
    } else if (input.includes('避免反问') || input.includes('不要问我')) {
      result.communicationStyle = 'avoid反问';
    }

    // 输出形式
    if (input.includes('重点突出') || input.includes('突出重点') || input.includes('强调重点')) {
      result.outputFormat = 'highlight';
    } else if (input.includes('直接') || input.includes('简单') || input.includes('明了')) {
      result.outputFormat = 'plain';
    }

    return result;
  }

  // 从用户输入中提取固定属性
  extractFixedAttribute(input: string): Partial<FixedAttribute> {
    const result: Partial<FixedAttribute> = {};

    // 核心使用场景
    const scenarios = [];
    if (input.includes('工作') || input.includes('办公')) scenarios.push('工作');
    if (input.includes('学习') || input.includes('教育')) scenarios.push('学习');
    if (input.includes('生活') || input.includes('日常')) scenarios.push('生活');
    if (input.includes('娱乐') || input.includes('休闲')) scenarios.push('娱乐');
    if (scenarios.length > 0) result.coreScenarios = scenarios;

    // 长期需求类型
    const needs = [];
    if (input.includes('咨询') || input.includes('建议')) needs.push('咨询');
    if (input.includes('分析') || input.includes('研究')) needs.push('分析');
    if (input.includes('创意') || input.includes('创新')) needs.push('创意');
    if (input.includes('解决') || input.includes('处理')) needs.push('问题解决');
    if (needs.length > 0) result.longTermNeeds = needs;

    // 固定约束条件
    const constraints = [];
    if (input.includes('部署') || input.includes('环境')) constraints.push('部署要求');
    if (input.includes('格式') || input.includes('规范')) constraints.push('格式要求');
    if (input.includes('时间') || input.includes('期限')) constraints.push('时间约束');
    if (constraints.length > 0) result.constraints = constraints;

    // 禁忌/反感的表述方式
    const taboos = [];
    if (input.includes('不要') && (input.includes('冗长') || input.includes('啰嗦'))) taboos.push('冗长表述');
    if (input.includes('不要') && (input.includes('复杂') || input.includes('难懂'))) taboos.push('复杂表述');
    if (input.includes('不要') && (input.includes('专业术语') || input.includes('行话'))) taboos.push('过多专业术语');
    if (taboos.length > 0) result.taboos = taboos;

    return result;
  }

  // 从用户输入中提取行为特征
  extractBehaviorPattern(input: string, interactionCount: number): Partial<BehaviorPattern> {
    const result: Partial<BehaviorPattern> = {};

    // 提问频率
    if (interactionCount > 10) {
      result.questionFrequency = 'high';
    } else if (interactionCount > 3) {
      result.questionFrequency = 'medium';
    } else {
      result.questionFrequency = 'low';
    }

    // 关注重点
    const focusPoints = [];
    if (input.includes('价格') || input.includes('成本')) focusPoints.push('价格');
    if (input.includes('质量') || input.includes('品质')) focusPoints.push('质量');
    if (input.includes('效率') || input.includes('速度')) focusPoints.push('效率');
    if (input.includes('安全') || input.includes('可靠')) focusPoints.push('安全');
    if (focusPoints.length > 0) result.focusPoints = focusPoints;

    // 常见提问句式
    const phrases = [];
    if (input.startsWith('如何') || input.includes('如何')) phrases.push('如何...');
    if (input.startsWith('什么') || input.includes('什么')) phrases.push('什么...');
    if (input.startsWith('为什么') || input.includes('为什么')) phrases.push('为什么...');
    if (input.startsWith('怎样') || input.includes('怎样')) phrases.push('怎样...');
    if (phrases.length > 0) result.commonPhrases = phrases;

    // 反馈习惯
    if (input.includes('不对') || input.includes('不是') || input.includes('错误')) {
      result.feedbackStyle = 'corrective';
    } else if (input.includes('补充') || input.includes('另外') || input.includes('还有')) {
      result.feedbackStyle = 'supplementary';
    }

    return result;
  }

  // 综合提取偏好
  extractPreference(input: string, interactionCount: number): Partial<GlobalPreference> {
    return {
      communicationHabit: this.extractCommunicationHabit(input),
      fixedAttribute: this.extractFixedAttribute(input),
      behaviorPattern: this.extractBehaviorPattern(input, interactionCount)
    };
  }

  // 检测是否有主动修正偏好的语句
  detectActiveCorrection(input: string): boolean {
    const correctionKeywords = [
      '我喜欢', '我偏好', '我希望', '我想要',
      '请', '不要', '避免', '拒绝',
      '更喜欢', '最好', '应该', '建议'
    ];

    return correctionKeywords.some(keyword => input.includes(keyword));
  }

  // 生成偏好提示
  generatePreferencePrompt(preference: GlobalPreference): string {
    let prompt = '';

    // 沟通习惯
    if (preference.communicationHabit.responseStyle) {
      switch (preference.communicationHabit.responseStyle) {
        case 'concise':
          prompt += '请保持响应精简，直接给出核心信息。';
          break;
        case 'detailed':
          prompt += '请提供详细的响应，包含完整的信息。';
          break;
        case 'bullet':
          prompt += '请使用分点形式组织响应，清晰明了。';
          break;
      }
    }

    if (preference.communicationHabit.communicationStyle === 'direct') {
      prompt += ' 请直接给出结论，不要反问用户。';
    } else if (preference.communicationHabit.communicationStyle === 'avoid反问') {
      prompt += ' 请避免反问用户，直接回答问题。';
    }

    if (preference.communicationHabit.outputFormat === 'highlight') {
      prompt += ' 请突出重点内容。';
    }

    // 固定属性
    if (preference.fixedAttribute.taboos && preference.fixedAttribute.taboos.length > 0) {
      prompt += ` 请避免${preference.fixedAttribute.taboos.join('、')}。`;
    }

    return prompt;
  }
}

export default new PreferenceExtractor();
