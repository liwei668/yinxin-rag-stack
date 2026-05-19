import { modelRouter } from '../model-router/routerEngine';
import { promptCombiner } from '../skill-prompts/promptCombiner';

export interface PromptResult {
  modelId: string;
  systemPrompt: string;
  comboId?: string;
  confidence: number;
}

export class PromptService {
  async generate(input: string): Promise<PromptResult> {
    try {
      // 1. 获取路由匹配结果
      const routeResult = await modelRouter.selectModel({ input });
      
      // 2. 获取技能组合内容
      let systemPrompt = '';
      if (routeResult.comboId) {
        const combos = promptCombiner.getCombinations();
        const combo = combos.find(c => c.id === routeResult.comboId);
        if (combo) {
          systemPrompt = await promptCombiner.combinePrompts(combo);
        }
      }
      
      return {
        modelId: routeResult.modelId,
        systemPrompt,
        comboId: routeResult.comboId,
        confidence: routeResult.confidence || 0.1,
      };
    } catch (error) {
      console.error('PromptService error:', error);
      return {
        modelId: 'deepseek-v4-flash',
        systemPrompt: '',
        confidence: 0.05,
      };
    }
  }
}

export const promptService = new PromptService();
