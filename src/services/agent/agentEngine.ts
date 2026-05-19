// Agent 引擎 v2 - 多轮推理架构
// 核心：理解需求 → 分析步骤 → 逐步执行 → 截图验证 → 人工介入 → 继续 → 反馈结果
import { v4 as uuidv4 } from 'uuid';
import {
  AgentTask, AgentStep, AgentLog, TaskStatus, StepStatus,
  ToolResult,
} from './types';
import { toolRegistry } from './toolRegistry';
import { agentEvolution } from './agentEvolution';
import { browserManagerFactory } from './browserManagerFactory';
import { permissionController } from './permissionController';
import { validateFinancialData } from './dataValidator';
import fs from 'fs';
import path from 'path';
// 从拆分模块导入
import { callAI, trimAIHistory, MAX_AI_CALLS_PER_TASK } from './aiClient';
import { saveTasksToFile, loadTasksFromFile } from './taskStore';
import {
  parseAIDecision, validateStep, buildAIInput,
  createDynamicStep, getPageContext, getActionFromToolName,
} from './aiDecisionParser';

const DATA_DIR = path.join(process.cwd(), 'data');
const AGENT_LOGS_DIR = path.join(DATA_DIR, 'agent-logs');

if (!fs.existsSync(AGENT_LOGS_DIR)) {
  fs.mkdirSync(AGENT_LOGS_DIR, { recursive: true });
}

// ========== 内存存储 ==========
const tasks = new Map<string, AgentTask>();
type TaskCallback = (task: AgentTask) => void;
const callbacks = new Map<string, TaskCallback[]>();

export function onTaskUpdate(taskId: string, callback: TaskCallback) {
  if (!callbacks.has(taskId)) callbacks.set(taskId, []);
  callbacks.get(taskId)!.push(callback);
}

export function offTaskUpdate(taskId: string, callback: TaskCallback) {
  const cbs = callbacks.get(taskId);
  if (cbs) {
    const idx = cbs.indexOf(callback);
    if (idx >= 0) cbs.splice(idx, 1);
  }
}

function notifyUpdate(task: AgentTask) {
  const cbs = callbacks.get(task.id) || [];
  cbs.forEach(cb => { try { cb(task); } catch {} });
  // 持久化任务状态
  saveTasksToFile(tasks);
}

// ========== 任务队列（支持并发） ==========
const MAX_CONCURRENT_TASKS = parseInt(process.env.MAX_CONCURRENT_TASKS || '3');
const activeTasks: Set<string> = new Set();
const taskQueue: string[] = [];

export function getQueueStatus(): { activeTaskId: string | null; queueLength: number } {
  return { activeTaskId: activeTasks.size > 0 ? Array.from(activeTasks)[0] : null, queueLength: taskQueue.length };
}

function enqueueTask(taskId: string): boolean {
  if (activeTasks.has(taskId)) return true; // already running
  if (!taskQueue.includes(taskId)) {
    taskQueue.push(taskId);
  }
  return false;
}

function dequeueNext(): string | null {
  while (taskQueue.length > 0) {
    const next = taskQueue.shift()!;
    if (!activeTasks.has(next)) {
      return next;
    }
  }
  return null;
}

// 启动时加载历史任务
loadTasksFromFile(tasks);

// ========== 任务管理 ==========

export function createTask(userId: string, title: string, description: string): AgentTask {
  const task: AgentTask = {
    id: uuidv4(),
    userId, title, description,
    status: 'planning',
    plan: [],
    currentStepIndex: -1,
    createdAt: new Date().toISOString(),
    screenshots: [],
    logs: [],
    metadata: {},
  };
  tasks.set(task.id, task);
  return task;
}

export function getTask(taskId: string): AgentTask | undefined {
  return tasks.get(taskId);
}

