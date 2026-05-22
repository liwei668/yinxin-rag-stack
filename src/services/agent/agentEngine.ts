// Agent 引擎 v3 - 基于 BullMQ 的多轮推理架构
// 核心：理解需求 → 分析步骤 → 逐步执行 → AI决策 → 人工介入 → 继续 → 反馈结果
import { v4 as uuidv4 } from 'uuid';
import {
  AgentTask, AgentStep, AgentLog, TaskStatus, StepStatus,
  ToolResult,
} from './types';
import { toolRegistry } from './toolRegistry';
import { agentEvolution } from './agentEvolution';
import { permissionController } from './permissionController';
import { validateFinancialData } from './dataValidator';
import fs from 'fs';
import path from 'path';
import { callAI, trimAIHistory, MAX_AI_CALLS_PER_TASK } from './aiClient';
import {
  agentTaskQueue, addTaskToQueue, TaskData, createTaskWorker,
  pauseTaskJob, resumeTaskJob, cancelTaskJob, getTaskJobStatus,
} from './taskQueue';
import { logger } from '../../lib/logger';

const DATA_DIR = path.join(process.cwd(), 'data');
const AGENT_LOGS_DIR = path.join(DATA_DIR, 'agent-logs');

if (!fs.existsSync(AGENT_LOGS_DIR)) {
  fs.mkdirSync(AGENT_LOGS_DIR, { recursive: true });
}

// ========== 内存存储（仅用于运行时状态，重启后从Redis恢复） ==========
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
}

// ========== BullMQ Worker 初始化 ==========
let workerInitialized = false;

export function initAgentWorker(): void {
  if (workerInitialized) return;
  
  createTaskWorker(async (taskData: TaskData) => {
    const task = tasks.get(taskData.taskId);
    if (!task) {
      logger.error('AGENT', `任务不存在: ${taskData.taskId}`);
      return;
    }
    
    // 执行任务
    await executeWithReasoning(taskData.taskId);
  });
  
  workerInitialized = true;
  logger.info('AGENT', 'BullMQ Worker 初始化完成');
}

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

// ========== 任务规划 ==========

export async function planTask(taskId: string): Promise<AgentTask> {
  const task = tasks.get(taskId);
  if (!task) throw new Error('任务不存在');

  task.status = 'planning';
  addLog(task, 'info', '🧠 AI 正在理解需求并分析操作步骤...');
  notifyUpdate(task);

  const evolutionTips = agentEvolution.getEvolutionPrompt();

  const planPrompt = `# 任务规划

你是任务规划专家。将用户需求拆解为可执行的操作步骤序列。

## 用户任务
- 标题：${task.title}
- 描述：${task.description}

## 可用工具
${toolRegistry.getToolDescriptions()}

## 输出格式
返回 JSON 数组，每个元素包含：
{
  "toolName": "工具名",
  "params": { 参数对象 },
  "reasoning": "决策依据"
}

## 规划规则
1. 每个步骤只能包含一个工具调用
2. 优先使用安全工具（calculator, get_current_time 等）
3. 需要人工确认的操作标记 riskLevel 为 "high"
4. 步骤数不超过 10 步

只返回 JSON 数组，不要返回其他文字。${evolutionTips}`;

  try {
    const content = await callAI([{ role: 'user', content: planPrompt }]);
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const steps = JSON.parse(jsonMatch[0]);
      task.plan = steps.map((s: any, i: number) => ({
        id: uuidv4(),
        index: i,
        title: s.toolName ? `${s.toolName}: ${s.reasoning || ''}` : `步骤 ${i + 1}`,
        description: s.reasoning || '',
        status: 'pending' as StepStatus,
        riskLevel: s.riskLevel || 'safe',
        toolName: s.toolName || '',
        toolParams: s.params || {},
      }));
    } else {
      task.plan = generateDefaultPlan(task);
    }
  } catch (error: any) {
    logger.error('AGENT', `AI 规划失败: ${error.message}`);
    task.plan = generateDefaultPlan(task);
  }

  task.status = 'pending_approval';
  addLog(task, 'success', `📋 已分析出 ${task.plan.length} 个步骤`);
  notifyUpdate(task);

  return task;
}

