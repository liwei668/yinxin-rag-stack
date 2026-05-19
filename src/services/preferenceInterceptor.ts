// 偏好拦截服务

import { GlobalPreference } from './preferenceExtractor';

class PreferenceInterceptor {
  // 检测是否违反沟通习惯偏好
  detectCommunicationViolations(response: string, preference: GlobalPreference): string[] {
    const violations: string[] = [];

    // 检测反问
    if (
      (preference.communicationHabit.communicationStyle === 'direct' || 
       preference.communicationHabit.communicationStyle === 'avoid反问') &&
      this.containsQuestion(response)
    ) {
      violations.push('反问用户');
    }

    // 检测响应风格
    if (preference.communicationHabit.responseStyle === 'concise' && this.isTooLong(response)) {
      violations.push('响应过长');
    }

    if (preference.communicationHabit.responseStyle === 'bullet' && !this.isBulletFormat(response)) {
      violations.push('未使用分点格式');
    }

    // 检测输出形式
    if (preference.communicationHabit.outputFormat === 'highlight' && !this.hasHighlights(response)) {
      violations.push('未突出重点');
    }

    return violations;
  }

  // 检测是否违反固定属性偏好
  detectFixedAttributeViolations(response: string, preference: GlobalPreference): string[] {
    const violations: string[] = [];

    // 检测禁忌表述
    if (preference.fixedAttribute.taboos) {
      for (const taboo of preference.fixedAttribute.taboos) {
        if (this.containsTaboo(response, taboo)) {
          violations.push(`使用了禁忌表述: ${taboo}`);
        }
      }
    }

    return violations;
  }

  // 检测是否包含问题
  containsQuestion(text: string): boolean {
    const questionMarks = text.match(/[?？]/g);
    return questionMarks && questionMarks.length > 0;
  }

  // 检测响应是否过长
  isTooLong(text: string): boolean {
    return text.length > 500; // 简单判断，可根据实际需求调整
  }

  // 检测是否使用分点格式
  isBulletFormat(text: string): boolean {
    return /^(\s*[-*•]|\s*\d+\.)/.test(text);
  }

  // 检测是否突出重点
  hasHighlights(text: string): boolean {
    return /(重点|注意|提示|重要)/i.test(text);
  }

  // 检测是否包含禁忌表述
  containsTaboo(text: string, taboo: string): boolean {
    const tabooKeywords: Record<string, string[]> = {
      '冗长表述': ['冗长', '啰嗦', '繁琐', '复杂'],
      '复杂表述': ['复杂', '难懂', '晦涩', '深奥'],
      '过多专业术语': ['专业术语', '行话', '术语', '专业名词']
    };

    const keywords = tabooKeywords[taboo] || [];
    return keywords.some(keyword => text.includes(keyword));
  }

  // 拦截并修正响应
  interceptAndCorrect(response: string, preference: GlobalPreference): string {
    let correctedResponse = response;

    // 修正反问
    if (
      (preference.communicationHabit.communicationStyle === 'direct' || 
       preference.communicationHabit.communicationStyle === 'avoid反问') &&
      this.containsQuestion(correctedResponse)
    ) {
      correctedResponse = this.removeQuestions(correctedResponse);
    }

    // 修正响应长度
    if (preference.communicationHabit.responseStyle === 'concise' && this.isTooLong(correctedResponse)) {
      correctedResponse = this.makeConcise(correctedResponse);
    }

    // 修正分点格式
    if (preference.communicationHabit.responseStyle === 'bullet' && !this.isBulletFormat(correctedResponse)) {
      correctedResponse = this.convertToBulletFormat(correctedResponse);
    }

    // 修正重点突出
    if (preference.communicationHabit.outputFormat === 'highlight' && !this.hasHighlights(correctedResponse)) {
      correctedResponse = this.addHighlights(correctedResponse);
    }

    return correctedResponse;
  }

  // 移除问题
  removeQuestions(text: string): string {
    return text.replace(/[^.。!！?？]*[?？]/g, '');
  }

  // 精简响应
  makeConcise(text: string): string {
    const sentences = text.split(/[.。!！]/).filter(s => s.trim());
    return sentences.slice(0, 3).join('。') + '。';
  }

  // 转换为分点格式
  convertToBulletFormat(text: string): string {
    const sentences = text.split(/[.。!！]/).filter(s => s.trim());
    return sentences.map((sentence, index) => `• ${sentence}`).join('\n');
  }

  // 添加重点标记
  addHighlights(text: string): string {
    return `【重点】${text}`;
  }

  // 检查并处理响应
  processResponse(response: string, preference: GlobalPreference): { 
    original: string; 
    corrected: string; 
    violations: string[]; 
    isCorrected: boolean 
  } {
    const communicationViolations = this.detectCommunicationViolations(response, preference);
    const fixedAttributeViolations = this.detectFixedAttributeViolations(response, preference);
    const allViolations = [...communicationViolations, ...fixedAttributeViolations];

    if (allViolations.length > 0) {
      const correctedResponse = this.interceptAndCorrect(response, preference);
      return {
        original: response,
        corrected: correctedResponse,
        violations: allViolations,
        isCorrected: true
      };
    }

    return {
      original: response,
      corrected: response,
      violations: [],
      isCorrected: false
    };
  }
}

export default new PreferenceInterceptor();