export function getUserTasks(userId: string): AgentTask[] {
  return Array.from(tasks.values())
    .filter(t => t.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ========== 任务规划（第一步：理解需求+分析步骤） ==========

export async function planTask(taskId: string): Promise<AgentTask> {
  const task = tasks.get(taskId);
  if (!task) throw new Error('任务不存在');

  task.status = 'planning';
  addLog(task, 'info', '🧠 AI 正在理解需求并分析操作步骤...');
  notifyUpdate(task);

  const evolutionTips = agentEvolution.getEvolutionPrompt();

  const planPrompt = `# 任务规划（格式锁死机制）

你是浏览器操作指挥官的规划模块。你的唯一职责是：将用户需求拆解为可执行的操作步骤序列。

## 用户任务
- 标题：${task.title}
- 描述：${task.description}

## 输出格式（严格锁死，不得偏离）
只返回一个 JSON 数组，每个元素必须且只能包含以下字段：
[
  {
    "action": "动作名",
    "params": { 参数对象 },
    "reasoning": "本步骤的决策依据"
  }
]

## 动作白名单（仅允许以下动作）
| 动作 | 用途 | params |
|------|------|--------|
| goto | 导航到 URL | {"url": "https://..."} |
| click | 点击元素 | {"selector": "元素可见文本"} |
| input | 输入文字 | {"selector": "元素标识", "text": "内容"} |
| press | 按键 | {"key": "Enter"} |
| scroll | 滚动 | {"direction": "down", "amount": 500} |
| wait | 等待 | {"ms": 1000} |
| closePopup | 关闭弹窗 | {"selector": "关闭按钮文本"} |
| select | 下拉选择 | {"selector": "下拉框", "value": "选项"} |
| readPage | 读取页面内容 | {} |
| switchTab | 切换标签页 | {"index": 0} |

## 规划规则
1. 每个步骤只能包含一个动作（禁止一步多动作）
2. URL 必须以 https:// 开头
3. 选择器优先使用元素可见文本，不使用 CSS 选择器
4. 如果某步需要用户提供信息（密码、验证码、手机号），使用 wait 动作并在 params 中说明
5. 表单提交优先用 press Enter，有明确提交按钮才用 click
6. 规划步骤数不超过 10 步，超出部分由执行阶段的 AI 自主推理

## 示例：百度搜索
[
  {"action":"goto","params":{"url":"https://www.baidu.com"},"reasoning":"打开百度首页"},
  {"action":"input","params":{"selector":"wd","text":"人工智能"},"reasoning":"在搜索框输入关键词"},
  {"action":"press","params":{"key":"Enter"},"reasoning":"按 Enter 提交搜索"},
  {"action":"readPage","params":{},"reasoning":"读取搜索结果页面内容"}
]

## 示例：需要人工配合
[
  {"action":"goto","params":{"url":"https://example.com/register"},"reasoning":"打开注册页面"},
  {"action":"wait","params":{"ms":1000,"reason":"需要用户提供手机号","instruction":"请提供您的手机号码"},"reasoning":"等待用户提供注册信息"},
  {"action":"input","params":{"selector":"手机号","text":"{{user_reply}}"},"reasoning":"填入用户提供的手机号"}
]

只返回 JSON 数组，不要返回任何其他文字。${evolutionTips}`;

  try {
    const content = await callAI([{ role: 'user', content: planPrompt }]);
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const steps = JSON.parse(jsonMatch[0]);
      // 新格式映射：action → toolName，reasoning → description
      const actionToToolName: Record<string, string> = {
        'goto': 'browser_navigate',
        'click': 'browser_click',
        'input': 'browser_type',
        'press': 'browser_press',
        'scroll': 'browser_scroll',
        'wait': 'browser_wait',
        'closePopup': 'browser_click',
        'select': 'browser_select',
        'readPage': 'browser_read',
        'switchTab': 'browser_tab',
      };
      task.plan = steps.map((s: any, i: number) => ({
        id: uuidv4(),
        index: i,
        title: s.action ? `${s.action}: ${s.reasoning || ''}` : `步骤 ${i + 1}`,
        description: s.reasoning || '',
        status: 'pending' as StepStatus,
        riskLevel: s.action === 'wait' && s.params?.reason ? 'manual' : 'safe',
        toolName: actionToToolName[s.action] || s.toolName || '',
        toolParams: s.params || {},
      }));
    } else {
      task.plan = generateDefaultPlan(task);
    }
  } catch (error: any) {
    console.error('[Agent] AI 规划失败:', error.message);
    task.plan = generateDefaultPlan(task);
  }

  task.status = 'pending_approval';
  addLog(task, 'success', `📋 已分析出 ${task.plan.length} 个步骤，自动开始执行`);
  notifyUpdate(task);

  // 异步启动执行（不 await，避免阻塞 API 响应）
  startTask(task.id).catch((e: any) => {
    console.error('[Agent] 自动启动失败:', e.message);
  });

  return task;
}

function generateDefaultPlan(task: AgentTask): AgentStep[] {
  const desc = (task.title + ' ' + task.description).toLowerCase();
  let url = 'https://www.example.com';
  let title = '打开网页';

  const sites: Record<string, string> = {
    '百度': 'https://www.baidu.com', 'baidu': 'https://www.baidu.com',
    '淘宝': 'https://www.taobao.com', 'taobao': 'https://www.taobao.com',
    '抖音': 'https://www.douyin.com', 'douyin': 'https://www.douyin.com',
    '微信': 'https://wx.qq.com', '京东': 'https://www.jd.com',
    '知乎': 'https://www.zhihu.com', '微博': 'https://weibo.com',
    'bilibili': 'https://www.bilibili.com', 'b站': 'https://www.bilibili.com',
  };

  for (const [key, val] of Object.entries(sites)) {
    if (desc.includes(key)) { url = val; title = `打开${key}`; break; }
  }

  return [{
    id: uuidv4(), index: 0, title, description: `访问 ${url}`,
    status: 'pending', riskLevel: 'safe', toolName: 'browser_navigate', toolParams: { url },
  }];
}

// ========== 任务执行（核心：多轮推理） ==========

export async function startTask(taskId: string): Promise<AgentTask> {
  const task = tasks.get(taskId);
  if (!task) throw new Error('任务不存在');
  if (task.status !== 'pending_approval') throw new Error('任务状态不允许执行');

  // 检查是否有正在执行的任务（并发控制）
  if (activeTasks.size >= MAX_CONCURRENT_TASKS && !activeTasks.has(taskId)) {
    // 加入队列等待
    if (!taskQueue.includes(taskId)) {
      taskQueue.push(taskId);
    }
    task.status = 'queued';
    addLog(task, 'info', `⏳ 任务排队中（当前 ${activeTasks.size}/${MAX_CONCURRENT_TASKS} 个活跃任务）`);
    notifyUpdate(task);
    return task;
  }

  task.status = 'running';
  task.startedAt = new Date().toISOString();
  activeTasks.add(taskId);
  addLog(task, 'info', '🚀 任务开始执行（多轮推理模式）');
  notifyUpdate(task);

  // 异步执行
  executeWithReasoning(taskId).catch(err => {
    console.error('[Agent] 执行异常:', err);
  }).finally(() => {
    // 执行完毕，从活跃任务中移除
    activeTasks.delete(taskId);
    // 检查队列中是否有等待的任务
    const nextTaskId = dequeueNext();
    if (nextTaskId) {
      const nextTask = tasks.get(nextTaskId);
      if (nextTask && nextTask.status === 'queued') {
        startTask(nextTaskId).catch(err => console.error('[Agent] 队列任务启动失败:', err));
      }
    }
  });

  return task;
}

/**
 * 智能判断是否需要调用 AI 分析当前步骤结果
 * 目标：减少不必要的 AI 调用，降低成本
 */
function shouldCallAI(
  step: AgentStep | undefined,
  result: { success: boolean; error?: string },
  isPreplanned: boolean,
  isLastPreplannedStep: boolean,
  consecutiveSkipCount: number,
): boolean {
  // 1. 步骤失败 -> 必须调 AI 分析原因
  if (!result.success) return true;

  // 2. 预规划步骤执行完毕（切换到自主推理）-> 必须调 AI
  if (isLastPreplannedStep) return true;

  // 3. browser_read 步骤 -> 需要AI分析读取的内容
  if (step?.toolName === 'browser_read') return true;

  // 4. wait_human 恢复后的第一步 -> 需要AI了解当前状态
  if (step?.toolName === 'wait_human') return true;

  // 5. 连续跳过 AI 超过 5 步 -> 强制调 AI 检查状态（放宽限制）
  if (consecutiveSkipCount >= 5) return true;

  // 6. 以下简单操作成功后可跳过 AI 分析：
  // 扩展可跳过的工具列表，包括 browser_navigate 和 browser_click
  const skippableTools = [
    'browser_type', 'browser_press',
    'browser_scroll', 'browser_wait', 'browser_hover',
    'browser_reload', 'browser_tab', 'browser_screenshot',
    'browser_navigate', // 导航成功后不需要立即分析
    'browser_click',    // 简单点击成功后不需要立即分析
  ];
  
  // 预规划步骤中，简单操作成功后可以跳过AI分析
  if (step && skippableTools.includes(step.toolName) && isPreplanned) {
    return false;
  }

  // 7. 其他情况默认调 AI
  return true;
}

/**
 * 多轮推理执行核心
 * 每执行一步 → 截图验证 → AI 分析结果 → 决定下一步
 */
async function executeWithReasoning(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) return;

  // 获取当前用户的 BrowserManager 实例
  const bm = await browserManagerFactory.getManager(task.userId);

  // 提前预热浏览器（启动 + 创建页面），避免第一步执行时因浏览器启动慢而超时
  try {
    console.log('[Agent] 预热浏览器...');
    await bm.getPage();
    console.log('[Agent] 浏览器预热完成');
  } catch (e: any) {
    console.error('[Agent] 浏览器预热失败:', e.message);
  }

  // AI 对话历史（用于多轮推理）
  const aiHistory: { role: string; content: string }[] = [];
  let aiCallCount = 0;
  let consecutiveParseFailures = 0;

  // 注入人工指令（如果用户在恢复时提供了指导）
  const humanInstruction = (task as any)._humanInstruction;
  if (humanInstruction) {
    delete (task as any)._humanInstruction;
    aiHistory.push({ role: 'user', content: `人工指令：${humanInstruction}\n\n请根据以上人工指令，结合当前页面状态，决定下一步操作。` });
  }

  // 初始系统提示
  const evolutionTips = agentEvolution.getEvolutionPrompt();
  aiHistory.push({
    role: 'system',
    content: `# 角色
你是浏览器操作指挥官。你只做决策，不直接操作浏览器。你的职责是：根据页面快照和用户需求，生成精确的操作指令。

# 输入
每次你会收到：
1. 当前页面快照（URL、标题、可交互元素列表、页面文本摘要、截图）
2. 用户需求（任务目标）
3. 历史操作记录（已执行步骤及结果）

你必须基于真实页面内容生成指令，禁止凭空脑补页面中不存在的元素。

# 输出格式（强制 JSON）
每次只返回一个 JSON 对象，不要返回任何其他文字。

## 模式字段（必填）
- "mode": "auto" — 自动执行，AI 继续控制
- "mode": "manual" — 需要人工介入

## 操作指令（mode:auto 时）
{
  "mode": "auto",
  "action": "动作名",
  "params": { 参数对象 },
  "reasoning": "决策依据说明"
}

## 人工介入（mode:manual 时）
{
  "mode": "manual",
  "tip": "需要人工处理的原因和具体指引",
  "reasoning": "为什么需要人工介入"
}

## 任务完成
{
  "mode": "auto",
  "action": "complete",
  "summary": "readPage 读到的原始内容摘要，禁止编造",
  "reasoning": "判断任务完成的依据"
}

# 动作白名单
仅允许以下动作，超出白名单的动作将被拒绝：
- goto: 导航到指定 URL，params: { "url": "https://..." }
- click: 点击元素，params: { "selector": "元素可见文本" }
- input: 输入文字，params: { "selector": "元素标识", "text": "要输入的内容" }
- press: 按键，params: { "key": "Enter/Tab/Escape 等" }
- scroll: 滚动页面，params: { "direction": "up/down", "amount": 像素数 }
- wait: 等待指定毫秒，params: { "ms": 1000 }
- closePopup: 关闭弹窗，params: { "selector": "关闭按钮文本" }
- select: 选择下拉选项，params: { "selector": "下拉框标识", "value": "选项文本" }
- readPage: 读取页面文本内容，params: {}
- switchTab: 切换标签页，params: { "index": 标签页序号 }

# 选择器策略
- 优先使用元素可见文本作为 selector（如 "登录"、"搜索"、"提交"）
- 不要使用 CSS 选择器（#id, .class），除非没有可见文本
- 输入框优先使用 placeholder、name、aria-label
- 示例：selector: "百度一下" 而非 selector: "#su"

# 禁止规则
1. 禁止凭空脑补：所有 selector 必须来自页面快照中的真实元素，不得猜测不存在的按钮/链接/输入框
2. 禁止一次超过3步：每条指令只执行一个动作，不要在一条指令中串联多个操作
3. 禁止口语化：reasoning 字段使用简洁的技术描述，不要使用"我觉得""可能""大概"等模糊表达
4. 禁止编造数据：complete 的 summary 必须是 readPage 动作读到的原始内容，如实反馈，不得美化或编造

# 异常处理
遇到以下情况必须立即返回 mode:manual + tip：
- 验证码（图片验证码、滑块验证、字母数字验证）
- 二维码要求扫码登录
- 需要输入密码（除非用户已提供）
- 人脸识别/实名认证
- 安全校验弹窗（"请完成安全验证"等）
- 需要手机号/短信验证码

示例：
{"mode":"manual","tip":"页面出现图片验证码，请查看截图并输入验证码中的字符","reasoning":"检测到 captcha 元素，需要人工识别"}

# 表单提交策略
- 输入完成后优先尝试 press Enter 提交
- 如果页面确实有提交按钮（"登录"/"搜索"/"提交"），使用 click
- 如果 click 找不到按钮，改用 press Enter

# 失败处理策略
- 同一操作连续失败不要超过3次
- 找不到按钮 → 改用 Enter；找不到元素 → 用 readPage 查看实际内容
- 所有方案失败 → mode:manual + tip 说明情况

# 数据准确性（最重要）
- complete 的 summary 必须来自 readPage 读取的原始内容
- 禁止编造搜索结果、禁止美化数据、禁止添加原文没有的信息
- 如果尚未执行 readPage 就返回 complete，视为严重错误

${evolutionTips}`,
  });

  // 从上次中断的位置继续（如果是恢复执行）
  let stepIndex = 0;
  if (task.currentStepIndex >= 0) {
    stepIndex = task.currentStepIndex + 1;
    addLog(task, 'info', `📂 从步骤 ${stepIndex} 继续执行`);
  }
  const maxSteps = 30; // 防止无限循环

  // 上一步执行结果（用于反馈给 AI）
  let lastResult: { success: boolean; message?: string; error?: string } | undefined;
  // 用于 validateStep 的快照数据
  let lastSnapshotData: any = null;
  // 标记是否所有预规划步骤已执行完毕
  let executedPreplannedSteps = false;

  try {
    // 执行预规划步骤（每个步骤执行后立即让 AI 决策下一步）
    let snapshot: any = null;
    
    while (stepIndex < maxSteps && task.status === 'running') {
      // 检查任务状态
      if (task.status === 'paused' || task.status === 'cancelled') {
        addLog(task, 'warn', '⏸ 任务已暂停/取消');
        break;
      }

      // === 查找下一个未完成的预规划步骤 ===
      let currentStep: AgentStep | undefined;
      let isPreplannedStep = false;
      
      for (let i = 0; i < task.plan.length; i++) {
        const step = task.plan[i];
        if (step.status !== 'completed') {
          currentStep = step;
          stepIndex = i;
          isPreplannedStep = true;
          addLog(task, 'info', `📋 执行预规划步骤 ${i + 1}/${task.plan.length}`);
          break;
        }
      }

      // === 所有预规划步骤已完成（或一开始就没有），进入 AI 实时决策 ===
      if (!currentStep) {
        if (!executedPreplannedSteps) {
          executedPreplannedSteps = true;
          addLog(task, 'info', '✅ 所有预规划步骤已完成，进入实时决策模式');
        }

        // 1. 采集页面快照
        snapshot = null;
        try {
          snapshot = await bm.getPageSnapshotStructured(1);
          try {
            const layer2 = await bm.getPageSnapshotStructured(2);
            lastSnapshotData = {
              ...snapshot,
              elements: layer2.elements || [],
            };
          } catch {
            lastSnapshotData = snapshot;
          }
        } catch (e: any) {
          addLog(task, 'warn', `快照采集失败: ${e.message}，尝试使用 getPageContext`);
          const pageContext = await getPageContext(task, bm);
          if (!pageContext) {
            addLog(task, 'error', '无法获取页面信息');
            break;
          }
          snapshot = {
            url: pageContext.url,
            title: pageContext.title,
            summary: `URL: ${pageContext.url}\n标题: ${pageContext.title}\n元素: ${pageContext.elements}`,
          };
          lastSnapshotData = snapshot;
        }

        // 2. 构造 AI 输入
        const aiInput = buildAIInput(task, lastSnapshotData, lastResult);
        aiHistory.push(aiInput);

        // 3. 裁剪对话历史
        const trimmedHistory = trimAIHistory(aiHistory);

        // 4. AI 调用次数检查
        if (++aiCallCount > MAX_AI_CALLS_PER_TASK) {
          addLog(task, 'warn', `⚠ AI 调用次数已达上限 (${MAX_AI_CALLS_PER_TASK})`);
          task.status = 'completed';
          task.completedAt = new Date().toISOString();
          task.result = { success: false, summary: `AI 调用次数已达上限 (${MAX_AI_CALLS_PER_TASK})`, screenshots: task.screenshots };
          notifyUpdate(task);
          return;
        }

        // 5. 调用 AI
        const aiResponse = await callAI(trimmedHistory, 500);
        aiHistory.push({ role: 'assistant', content: aiResponse });
        console.log(`[Agent] AI 回复 (前200字):`, aiResponse.substring(0, 200));

        // 6. 解析 AI 决策
        const decision = parseAIDecision(aiResponse);
        if (!decision) {
          consecutiveParseFailures++;
          if (consecutiveParseFailures >= 3) {
            addLog(task, 'warn', `⚠ AI 连续 ${consecutiveParseFailures} 次返回格式异常，暂停等待人工配合`);
            const humanStep: AgentStep = {
              index: task.plan.length,
              toolName: 'wait_human',
              title: 'AI 无法继续分析页面，需要人工配合',
              description: `AI 连续多次无法理解当前页面内容（可能被内容审核拦截），需要人工介入指导下一步操作。请查看工作区截图了解当前页面状态。`,
              toolParams: {
                reason: 'AI 分析连续失败',
                instruction: '请查看工作区截图，描述当前页面状态并告诉 Agent 下一步该怎么做。例如："点击XX链接"、"在搜索框输入XX"等。'
              },
              status: 'waiting_human' as const,
              riskLevel: 'high' as const,
            };
            task.plan.push(humanStep);
            task.status = 'waiting_human';
            task.currentStepIndex = task.plan.length - 1;
            notifyUpdate(task);
            return;
          }
          addLog(task, 'warn', `AI 返回格式异常 (${consecutiveParseFailures}/3)，尝试继续...`);
          lastResult = { success: false, error: 'AI 返回格式异常，无法解析' };
          stepIndex++;
          continue;
        }
        consecutiveParseFailures = 0;

        // 7. 根据 action 分支处理
        // 7a. 转人工
        if (decision.action === 'ask_human') {
          const step = createDynamicStep(task, 'wait_human', {
            reason: decision.reason || decision.question,
            instruction: decision.question,
          }, `等待用户: ${decision.question}`, stepIndex);
          step.status = 'waiting_human';
          task.status = 'waiting_human';
          task.plan.push(step);
          task.currentStepIndex = task.plan.length - 1;
          addLog(task, 'warn', `❓ 需要用户操作: ${decision.question}`);
          notifyUpdate(task);
          return;
        }

        // 7b. 任务完成
        if (decision.action === 'complete') {
          const currentUrl = lastSnapshotData?.url || '';
          const currentPageTitle = lastSnapshotData?.title || '';
          
          // P0: 金融数据准确性校验
          if (decision.summary) {
            const validation = validateFinancialData(decision.summary, { url: currentUrl, pageTitle: currentPageTitle });
            if (validation.warnings.length > 0) {
              addLog(task, 'warn', `⚠ 数据校验警告: ${validation.warnings.join('; ')}`);
            }
            if (!validation.valid) {
              addLog(task, 'error', `❌ 数据校验失败: ${validation.errors.join('; ')}`);
              aiHistory.push({ role: 'user', content: `数据校验失败: ${validation.errors.join('; ')}。请重新读取页面数据并核实。` });
              continue;
            }
          }

          task.status = 'completed';
          task.completedAt = new Date().toISOString();
          task.result = {
            success: true,
            summary: decision.summary || '任务已完成',
            screenshots: task.screenshots,
          };
          addLog(task, 'success', `✅ ${decision.summary || '任务已完成'}`);
          agentEvolution.recordTask(task).catch(() => {});
          notifyUpdate(task);
          return;
        }

        // 7c. 执行操作
        if (decision.action === 'execute' || decision.action === 'retry') {
          // 映射 AI 返回的短名到完整工具名
          let toolName = decision.toolName;
          const shortToFull: Record<string, string> = {
            goto: 'browser_navigate', click: 'browser_click', input: 'browser_type',
            press: 'browser_press', scroll: 'browser_scroll', wait: 'browser_wait',
            closePopup: 'browser_click', select: 'browser_select', readPage: 'browser_read',
            switchTab: 'browser_tab',
          };
          if (toolName && shortToFull[toolName]) {
            toolName = shortToFull[toolName];
          }
          const params = decision.params || {};

          if (!toolName) {
            addLog(task, 'warn', 'AI 返回了 execute 但缺少 toolName，要求重新生成');
            aiHistory.push({ role: 'user', content: `错误：缺少 toolName。请返回包含 toolName 的 JSON。` });
            lastResult = { success: false, error: 'AI 返回缺少 toolName' };
            continue;
          }

          // 前置校验
          const actionForValidation = getActionFromToolName(toolName) || 'execute';
          const validationDecision = { action: actionForValidation, params };
          const validation = validateStep(validationDecision, lastSnapshotData);
          if (!validation.valid) {
            addLog(task, 'warn', `步骤校验失败: ${validation.error}`);
            aiHistory.push({
              role: 'user',
              content: `步骤校验失败: ${validation.error}。当前页面: ${JSON.stringify(lastSnapshotData)}。请重新生成正确的操作指令。`,
            });
            lastResult = { success: false, error: validation.error };
            continue;
          }

          // 校验通过，创建步骤并执行
          const step = createDynamicStep(task, toolName, params, decision.reason || decision.reasoning || toolName, stepIndex);
          const { executed, result } = await executePlannedStep(task, step, stepIndex, aiHistory);
          if (!executed) break;

          lastResult = {
            success: result.success,
            message: result.message,
            error: result.error,
          };

          stepIndex++;
          continue;
        }

        // 未知 action，跳过
        addLog(task, 'warn', `未知的 AI 决策 action: ${decision.action}`);
        lastResult = { success: false, error: `未知的 action: ${decision.action}` };
        stepIndex++;
        continue;
      }

      // === 执行预规划步骤 ===
      // 先确保有当前页面的快照数据
      if (!lastSnapshotData) {
        try {
          const snap = await bm.getPageSnapshotStructured(1);
          const layer2 = await bm.getPageSnapshotStructured(2);
          lastSnapshotData = {
            ...snap,
            elements: layer2.elements || [],
          };
        } catch {
          // 忽略快照错误
        }
      }
      
      const { executed, result } = await executePlannedStep(task, currentStep, stepIndex, aiHistory);
      if (!executed) break;
      
      lastResult = {
        success: result.success,
        message: result.message,
        error: result.error,
      };
      
      stepIndex++;
    }

    // 超过最大步数
    if (stepIndex >= maxSteps && task.status === 'running') {
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      task.result = {
        success: false,
        summary: `已执行 ${maxSteps} 步，达到上限`,
        screenshots: task.screenshots,
      };
      addLog(task, 'warn', '⚠ 达到最大步骤数限制');
      agentEvolution.recordTask(task).catch(() => {});
      notifyUpdate(task);
    }
  } catch (error: any) {
    console.error('[Agent] 执行异常:', error);
    task.status = 'failed';
    task.completedAt = new Date().toISOString();
    task.result = { success: false, summary: `执行异常: ${error.message}` };
    addLog(task, 'error', `❌ 执行异常: ${error.message}`);
    agentEvolution.recordTask(task).catch(() => {});
    notifyUpdate(task);
  }
}

