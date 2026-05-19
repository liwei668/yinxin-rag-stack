import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  createTask, getTask, getUserTasks, planTask,
  startTask, pauseTask, resumeTask, cancelTask,
  replyToTask,
  onTaskUpdate,
  offTaskUpdate,
} from '../../../src/services/agent/agentEngine';
import { toolRegistry } from '../../../src/services/agent/toolRegistry';
import { permissionController } from '../../../src/services/agent/permissionController';
import { agentEvolution } from '../../../src/services/agent/agentEvolution';
import { browserManagerFactory } from '../../../src/services/agent/browserManagerFactory';
import { logger } from '../../../src/lib/logger';

// AI 新动作名 → 现有 toolName 映射
function mapActionName(action: string): string {
  const map: Record<string, string> = {
    goto: 'browser_navigate', click: 'browser_click', input: 'browser_type',
    press: 'browser_press', scroll: 'browser_scroll', wait: 'browser_wait',
    closePopup: 'browser_click', select: 'browser_select', readPage: 'browser_read',
    switchTab: 'browser_tab',
  };
  return map[action] || action;
}

// 从 data URI 或纯 base64 中提取纯 base64 数据
function extractBase64(data: string): string {
  if (!data || typeof data !== 'string') return data;
  // 去除 data:image/png;base64, 前缀
  if (data.startsWith('data:')) {
    const commaIndex = data.indexOf(',');
    if (commaIndex >= 0) return data.substring(commaIndex + 1);
  }
  return data;
}