function generateDefaultPlan(task: AgentTask): AgentStep[] {
  return [{
    id: uuidv4(),
    index: 0,
    title: '分析任务',
    description: `分析: ${task.title}`,
    status: 'pending',
    riskLevel: 'safe',
    toolName: 'get_current_time',
    toolParams: {},
  }];
}

// ========== 任务执行 ==========

export async function startTask(taskId: string): Promise<AgentTask> {
  const task = tasks.get(taskId);
  if (!task) throw new Error('任务不存在');
  if (task.status !== 'pending_approval' && task.status !== 'paused') {
    throw new Error('任务状态不允许执行');
  }

  task.status = 'running';
  task.startedAt = new Date().toISOString();
  addLog(task, 'info', '🚀 任务开始执行');
  notifyUpdate(task);

  // 添加到 BullMQ 队列
  const taskData: TaskData = {
    taskId: task.id,
    userId: task.userId,
    title: task.title,
    description: task.description,
    plan: task.plan,
    status: 'running',
    createdAt: task.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await addTaskToQueue(taskData);
  logger.info('AGENT', `任务已加入队列: ${taskId}`);

  return task;
}

async function executeWithReasoning(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) return;

  const aiHistory: { role: string; content: string }[] = [];
  let aiCallCount = 0;

  // 初始系统提示
  const evolutionTips = agentEvolution.getEvolutionPrompt();
  aiHistory.push({
    role: 'system',
    content: `你是任务执行助手。根据用户需求和可用工具，生成执行步骤。

可用工具：
${toolRegistry.getToolDescriptions()}

输出格式（强制 JSON）：
{
  "toolName": "工具名",
  "params": { 参数 },
  "reasoning": "决策依据"
}

或任务完成：
{
  "complete": true,
  "summary": "任务完成摘要"
}

或需要人工：
{
  "needHuman": true,
  "question": "需要用户回答的问题"
}

${evolutionTips}`,
  });

  let stepIndex = task.currentStepIndex >= 0 ? task.currentStepIndex + 1 : 0;
  const maxSteps = 30;

  try {
    while (stepIndex < maxSteps && task.status === 'running') {
      if (task.status === 'paused' || task.status === 'cancelled') {
        addLog(task, 'warn', '⏸ 任务已暂停/取消');
        break;
      }

      // 查找下一个未完成的步骤
      let currentStep: AgentStep | undefined;
      for (let i = 0; i < task.plan.length; i++) {
        const step = task.plan[i];
        if (step.status !== 'completed') {
          currentStep = step;
          stepIndex = i;
          break;
        }
      }

      // 所有预规划步骤已完成，进入AI实时决策
      if (!currentStep) {
        if (++aiCallCount > MAX_AI_CALLS_PER_TASK) {
          addLog(task, 'warn', `⚠ AI 调用次数已达上限`);
          task.status = 'completed';
          task.completedAt = new Date().toISOString();
          task.result = { success: false, summary: 'AI 调用次数已达上限' };
          notifyUpdate(task);
          return;
        }

        // 构造 AI 输入
        const aiInput = `任务: ${task.title}\n描述: ${task.description}\n已执行步骤: ${task.plan.filter(s => s.status === 'completed').length}/${task.plan.length}\n\n请决定下一步操作或完成任务。`;
        aiHistory.push({ role: 'user', content: aiInput });

        const aiResponse = await callAI(trimAIHistory(aiHistory));
        aiHistory.push({ role: 'assistant', content: aiResponse });

        // 解析 AI 决策
        let decision: any;
        try {
          const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
          decision = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch {
          decision = null;
        }

        if (!decision) {
          addLog(task, 'warn', 'AI 返回格式异常，跳过');
          stepIndex++;
          continue;
        }

        // 任务完成
        if (decision.complete) {
          task.status = 'completed';
          task.completedAt = new Date().toISOString();
          task.result = {
            success: true,
            summary: decision.summary || '任务已完成',
          };
          addLog(task, 'success', `✅ ${decision.summary || '任务已完成'}`);
          agentEvolution.recordTask(task).catch(() => {});
          notifyUpdate(task);
          return;
        }

        // 需要人工
        if (decision.needHuman) {
          const humanStep: AgentStep = {
            id: uuidv4(),
            index: task.plan.length,
            title: '等待用户操作',
            description: decision.question,
            toolName: 'wait_human',
            toolParams: { question: decision.question },
            status: 'waiting_human',
            riskLevel: 'high',
          };
          task.plan.push(humanStep);
          task.status = 'waiting_human';
          task.currentStepIndex = task.plan.length - 1;
          addLog(task, 'warn', `❓ 需要用户: ${decision.question}`);
          notifyUpdate(task);
          return;
        }

        // 创建动态步骤
        // 先验证工具是否存在
        const toolDef = toolRegistry.getDefinition(decision.toolName);
        if (!toolDef) {
          // 工具不存在，让 AI 重新选择
          aiHistory.push({
            role: 'user',
            content: `错误：工具 "${decision.toolName}" 不存在。请从可用工具中选择：\n${toolRegistry.getToolDescriptions()}`,
          });
          continue;
        }
        
        currentStep = {
          id: uuidv4(),
          index: task.plan.length,
          title: decision.toolName,
          description: decision.reasoning,
          toolName: decision.toolName,
          toolParams: decision.params || {},
          status: 'pending',
          riskLevel: toolDef.riskLevel || 'safe',
        };
        task.plan.push(currentStep);
      }

      // 执行步骤
      const { executed, result } = await executeStep(task, currentStep, stepIndex);
      if (!executed) break;

      // 记录到 AI 历史
      aiHistory.push({
        role: 'user',
        content: `步骤 "${currentStep.title}" 执行${result.success ? '成功' : '失败'}: ${result.message || result.error}`,
      });

      stepIndex++;
    }

    if (stepIndex >= maxSteps && task.status === 'running') {
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      task.result = { success: false, summary: '达到最大步骤数限制' };
      addLog(task, 'warn', '⚠ 达到最大步骤数限制');
      notifyUpdate(task);
    }
  } catch (error: any) {
    logger.error('AGENT', `执行异常: ${error.message}`);
    task.status = 'failed';
    task.completedAt = new Date().toISOString();
    task.result = { success: false, summary: `执行异常: ${error.message}` };
    addLog(task, 'error', `❌ 执行异常: ${error.message}`);
    notifyUpdate(task);
  }
}

async function executeStep(
  task: AgentTask,
  step: AgentStep,
  index: number,
): Promise<{ executed: boolean; result: ToolResult }> {
  if (task.status === 'paused' || task.status === 'cancelled') {
    return { executed: false, result: { success: false, error: '任务已暂停或取消' } };
  }

  task.currentStepIndex = index;
  step.status = 'running';
  step.startedAt = new Date().toISOString();
  addLog(task, 'info', `⚡ 步骤 ${index + 1}: ${step.title}`);
  notifyUpdate(task);

  // 跳过 wait_human
  if (step.toolName === 'wait_human') {
    step.status = 'waiting_human';
    task.status = 'waiting_human';
    addLog(task, 'warn', `❓ 等待用户操作`);
    notifyUpdate(task);
    return { executed: false, result: { success: false, error: '等待人工操作' } };
  }

  // 检查权限
  const toolDef = toolRegistry.getDefinition(step.toolName);
  if (toolDef && permissionController.needsApproval(step.riskLevel, toolDef)) {
    addLog(task, 'warn', `⚠ 操作需要人工确认`);
    const humanStep: AgentStep = {
      id: uuidv4(),
      index: task.plan.length,
      title: '需要人工确认',
      description: `操作 "${step.title}" 需要确认`,
      toolName: 'wait_human',
      toolParams: { reason: '操作需要人工确认' },
      status: 'waiting_human',
      riskLevel: 'high',
    };
    task.plan.push(humanStep);
    task.status = 'waiting_human';
    task.currentStepIndex = task.plan.length - 1;
    notifyUpdate(task);
    return { executed: false, result: { success: false, error: '操作需要人工确认' } };
  }

  // 执行工具
  const startTime = Date.now();
  let result: ToolResult;

  try {
    result = await toolRegistry.execute(step.toolName, step.toolParams, task.userId);
  } catch (error: any) {
    result = { success: false, error: error.message };
  }

  const duration = Date.now() - startTime;
  step.duration = duration;

  if (result.success) {
    step.status = 'completed';
    step.result = result.data;
    addLog(task, 'success', `✅ ${result.message || step.title} (${duration}ms)`);
  } else {
    step.status = 'failed';
    step.error = result.error;
    addLog(task, 'error', `❌ ${step.title} - ${result.error} (${duration}ms)`);
  }

  step.completedAt = new Date().toISOString();
  agentEvolution.recordStep(task.id, step, result).catch(() => {});
  notifyUpdate(task);

  return { executed: true, result };
}

// ========== 人工回复 ==========

export function replyToTask(taskId: string, userReply: string): AgentTask {
  const task = tasks.get(taskId);
  if (!task) throw new Error('任务不存在');
  if (task.status !== 'waiting_human') throw new Error('任务不在等待人工状态');

  const currentStep = task.plan[task.currentStepIndex];
  if (currentStep) {
    currentStep.status = 'completed';
    currentStep.completedAt = new Date().toISOString();
    currentStep.result = { userReply };
    addLog(task, 'info', `💬 用户回复: ${userReply}`);
  }

  task.status = 'running';
  addLog(task, 'info', '▶ 继续执行...');
  notifyUpdate(task);

  // 重新加入队列继续执行
  const taskData: TaskData = {
    taskId: task.id,
    userId: task.userId,
    title: task.title,
    description: task.description,
    plan: task.plan,
    status: 'running',
    createdAt: task.createdAt,
    updatedAt: new Date().toISOString(),
  };
  addTaskToQueue(taskData).catch(err => {
    logger.error('AGENT', `恢复执行失败: ${err.message}`);
  });

  return task;
}

// ========== 任务控制 ==========

export async function pauseTask(taskId: string): Promise<AgentTask> {
  const task = tasks.get(taskId);
  if (!task) throw new Error('任务不存在');
  if (task.status !== 'running') throw new Error('只能暂停运行中的任务');

  await pauseTaskJob(taskId);
  task.status = 'paused';
  addLog(task, 'warn', '⏸ 任务已暂停');
  notifyUpdate(task);
  return task;
}

export async function resumeTask(taskId: string, humanInstruction?: string): Promise<AgentTask> {
  const task = tasks.get(taskId);
  if (!task) throw new Error('任务不存在');
  if (task.status !== 'paused' && task.status !== 'waiting_human') {
    throw new Error('任务状态不允许恢复');
  }

  if (task.status === 'waiting_human' && humanInstruction) {
    const currentStep = task.plan[task.currentStepIndex];
    if (currentStep) {
      currentStep.status = 'completed';
      currentStep.completedAt = new Date().toISOString();
      currentStep.result = { userReply: humanInstruction };
    }
  }

  task.status = 'running';
  addLog(task, 'info', `▶ 任务已恢复${humanInstruction ? `，指令: ${humanInstruction}` : ''}`);
  notifyUpdate(task);

  // 重新加入队列
  const taskData: TaskData = {
    taskId: task.id,
    userId: task.userId,
    title: task.title,
    description: task.description,
    plan: task.plan,
    status: 'running',
    createdAt: task.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await resumeTaskJob(taskData);

  return task;
}

export async function cancelTask(taskId: string): Promise<AgentTask> {
  const task = tasks.get(taskId);
  if (!task) throw new Error('任务不存在');

  await cancelTaskJob(taskId);
  task.status = 'cancelled';
  task.completedAt = new Date().toISOString();
  addLog(task, 'warn', '🚫 任务已取消');
  notifyUpdate(task);
  return task;
}

// ========== 辅助函数 ==========

function addLog(task: AgentTask, level: AgentLog['level'], message: string) {
  const logEntry = { timestamp: new Date().toISOString(), level, message };
  task.logs.push(logEntry);

  // 持久化日志
  try {
    const today = new Date().toISOString().slice(0, 10);
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
    logger.error('AGENT', `日志持久化失败: ${err}`);
  }
}

// 初始化 Worker
if (typeof window === 'undefined') {
  initAgentWorker();
}

logger.info('AGENT', 'Agent 引擎 v3 初始化完成（基于 BullMQ）');