/**
 * 执行一个预规划的步骤，包含截图验证
 */
async function executePlannedStep(
  task: AgentTask,
  step: AgentStep,
  index: number,
  aiHistory: { role: string; content: string }[],
): Promise<{ executed: boolean; result: ToolResult }> {
  // 检查任务状态
  if (task.status === 'paused' || task.status === 'cancelled') return { executed: false, result: { success: false, error: '任务已暂停或取消' } };

  task.currentStepIndex = index;
  step.status = 'running';
  step.startedAt = new Date().toISOString();
  addLog(task, 'info', `⚡ 步骤 ${index + 1}: ${step.title}`);
  notifyUpdate(task);

  // 跳过无效的 wait 工具（AI 有时会错误生成）
  if (step.toolName === 'wait' || step.toolName === 'browser_wait') {
    step.status = 'completed';
    step.completedAt = new Date().toISOString();
    addLog(task, 'info', `⏭ 跳过无效等待步骤: ${step.title}`);
    notifyUpdate(task);
    return { executed: true, result: { success: true, message: '跳过无效等待步骤' } };
  }

  // 检查是否是 wait_human
  if (step.toolName === 'wait_human') {
    step.status = 'waiting_human';
    task.status = 'waiting_human';
    const reason = step.toolParams?.reason || step.toolParams?.instruction || '需要人工操作';
    addLog(task, 'warn', `❓ 等待用户操作: ${reason}`);
    notifyUpdate(task);
    return { executed: false, result: { success: false, error: '等待人工操作' } }; // 暂停
  }

  // 检查权限 - 是否需要人工确认
  const toolDef = toolRegistry.getDefinition(step.toolName);
  if (toolDef) {
    const needsApproval = permissionController.needsApproval(step.riskLevel, toolDef);
    if (needsApproval) {
      addLog(task, 'warn', `⚠ 操作需要人工确认: ${step.title}`);
      // 创建人工等待步骤
      const humanStep: AgentStep = {
        index: task.plan.length,
        toolName: 'wait_human',
        title: '需要人工确认操作',
        description: `操作 "${step.title}" 需要人工确认，请查看工作区截图并确认是否允许执行。`,
        toolParams: { 
          reason: '操作需要人工确认',
          instruction: '请查看工作区面板中的截图，确认是否允许执行此操作。如果允许，请告知Agent继续执行；如果不允许，请取消任务。' 
        },
        status: 'waiting_human' as const,
        riskLevel: 'high' as const,
      };
      task.plan.push(humanStep);
      task.status = 'waiting_human';
      task.currentStepIndex = task.plan.length - 1;
      notifyUpdate(task);
      return { executed: false, result: { success: false, error: '操作需要人工确认' } };
    }
  }

  // 执行工具（带自动重试）
  const startTime = Date.now();
  let result: ToolResult;
  const MAX_RETRIES = 3; // 最多重试 3 次
  const STEP_TIMEOUT = 60000; // 单步超时 60s（首次启动浏览器较慢）
  let retryCount = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        // 重试策略：调整参数
        retryCount = attempt;
        const retryParams = { ...step.toolParams };
        addLog(task, 'warn', `[重试 第${attempt}次] ${step.title} - 策略: ${attempt === 1 ? '等待后重试' : attempt === 2 ? '更换选择器（模糊匹配）' : '更换选择器（精确文本截断）'}`);
        notifyUpdate(task);

        if (attempt === 1) {
          // 第一次重试：等待后重试
          await new Promise(r => setTimeout(r, 2000));
        } else if (attempt === 2) {
          // 第二次重试：尝试模糊匹配
          await new Promise(r => setTimeout(r, 1000));
          if (retryParams.selector && typeof retryParams.selector === 'string') {
            // 截取前半部分作为模糊匹配
            const words = retryParams.selector.split('');
            if (words.length > 2) {
              retryParams.selector = words.slice(0, Math.ceil(words.length * 0.7)).join('');
            }
          }
        } else if (attempt === 3) {
          // 第三次重试：尝试精确文本截断（取前半段）
          await new Promise(r => setTimeout(r, 1500));
          if (retryParams.selector && typeof retryParams.selector === 'string') {
            const words = retryParams.selector.split(/\s+/);
            if (words.length > 1) {
              retryParams.selector = words.slice(0, Math.ceil(words.length / 2)).join(' ');
            }
          }
        }

        const timeoutPromise = new Promise<ToolResult>((_, reject) =>
          setTimeout(() => reject(new Error('步骤执行超时(60s)')), STEP_TIMEOUT)
        );
        result = await Promise.race([toolRegistry.execute(step.toolName, retryParams, task.userId), timeoutPromise]);
      } else {
        const timeoutPromise = new Promise<ToolResult>((_, reject) =>
          setTimeout(() => reject(new Error('步骤执行超时(60s)')), STEP_TIMEOUT)
        );
        result = await Promise.race([toolRegistry.execute(step.toolName, step.toolParams, task.userId), timeoutPromise]);
      }

      if (result.success) break; // 成功则退出重试循环
    } catch (error: any) {
      result = { success: false, error: error.message };
    }
  }

  // 连续 3 次重试都失败，暂停任务并记录错误
  if (!result.success && retryCount >= MAX_RETRIES) {
    addLog(task, 'error', `[重试失败] 步骤 "${step.title}" 连续 ${MAX_RETRIES} 次重试均失败，暂停任务。错误: ${result.error}`);
    task.status = 'paused';
    (task as any).error = result.error;
    (task as any).retryCount = retryCount;
    notifyUpdate(task);
    return { executed: false, result };
  }

  const duration = Date.now() - startTime;
  step.duration = duration;

  if (result.success) {
    step.status = 'completed';
    step.result = result.data;
    if (result.screenshot) {
      step.screenshot = result.screenshot;
      task.screenshots.push(result.screenshot);
    }
    addLog(task, 'success', `✅ ${result.message || step.title} (${duration}ms)`);
  } else {
    step.status = 'failed';
    step.error = result.error;
    addLog(task, 'error', `❌ ${step.title} - ${result.error} (${duration}ms)`);
  }

  step.completedAt = new Date().toISOString();

  // 记录步骤执行结果到进化系统
  agentEvolution.recordStep(task.id, step, result).catch(() => {});

  notifyUpdate(task);

  // 记录到 AI 对话历史（让 AI 知道执行结果）
  const selector = step.toolParams?.selector || step.toolParams?.url || step.title || '';
  const historyEntry = `步骤 "${step.title}" 执行${result.success ? '成功' : '失败'}:
- 工具: ${step.toolName}
- 参数: ${JSON.stringify(step.toolParams)}
- 结果: ${result.message || (result.success ? '成功' : result.error)}
${result.success ? '请分析页面状态，决定下一步。' : `操作失败！建议：
1. 如果是点击按钮失败，尝试改用 browser_press Enter 提交
2. 如果是找不到元素，先用 browser_read 查看页面实际内容
3. 如果已经多次失败同样的操作，返回 ask_human 让人工处理`}`;

  aiHistory.push({ role: 'user', content: historyEntry });

  // 卡住检测：同一操作连续失败，自动升级为人工处理
  if (!result.success) {
    // 检测页面是否出现需要人工配合的内容（验证码、二维码等）
    try {
      const pageContent = await bm.getPageContent?.();
      if (pageContent) {
        const humanKeywords = ['验证码', '二维码', '安全验证', '滑块', '请输入验证', '短信验证', '人脸识别', '实名认证', '请扫码', 'captcha', 'verify'];
        const needsHuman = humanKeywords.some(kw => pageContent.includes(kw));
        if (needsHuman) {
          addLog(task, 'warn', `🆘 检测到页面需要人工配合（验证码/二维码等）`);
          // 创建人工等待步骤
          const humanStep: AgentStep = {
            index: task.plan.length,
            toolName: 'wait_human',
            title: '需要人工配合完成验证',
            description: `页面出现了需要人工操作的内容（可能是验证码、二维码或安全验证），请查看工作区截图并完成相应操作。`,
            toolParams: { 
              reason: '页面需要人工验证',
              instruction: '请查看工作区面板中的截图，完成页面上的验证操作（如输入验证码、扫码登录等），然后告知Agent继续。' 
            },
            status: 'waiting_human' as const,
            riskLevel: 'high' as const,
          };
          task.plan.push(humanStep);
          task.status = 'waiting_human';
          task.currentStepIndex = task.plan.length - 1;
          notifyUpdate(task);
          return { executed: false, result: { success: false, error: '页面需要人工验证' } };
        }
      }
    } catch (e) {
      // 页面内容检测失败，不影响主流程
    }

    // 检测是否是URL访问被拒绝
    if (result.error && result.error.includes('URL 访问被拒绝')) {
      addLog(task, 'warn', `🆘 URL访问被拒绝，需要人工确认`);
      // 创建人工等待步骤
      const humanStep: AgentStep = {
        index: task.plan.length,
        toolName: 'wait_human',
        title: 'URL访问被拒绝',
        description: `尝试访问的网站不在白名单中，需要人工确认是否允许访问。`,
        toolParams: { 
          reason: 'URL访问被拒绝',
          instruction: `请确认是否允许访问此网站。如果允许，请在回复中输入"允许访问"，系统将自动将该域名添加到白名单；如果不允许，请输入"取消"。` 
        },
        status: 'waiting_human' as const,
        riskLevel: 'high' as const,
      };
      task.plan.push(humanStep);
      task.status = 'waiting_human';
      task.currentStepIndex = task.plan.length - 1;
      notifyUpdate(task);
      return { executed: false, result: { success: false, error: 'URL访问被拒绝，需要人工确认' } };
    }
  }

  // 卡住检测：同一操作连续重复（无论成功失败），自动升级为人工处理
  // （覆盖"点击成功但页面没变化"的死循环场景）
  {
    const MAX_SAME_ACTION = 2;
    const actionKey = `${step.toolName}:${selector}`;
    if (!task._failureCounts) (task as any)._failureCounts = {};
    const counts = (task as any)._failureCounts;
    counts[actionKey] = (counts[actionKey] || 0) + 1;
    if (counts[actionKey] >= MAX_SAME_ACTION) {
      addLog(task, 'warn', `🆘 检测到操作循环: "${selector}" 已重复 ${counts[actionKey]} 次，自动升级为人工处理`);
      const humanStep: AgentStep = {
        index: task.plan.length,
        toolName: 'wait_human',
        title: `需要人工协助: ${step.title}`,
        description: `操作 "${selector}" 已连续重复 ${MAX_SAME_ACTION} 次（页面可能没有正确响应），需要人工介入。`,
        toolParams: { reason: result.error || '操作重复无效果', instruction: `请查看工作区截图，检查当前页面状态。可能需要手动点击正确的链接、关闭弹窗或执行其他操作。完成后点击"继续执行"。` },
        status: 'waiting_human' as const,
        riskLevel: 'high' as const,
      };
      task.plan.push(humanStep);
      task.status = 'waiting_human';
      task.currentStepIndex = task.plan.length - 1;
      notifyUpdate(task);
      return { executed: false, result: { success: false, error: result.error || '操作重复无效果' } };
    }
  }

  return { executed: true, result };
}