// 安全序列化 task 对象，去除不可序列化的内容
function safeSerialize(task: any) {
  if (!task) return task;
  const screenshotsDir = path.join(process.cwd(), 'data', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  
  // 注意：不再序列化 task.screenshots 数组，因为 step.screenshot 已经包含每个步骤的截图
  // task.screenshots 中的原始 base64 数据会导致 SSE 负载过大
  // task.result.screenshots 也需要清空，同理
  const result = task.result ? {
    ...task.result,
    screenshots: [], // 清空 result 中的截图 base64
  } : task.result;

  return {
    ...task,
    screenshots: [], // 清空，避免 base64 数据污染 SSE 负载
    result,
    logs: (task.logs || []).map((log: any) => ({
      ...log,
      message: (log.message || '').replace(/[\x00-\x1f]/g, ''),
    })),
    plan: (task.plan || []).map((step: any) => ({
      ...step,
      description: (step.description || '').replace(/[\x00-\x1f]/g, ''),
      error: (step.error || '').replace(/[\x00-\x1f]/g, ''),
      screenshot: step.screenshot ? (() => {
        try {
          // 如果已经是 URL 路径，直接使用
          if (typeof step.screenshot === 'string' && step.screenshot.startsWith('/')) return step.screenshot;
          const filename = `${task.id}_step_${step.index}.png`;
          const filepath = path.join(screenshotsDir, filename);
          // 提取纯 base64（去除 data:image/png;base64, 前缀）
          const rawBase64 = extractBase64(step.screenshot);
          const buffer = Buffer.from(rawBase64, 'base64');
          fs.writeFileSync(filepath, buffer);
          console.log(`[safeSerialize] 截图已写入: ${filename} (${buffer.length} bytes)`);
          return `/api/agent/screenshots/${filename}`;
        } catch (err) {
          logger.error('SYSTEM', '`[safeSerialize] 截图处理失败:`', { extra: { error: String(err) } });
          return undefined;
        }
      })() : undefined,
    })),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, userId, taskId, title, description, plan: presetPlan } = body;

    switch (action) {
      case 'create': {
        if (!userId || !title) {
          return NextResponse.json({ error: '缺少 userId 或 title' }, { status: 400 });
        }
        const task = createTask(userId, title, description || '');
        // 如果前端已传入规划步骤，直接使用，避免重复 AI 调用
        if (presetPlan && Array.isArray(presetPlan) && presetPlan.length > 0) {
          const { v4: uuidv4 } = require('uuid');
          task.plan = presetPlan.map((s: any, i: number) => ({
            id: uuidv4(),
            index: i,
            toolName: mapActionName(s.toolName || s.action || ''),
            title: s.title || s.description || `步骤 ${i + 1}`,
            description: s.description || s.reasoning || '',
            toolParams: s.toolParams || s.params || {},
            riskLevel: s.riskLevel || 'safe',
            status: 'pending' as const,
          }));
          task.status = 'pending_approval';
          task.logs.push({ timestamp: new Date().toISOString(), level: 'info', message: `📋 已加载 ${task.plan.length} 个预规划步骤` });

          // 异步自动启动（不 await，避免阻塞响应）
          startTask(task.id).catch((e: any) => {
            logger.error('AGENT', '自动启动失败', { extra: { error: String(e.message) } });
          });

          return NextResponse.json({ success: true, task: safeSerialize(task) });
        }
        // 自动规划
        const planned = await planTask(task.id);
        return NextResponse.json({ success: true, task: safeSerialize(planned) });
      }

      case 'start': {
        if (!taskId) return NextResponse.json({ error: '缺少 taskId' }, { status: 400 });
        const task = await startTask(taskId);
        return NextResponse.json({ success: true, task: safeSerialize(task) });
      }

      case 'pause': {
        if (!taskId) return NextResponse.json({ error: '缺少 taskId' }, { status: 400 });
        const task = pauseTask(taskId);
        return NextResponse.json({ success: true, task: safeSerialize(task) });
      }

      case 'resume': {
        if (!taskId) return NextResponse.json({ error: '缺少 taskId' }, { status: 400 });
        const instruction = body.instruction as string | undefined;
        const task = resumeTask(taskId, instruction);
        return NextResponse.json({ success: true, task: safeSerialize(task) });
      }

      case 'cancel': {
        if (!taskId) return NextResponse.json({ error: '缺少 taskId' }, { status: 400 });
        const task = cancelTask(taskId);
        return NextResponse.json({ success: true, task: safeSerialize(task) });
      }

      case 'reply': {
        if (!taskId) return NextResponse.json({ error: '缺少 taskId' }, { status: 400 });
        const { message } = body;
        if (!message) return NextResponse.json({ error: '缺少 message' }, { status: 400 });
        const task = replyToTask(taskId, message);
        return NextResponse.json({ success: true, task: safeSerialize(task) });
      }

      case 'update_sandbox': {
        const { allowedDomains, blockedDomains } = body;
        if (allowedDomains) permissionController.updateConfig({ allowedDomains });
        if (blockedDomains) permissionController.updateConfig({ blockedDomains });
        return NextResponse.json({ success: true, config: permissionController.getConfig() });
      }

      default:
        return NextResponse.json({ error: `未知操作: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    logger.error('SYSTEM', '[Agent API] POST 错误', { extra: { error: String(error) } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const taskId = searchParams.get('taskId');
    const userId = searchParams.get('userId');

    switch (action) {
      case 'task': {
        if (!taskId) return NextResponse.json({ error: '缺少 taskId' }, { status: 400 });
        const task = getTask(taskId);
        if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
        return NextResponse.json({ success: true, task: safeSerialize(task) });
      }

      case 'tasks': {
        if (!userId) return NextResponse.json({ error: '缺少 userId' }, { status: 400 });
        const tasks = getUserTasks(userId);
        return NextResponse.json({ success: true, tasks: tasks.map(safeSerialize) });
      }

      case 'tools': {
        const tools = toolRegistry.getToolsByCategory();
        return NextResponse.json({ success: true, tools });
      }

      case 'sandbox': {
        const config = permissionController.getConfig();
        return NextResponse.json({ success: true, config });
      }

      case 'performance': {
        const performance = agentEvolution.getPerformance();
        return NextResponse.json({ success: true, performance });
      }

      case 'patterns': {
        const patterns = agentEvolution.getActivePatterns();
        return NextResponse.json({ success: true, patterns });
      }

      case 'optimizations': {
        const optimizations = agentEvolution.getOptimizations();
        return NextResponse.json({ success: true, optimizations });
      }

      case 'profile': {
        const profileUserId = userId || 'anonymous';
        const bm = await browserManagerFactory.getManager(profileUserId);
        const info = bm.getProfileInfo();
        return NextResponse.json({ success: true, profile: info });
      }

      case 'subscribe': {
        // SSE 实时推送任务状态
        if (!taskId) return NextResponse.json({ error: '缺少 taskId' }, { status: 400 });

        // 先检查任务是否存在
        const existingTask = getTask(taskId);
        if (!existingTask) {
          return NextResponse.json({ error: '任务不存在' }, { status: 404 });
        }

        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            let closed = false;

            const callback = (task: any) => {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(safeSerialize(task))}\n\n`));
              } catch {
                closed = true;
              }
            };

            onTaskUpdate(taskId, callback);

            // 立即推送当前任务状态
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(safeSerialize(existingTask))}\n\n`));
            } catch {
              closed = true;
            }

            // 30秒心跳保活
            const heartbeatTimer = setInterval(() => {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(`: heartbeat\n\n`)); // SSE注释格式，客户端会忽略
              } catch {
                closed = true;
              }
            }, 30000);

            // 如果任务已完成/失败/取消，立即关闭连接
            const finalStates = ['completed', 'failed', 'cancelled'];
            if (finalStates.includes(existingTask.status)) {
              clearInterval(heartbeatTimer);
              setTimeout(() => {
                if (!closed) {
                  closed = true;
                  try { controller.close(); } catch {}
                }
              }, 1000);
              return;
            }

            // 120秒后自动关闭（给任务足够的执行时间）
            const timer = setTimeout(() => {
              if (!closed) {
                closed = true;
                try { controller.close(); } catch {}
              }
            }, 120000);

            // 清理函数（当客户端断开时调用）
            const cleanup = () => {
              if (!closed) {
                closed = true;
                clearInterval(heartbeatTimer);
                clearTimeout(timer);
                offTaskUpdate(taskId, callback);
                try { controller.close(); } catch {}
              }
            };

            // 监听连接中断
            request.signal.addEventListener('abort', cleanup);
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        });
      }

      default:
        return NextResponse.json({ error: `未知操作: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    logger.error('SYSTEM', '[Agent API] GET 错误', { extra: { error: String(error) } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
