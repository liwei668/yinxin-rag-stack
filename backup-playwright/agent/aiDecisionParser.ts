// AI 决策解析 - 解析 AI 返回的 JSON 决策，映射动作到工具，校验步骤
// 从 agentEngine.ts 拆分
import { v4 as uuidv4 } from 'uuid';
import { AgentTask, AgentStep } from './types';

/**
 * 获取当前页面上下文（截图+文本+元素）供 AI 分析
 */
export async function getPageContext(task: AgentTask, bm: any): Promise<{ url: string; title: string; content: string; elements: string; screenshot?: string } | null> {
  try {
    const info = await bm.getBrowserInfo();
    if (!info.hasPage) return null;

    const content = await bm.getPageContent();
    const snapshot = await bm.getPageSnapshot();
    // 获取页面截图（用于 AI 视觉理解）
    let screenshot: string | undefined;
    try {
      screenshot = await bm.screenshot();
    } catch {}

    const elements = [
      `按钮: ${snapshot.buttons.map(b => `"${b.text}"`).join(', ') || '无'}`,
      `输入框: ${snapshot.inputs.map(i => `[${i.type}] id=${i.id} placeholder="${i.placeholder}"`).join(', ') || '无'}`,
      `链接: ${snapshot.links.slice(0, 15).map(l => `"${l.text}" → ${l.href.substring(0, 60)}`).join(', ') || '无'}`,
    ].join('\n');

    return {
      url: info.url || '',
      title: info.title || '',
      content,
      elements,
      screenshot,
    };
  } catch (error: any) {
    console.error('[Agent] 获取页面上下文失败:', error.message);
    return null;
  }
}

/**
 * 动作名映射：AI 输出的动作名 → 现有 toolName
 */
function mapActionToTool(action: string): { toolName: string; params: Record<string, any> } | null {
  switch (action) {
    case 'goto':
      return { toolName: 'browser_navigate', params: {} };
    case 'click':
      return { toolName: 'browser_click', params: {} };
    case 'input':
      return { toolName: 'browser_type', params: {} };
    case 'press':
      return { toolName: 'browser_press', params: {} };
    case 'scroll':
      return { toolName: 'browser_scroll', params: {} };
    case 'wait':
      return { toolName: 'browser_wait', params: {} };
    case 'closePopup':
      return { toolName: 'browser_click', params: {} };
    case 'select':
      return { toolName: 'browser_select', params: {} };
    case 'readPage':
      return { toolName: 'browser_read', params: {} };
    case 'switchTab':
      return { toolName: 'browser_tab', params: {} };
    default:
      return null;
  }
}

/**
 * 前置校验 AI 决策的步骤参数是否合法
 */
export function validateStep(decision: any, snapshot: any): { valid: boolean; error?: string } {
  const action = decision.action;
  const params = decision.params || {};

  switch (action) {
    case 'goto':
      if (!params.url || !params.url.startsWith('http')) return { valid: false, error: `URL 格式不合法: ${params.url}` };
      break;
    case 'click':
    case 'closePopup':
      if (!params.selector) return { valid: false, error: '缺少 selector 参数' };
      // 检查元素是否在快照的可交互元素列表中
      if (snapshot && snapshot.elements && snapshot.elements.length > 0) {
        const found = snapshot.elements.some((e: any) =>
          (e.text && e.text.includes(params.selector)) ||
          (e.selector && e.selector.includes(params.selector))
        );
        if (!found) {
          return {
            valid: false,
            error: `元素 "${params.selector}" 在当前页面中未找到。当前页面可交互元素: ${snapshot.elements.slice(0, 10).map((e: any) => e.text || e.selector).join(', ')}`,
          };
        }
      }
      break;
    case 'input':
      if (!params.selector) return { valid: false, error: '缺少 selector 参数' };
      if (!params.text && params.text !== '0') return { valid: false, error: '缺少 text 参数' };
      break;
    case 'press':
      if (!params.key) return { valid: false, error: '缺少 key 参数' };
      break;
    case 'scroll':
      if (!params.direction) return { valid: false, error: '缺少 direction 参数' };
      break;
    case 'wait':
      if (params.seconds && (params.seconds < 1 || params.seconds > 30)) return { valid: false, error: '等待时间必须在 1-30 秒之间' };
      break;
    case 'select':
      if (!params.selector) return { valid: false, error: '缺少 selector 参数' };
      if (!params.value) return { valid: false, error: '缺少 value 参数' };
      break;
    case 'switchTab':
      if (params.index === undefined || params.index === null) return { valid: false, error: '缺少 index 参数' };
      break;
  }
  return { valid: true };
}

/**
 * 构造 AI 输入（快照 + 用户需求 + 上一步执行结果）
 */
export function buildAIInput(task: AgentTask, snapshot: any, lastResult?: any): any {
  const snapshotText = `## 当前页面状态
- URL: ${snapshot.url || ''}
- 标题: ${snapshot.title || ''}
- 页面类型: ${snapshot.pageType || 'unknown'}
- 登录状态: ${snapshot.loginStatus || 'unknown'}
- 弹窗: ${snapshot.popups?.length > 0 ? snapshot.popups.map((p: any) => `[${p.type}] ${p.text}`).join('; ') : '无'}
- 表单字段: ${snapshot.formFields?.length > 0 ? snapshot.formFields.map((f: any) => `[${f.type}]${f.label || f.placeholder || f.name || f.id}`).join(', ') : '无'}
- 数据区域: ${snapshot.dataAreas?.length > 0 ? snapshot.dataAreas.join('; ') : '无'}`;

  const lastResultText = lastResult ? `\n## 上一步执行结果\n- 成功: ${lastResult.success}\n- 消息: ${lastResult.message || ''}\n- 错误: ${lastResult.error || '无'}` : '';

  return {
    role: 'user',
    content: `${snapshotText}${lastResultText}\n\n用户目标: ${task.title}\n\n请基于当前页面状态，决定下一步操作。只返回 JSON。`,
  };
}