// ========== 人工回复（用户提供信息后继续执行） ==========

export function replyToTask(taskId: string, userReply: string): AgentTask {
  const task = tasks.get(taskId);
  if (!task) throw new Error('任务不存在');
  if (task.status !== 'waiting_human') throw new Error('任务不在等待人工状态');

  // 找到当前等待的步骤
  const currentStep = task.plan[task.currentStepIndex];
  if (currentStep) {
    currentStep.status = 'completed';
    currentStep.completedAt = new Date().toISOString();
    currentStep.result = { userReply };
    addLog(task, 'info', `💬 用户回复: ${userReply}`);
  }

  task.status = 'running';
  addLog(task, 'info', '▶ 继续执行...');
  // 重新加入活跃任务集合（防止绕过并发控制）
  activeTasks.add(taskId);
  notifyUpdate(task);

  // 继续执行
  executeWithReasoning(taskId).catch(err => {
    console.error('[Agent] 恢复执行异常:', err);
  }).finally(() => {
    activeTasks.delete(taskId);
    const nextTaskId = dequeueNext();
    if (nextTaskId) {
      const nextTask = tasks.get(nextTaskId);
      if (nextTask && nextTask.status === 'queued') {
        startTask(nextTaskId).catch(err => console.error('[Agent] 队列任务启动失败:', err));
      }
    }
  });

  return task;
}

