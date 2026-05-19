import { modelRouterStore, RouterRule } from '../../../lib/modelRouterStore';

export interface RouterInput {
  text?: string;
  fileTypes?: string[];
  intent?: string;
  customerId?: string;
}

export interface RouterResult {
  modelId: string;
  comboId?: string;
  matchedRule?: RouterRule;
  confidence: number;
}

export class ModelRouterEngine {
  constructor() {}

  async selectModel(input: RouterInput): Promise<RouterResult> {
    const rules = modelRouterStore.getActive();

    for (const rule of rules) {
      const matchResult = this.matchRule(rule, input);
      if (matchResult.matched) {
        return {
          modelId: rule.modelId,
          comboId: rule.comboId,
          matchedRule: rule,
          confidence: matchResult.confidence,
        };
      }
    }

    const defaultRule = rules.find(r => r.type === 'default');
    if (defaultRule) {
      return {
        modelId: defaultRule.modelId,
        comboId: defaultRule.comboId,
        matchedRule: defaultRule,
        confidence: 0.5,
      };
    }

    return {
      modelId: 'deepseek-v4-flash',
      confidence: 0.1,
    };
  }

  private matchRule(rule: RouterRule, input: RouterInput): { matched: boolean; confidence: number } {
    switch (rule.type) {
      case 'keyword':
        return this.matchKeywordRule(rule, input);
      case 'fileType':
        return this.matchFileTypeRule(rule, input);
      case 'intent':
        return this.matchIntentRule(rule, input);
      case 'default':
        return { matched: true, confidence: 0.5 };
      default:
        return { matched: false, confidence: 0 };
    }
  }

  private matchKeywordRule(rule: RouterRule, input: RouterInput): { matched: boolean; confidence: number } {
    if (!input.text || !rule.keywords?.length) {
      return { matched: false, confidence: 0 };
    }

    const text = input.text.toLowerCase();
    let matchCount = 0;

    for (const keyword of rule.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      return {
        matched: true,
        confidence: Math.min(matchCount / rule.keywords.length, 1),
      };
    }

    return { matched: false, confidence: 0 };
  }

  private matchFileTypeRule(rule: RouterRule, input: RouterInput): { matched: boolean; confidence: number } {
    if (!input.fileTypes?.length || !rule.fileTypes?.length) {
      return { matched: false, confidence: 0 };
    }

    for (const fileType of input.fileTypes) {
      if (rule.fileTypes.includes(fileType.toLowerCase())) {
        return { matched: true, confidence: 1 };
      }
    }

    return { matched: false, confidence: 0 };
  }

  private matchIntentRule(rule: RouterRule, input: RouterInput): { matched: boolean; confidence: number } {
    if (!input.intent || rule.intent !== input.intent) {
      return { matched: false, confidence: 0 };
    }

    return { matched: true, confidence: 0.9 };
  }
}

export const modelRouter = new ModelRouterEngine();