/**
 * 解析 AI 的决策 JSON（宽容模式，兼容新格式）
 */
export function parseAIDecision(text: string): { action: string; toolName?: string; params?: any; reason?: string; question?: string; summary?: string; mode?: string; reasoning?: string; tip?: string; steps?: any[] } | null {
  try {
    // 去除 markdown 代码块标记
    let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    // 尝试提取 JSON 对象
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // 新格式兼容：支持 mode 字段
    // 如果有 mode 字段，按新格式处理
    if (parsed.mode) {
      // mode: manual → 转人工
      if (parsed.mode === 'manual') {
        return {
          action: 'ask_human',
          question: parsed.tip || parsed.reasoning || '需要人工介入',
          reason: parsed.reasoning || '',
          mode: parsed.mode,
          tip: parsed.tip || '',
        };
      }

      // mode: auto + action: complete → 任务完成
      if (parsed.action === 'complete') {
        return {
          action: 'complete',
          summary: parsed.summary || '',
          reasoning: parsed.reasoning || '',
          mode: parsed.mode,
        };
      }

      // mode: auto + steps 数组 → 取第一步执行（小步闭环）
      if (parsed.steps && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
        const firstStep = parsed.steps[0];
        const mapped = mapActionToTool(firstStep.action);
        if (mapped) {
          return {
            action: 'execute',
            toolName: mapped.toolName,
            params: { ...mapped.params, ...firstStep.params },
            reason: firstStep.reasoning || parsed.reasoning || '',
            mode: parsed.mode,
            reasoning: parsed.reasoning || '',
          };
        }
        // 如果映射失败，尝试直接使用
        return {
          action: 'execute',
          toolName: firstStep.toolName || firstStep.action,
          params: firstStep.params || {},
          reason: firstStep.reasoning || parsed.reasoning || '',
          mode: parsed.mode,
          reasoning: parsed.reasoning || '',
        };
      }

      // mode: auto + action（单步） → 映射到 toolName
      if (parsed.action && parsed.action !== 'complete') {
        const mapped = mapActionToTool(parsed.action);
        if (mapped) {
          return {
            action: 'execute',
            toolName: mapped.toolName,
            params: { ...mapped.params, ...parsed.params },
            reason: parsed.reasoning || '',
            mode: parsed.mode,
            reasoning: parsed.reasoning || '',
          };
        }
        // 如果映射失败，尝试直接使用
        if (parsed.toolName) {
          return {
            action: 'execute',
            toolName: parsed.toolName,
            params: parsed.params || {},
            reason: parsed.reasoning || '',
            mode: parsed.mode,
            reasoning: parsed.reasoning || '',
          };
        }
      }

      // 有 mode 但无法识别 action，回退
      if (parsed.action) {
        // 保留原始 action，让后续逻辑处理
        return parsed;
      }
      return null;
    }

    // 旧格式兼容：没有 mode 字段
    // 验证必须有 action 字段
    if (!parsed.action) {
      // 如果没有 action 但有 toolName，推断为 execute
      if (parsed.toolName) parsed.action = 'execute';
      else return null;
    }

    // 标准化 action
    const validActions = ['execute', 'ask_human', 'complete', 'retry'];
    if (!validActions.includes(parsed.action)) {
      // 如果 action 是工具名（如 browser_click），转换为 execute
      if (parsed.action.startsWith('browser_') || parsed.action === 'web_search' || parsed.action === 'wait_human') {
        parsed.toolName = parsed.action;
        parsed.action = 'execute';
      } else if (parsed.toolName) {
        parsed.action = 'execute';
      } else if (parsed.question) {
        parsed.action = 'ask_human';
      } else if (parsed.summary) {
        parsed.action = 'complete';
      } else {
        return null;
      }
    }

    // 确保 params 存在
    if (!parsed.params) parsed.params = {};

    return parsed;
  } catch {
    return null;
  }
}

/**
 * 创建动态步骤（AI 自主推理产生的步骤）
 */
export function createDynamicStep(
  task: AgentTask,
  toolName: string,
  params: Record<string, any>,
  reason: string,
  index: number,
): AgentStep {
  const step: AgentStep = {
    id: uuidv4(),
    index,
    title: reason || toolName,
    description: reason || '',
    status: 'pending',
    riskLevel: 'safe',
    toolName,
    toolParams: params || {},
  };
  task.plan.push(step);
  return step;
}

/**
 * 从 toolName 反推原始 action 名（用于 validateStep）
 */
export function getActionFromToolName(toolName: string): string | null {
  const reverseMap: Record<string, string> = {
    'browser_navigate': 'goto',
    'browser_click': 'click',
    'browser_type': 'input',
    'browser_press': 'press',
    'browser_scroll': 'scroll',
    'browser_wait': 'wait',
    'browser_select': 'select',
    'browser_read': 'readPage',
    'browser_tab': 'switchTab',
  };
  return reverseMap[toolName] || null;
}