// ========== 任务控制 ==========

export function pauseTask(taskId: string): AgentTask {
  const task = tasks.get(taskId);
  if (!task) throw new Error('任务不存在');
  if (task.status !== 'running') throw new Error('只能暂停运行中的任务');

  task.status = 'paused';
  addLog(task, 'warn', '⏸ 任务已暂停');
  notifyUpdate(task);
  return task;
}

export function resumeTask(taskId: string, humanInstruction?: string): AgentTask {
  const task = tasks.get(taskId);
  if (!task) throw new Error('任务不存在');
  if (task.status !== 'paused' && task.status !== 'waiting_human') throw new Error('任务状态不允许恢复');

  if (task.status === 'waiting_human') {
    const currentStep = task.plan[task.currentStepIndex];
    if (currentStep) {
      currentStep.status = 'completed';
      currentStep.completedAt = new Date().toISOString();
      currentStep.result = humanInstruction || '用户确认继续';

      // 如果人工指令提供了实际数据（如手机号、验证码），
      // 回退到上一个输入步骤，用真实数据重新执行
      if (humanInstruction && humanInstruction.trim()) {
        // 找到 wait_human 之前的最后一个输入/操作步骤
        for (let i = task.currentStepIndex - 1; i >= 0; i--) {
          const prevStep = task.plan[i];
          if (prevStep && prevStep.status === 'completed' &&
              (prevStep.toolName === 'browser_type' || prevStep.toolName === 'browser_click')) {
            // 检查是否输入了占位符
            const text = prevStep.toolParams?.text || '';
            if (text.includes('{{') || text.includes('user_provided')) {
              addLog(task, 'info', `🔄 回退步骤 ${i}（${prevStep.title}）以使用人工提供的数据`);
              prevStep.status = 'pending';
              prevStep.completedAt = undefined;
              prevStep.result = undefined;
              // 更新参数为真实数据
              if (prevStep.toolParams) {
                prevStep.toolParams.text = humanInstruction.trim();
              }
              task.currentStepIndex = i - 1; // 让 executeWithReasoning 从这个步骤重新开始
              break;
            }
          }
        }
      }
    }
  }

  task.status = 'running';
  // 重置失败计数（防止跨 resume 累积导致误触发卡住检测）
  (task as any)._failureCounts = {};
  // 重新加入活跃任务集合（防止绕过并发控制）
  activeTasks.add(taskId);
  addLog(task, 'info', `▶ 任务已恢复${humanInstruction ? `，人工指令: ${humanInstruction}` : ''}`);
  notifyUpdate(task);

  // 如果有人工指令，注入到 AI 对话历史（通过 task 临时存储）
  if (humanInstruction) {
    (task as any)._humanInstruction = humanInstruction;
  }

  executeWithReasoning(taskId).catch(err => {
    console.error('[Agent] 恢复执行异常:', err);
  }).finally(() => {
    activeTasks.delete(taskId);
    const nextTaskId = dequeueNext();
    if (nextTaskId) {
      const nextTask = tasks.get(nextTaskId);
      if (nextTask && nextTask.status === 'queued') {
        startTask(nextTaskId).catch(err => console.error('[Agent] 队列任务启动失败:', err));
      }
    }
  });

  return task;
}

export function cancelTask(taskId: string): AgentTask {
  const task = tasks.get(taskId);
  if (!task) throw new Error('任务不存在');

  task.status = 'cancelled';
  task.completedAt = new Date().toISOString();
  addLog(task, 'warn', '🚫 任务已取消');
  notifyUpdate(task);
  return task;
}

// ========== 规则引擎兜底 ==========
const RULE_PATTERNS: { keywords: string[]; action: string; params: Record<string, any> }[] = [
  { keywords: ['搜索', '查询', '查找'], action: 'browser_navigate', params: { url: 'https://www.baidu.com' } },
  { keywords: ['登录', '登陆', 'login'], action: 'wait_human', params: { reason: '需要登录信息', instruction: '请提供用户名和密码' } },
  { keywords: ['注册', '注册账号', 'register'], action: 'wait_human', params: { reason: '需要注册信息', instruction: '请提供注册所需信息（手机号/邮箱等）' } },
];

export function getRuleEngineSuggestion(taskTitle: string): { action: string; toolName: string; params: any; reason: string } | null {
  for (const rule of RULE_PATTERNS) {
    if (rule.keywords.some(k => taskTitle.includes(k))) {
      return {
        action: 'execute',
        toolName: rule.action,
        params: rule.params,
        reason: `规则引擎匹配: "${rule.keywords[0]}"`,
      };
    }
  }
  return null;
}

// ========== 定时清理临时文件 ==========
const TEMP_DIRS = ['/tmp/.org.chromium.Chromium.*'];

setInterval(() => {
  try {
    const { execSync } = require('child_process');
    let cleaned = 0;
    for (const pattern of TEMP_DIRS) {
      try {
        const result = execSync(`find /tmp -maxdepth 1 -name '.org.chromium.Chromium.*' -type d -mtime +1 2>/dev/null | wc -l`).toString().trim();
        const count = parseInt(result) || 0;
        if (count > 0) {
          execSync(`find /tmp -maxdepth 1 -name '.org.chromium.Chromium.*' -type d -mtime +1 -exec rm -rf {} + 2>/dev/null`);
          cleaned += count;
        }
      } catch {}
    }
    if (cleaned > 0) {
      console.log(`[Agent] 清理了 ${cleaned} 个 Chromium 临时目录`);
    }
  } catch {}
}, 3600000); // 每小时执行一次

// ========== 辅助函数 ==========

function addLog(task: AgentTask, level: AgentLog['level'], message: string) {
  const logEntry = { timestamp: new Date().toISOString(), level, message };
  task.logs.push(logEntry);

  // 持久化日志到 JSONL 文件
  try {
    const today = new Date().toISOString().slice(0, 10); // e.g. '2026-04-28'
    const logFilePath = path.join(AGENT_LOGS_DIR, `${today}.jsonl`);
    const persistEntry = {
      timestamp: logEntry.timestamp,
      taskId: task.id,
      action: level,
      status: task.status,
      message: logEntry.message,
    };
    fs.appendFileSync(logFilePath, JSON.stringify(persistEntry) + '\n', 'utf-8');
  } catch (err) {
    console.error('[Agent] 日志持久化写入失败:', err);
  }
}

// ========== 操作审计日志 ==========
const AUDIT_LOG_FILE = path.join(AGENT_LOGS_DIR, 'audit.log');

export function auditLog(action: string, taskId: string, details: Record<string, any> = {}): void {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    taskId,
    ...details,
  };
  try {
    fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify(entry) + '\n');
  } catch {}
}
