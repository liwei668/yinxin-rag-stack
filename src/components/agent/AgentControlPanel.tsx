'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { extractLastUrl, extractLastScreenshot } from '../../utils/agentUtils';
import {
  AgentTask,
  AgentLog,
  TaskStatus,
  StepStatus,
} from '../../services/agent/types';

interface AgentControlPanelProps {
  task: AgentTask | null;
  onUpdateTask: (task: AgentTask | null) => void;
  onUrlChange: (url: string) => void;
  /** 人工接管模式 */
  isManualMode: boolean;
  onManualModeChange: (manual: boolean) => void;
}

/* ---------- 常量映射 ---------- */

const taskStatusLabels: Record<TaskStatus, string> = {
  planning: '分析中',
  pending_approval: '待确认',
  running: '执行中',
  paused: '已暂停',
  waiting_human: '等待回复',
  completed: '已完成',
  failed: '已失败',
  cancelled: '已取消',
};

const taskStatusBadgeColors: Record<TaskStatus, string> = {
  planning: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  pending_approval: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  running: 'bg-green-500/20 text-green-300 border-green-500/30',
  paused: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  waiting_human: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  completed: 'bg-green-600/20 text-green-300 border-green-600/30',
  failed: 'bg-red-500/20 text-red-300 border-red-500/30',
  cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const stepStatusIcons: Record<StepStatus, { icon: string; color: string }> = {
  pending: { icon: '○', color: 'text-gray-500' },
  running: { icon: '◉', color: 'text-blue-400 animate-pulse' },
  completed: { icon: '●', color: 'text-green-400' },
  failed: { icon: '✕', color: 'text-red-400' },
  skipped: { icon: '◎', color: 'text-gray-400' },
  waiting_human: { icon: '❓', color: 'text-orange-400 animate-pulse' },
};

const logLevelColors: Record<string, string> = {
  info: 'text-gray-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  success: 'text-green-400',
};

function getDefaultUserId(): string {
  if (typeof window === 'undefined') return 'anonymous';
  try {
    const raw = localStorage.getItem('yinxin_agl_user');
    if (raw) { const user = JSON.parse(raw); if (user?.id) return user.id; }
  } catch {}
  return 'anonymous';
}

/* ---------- 组件 ---------- */

export default function AgentControlPanel({
  task,
  onUpdateTask,
  onUrlChange,
  isManualMode,
  onManualModeChange,
}: AgentControlPanelProps) {
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sseRetryRef = useRef(0);
  const maxSseRetries = 3;

  /* ---- SSE 订阅 ---- */
  useEffect(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (!task) return;

    const isActive =
      task.status === 'running' ||
      task.status === 'paused' ||
      task.status === 'waiting_human' ||
      task.status === 'planning';

    if (!isActive) { sseRetryRef.current = 0; return; }
    if (sseRetryRef.current >= maxSseRetries) return;

    const es = new EventSource(`/api/agent?action=subscribe&taskId=${task.id}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const updated: AgentTask = JSON.parse(event.data);
        onUpdateTask(updated);
        if (updated.logs && updated.logs.length > logs.length) setLogs(updated.logs);
        const url = extractLastUrl(updated);
        if (url) onUrlChange(url);

        sseRetryRef.current = 0;

        // 任务规划完成后自动启动
        if (updated.status === 'pending_approval' && !isManualMode) {
          setTimeout(async () => {
            const startRes = await fetch('/api/agent', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'start', taskId: updated.id }),
            });
            const startData = await startRes.json();
            if (startData.success && startData.task) {
              onUpdateTask(startData.task);
            }
          }, 500);
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      sseRetryRef.current++;
      if (sseRetryRef.current < maxSseRetries) {
        setTimeout(() => {
          if (task.status === 'running' || task.status === 'waiting_human' || task.status === 'planning') {
            const newEs = new EventSource(`/api/agent?action=subscribe&taskId=${task.id}`);
            eventSourceRef.current = newEs;
            newEs.onerror = () => { newEs.close(); eventSourceRef.current = null; };
          }
        }, 3000);
      }
    };

    return () => { es.close(); eventSourceRef.current = null; };
  }, [task?.id, task?.status, logs.length, onUpdateTask, onUrlChange, isManualMode]);

  useEffect(() => { if (task?.logs) setLogs(task.logs); }, [task?.id]);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs.length]);

  /* ---- 发送指令 ---- */
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setSending(true);
    setInputText('');

    try {
      // 如果任务在等待人工回复，直接回复
      if (task && task.status === 'waiting_human') {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reply', taskId: task.id, message: text }),
        });
        const data = await res.json();
        if (data.success && data.task) onUpdateTask(data.task);
        return;
      }

      // 否则创建新任务
      const createRes = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', userId: getDefaultUserId(), title: text, description: text }),
      });
      const createData = await createRes.json();
      if (!createData.success || !createData.task) return;

      const createdTask: AgentTask = createData.task;
      onUpdateTask(createdTask);
      setLogs(createdTask.logs || []);

      // 等待任务规划完成后自动启动
      // 注意：start操作会通过SSE回调处理
    } catch (err) {
      console.error('[AgentControlPanel] 发送失败:', err);
    } finally {
      setSending(false);
    }
  }, [inputText, sending, task, onUpdateTask, onUrlChange]);

  /* ---- 操作按钮 ---- */
  const handleAction = useCallback(async (action: string) => {
    if (!task || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, taskId: task.id }),
      });
      const data = await res.json();
      if (data.success && data.task) onUpdateTask(data.task);
    } catch (err) {
      console.error(`[AgentControlPanel] ${action} 失败:`, err);
    } finally {
      setActionLoading(false);
    }
  }, [task, actionLoading, onUpdateTask]);

  const completedSteps = task?.plan ? task.plan.filter(s => s.status === 'completed').length : 0;
  const totalSteps = task?.plan?.length || 0;
  const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTime = (ts?: string) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // 获取当前等待人工的步骤信息
  const waitingStep = task?.status === 'waiting_human' && task.currentStepIndex >= 0
    ? task.plan[task.currentStepIndex]
    : null;

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* ====== 输入区 ====== */}
      <div className="flex-shrink-0 border-b border-gray-700/50 p-3">
        <div className="flex items-start gap-2">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={
              task?.status === 'waiting_human'
                ? `Agent 需要你的回复...${waitingStep?.toolParams?.instruction ? `\n${waitingStep.toolParams.instruction}` : ''}`
                : '输入指令，让 Agent 自动操作浏览器...'
            }
            disabled={sending || task?.status === 'running' || task?.status === 'planning'}
            rows={task?.status === 'waiting_human' ? 3 : 2}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={sending || !inputText.trim() || task?.status === 'running' || task?.status === 'planning'}
            className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg text-white transition-colors ${
              task?.status === 'waiting_human'
                ? 'bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700'
                : 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500'
            }`}
            title={task?.status === 'waiting_human' ? '回复 Agent' : '发送指令'}
          >
            {sending ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ====== 等待人工提示 ====== */}
      {task?.status === 'waiting_human' && waitingStep && (
        <div className="flex-shrink-0 bg-orange-500/10 border-b border-orange-500/20 px-3 py-2">
          <div className="flex items-center gap-2 text-orange-300 text-xs">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">Agent 需要你的帮助：</span>
          </div>
          <p className="text-orange-200/80 text-xs mt-1 ml-6">
            {waitingStep.toolParams?.reason || waitingStep.toolParams?.instruction || waitingStep.title}
          </p>
          <p className="text-gray-500 text-xs mt-1 ml-6">请在上方输入框回复后发送</p>
        </div>
      )}

      {/* ====== 任务状态 ====== */}
      {task && (
        <div className="flex-shrink-0 border-b border-gray-700/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium truncate max-w-[240px]">{task.title}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${taskStatusBadgeColors[task.status]}`}>
              {taskStatusLabels[task.status]}
            </span>
          </div>

          {totalSteps > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>步骤 {completedSteps}/{totalSteps}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            {task.status === 'pending_approval' && (
              <ActionButton label="开始执行" color="bg-green-600 hover:bg-green-700" loading={actionLoading} onClick={() => handleAction('start')} />
            )}
            {task.status === 'running' && !isManualMode && (
              <>
                <ActionButton label="暂停" color="bg-yellow-600 hover:bg-yellow-700" loading={actionLoading} onClick={() => handleAction('pause')} />
                <ActionButton label="人工接管" color="bg-blue-600 hover:bg-blue-700" loading={actionLoading} onClick={async () => { await handleAction('pause'); onManualModeChange(true); }} />
              </>
            )}
            {task.status === 'paused' && !isManualMode && (
              <>
                <ActionButton label="继续执行" color="bg-green-600 hover:bg-green-700" loading={actionLoading} onClick={() => handleAction('resume')} />
                <ActionButton label="人工接管" color="bg-blue-600 hover:bg-blue-700" loading={actionLoading} onClick={() => onManualModeChange(true)} />
              </>
            )}
            {isManualMode && (
              <ActionButton label="交还控制权给 Agent" color="bg-orange-600 hover:bg-orange-700" loading={actionLoading} onClick={() => { onManualModeChange(false); handleAction('resume'); }} />
            )}
            {(task.status === 'running' || task.status === 'paused' || task.status === 'waiting_human') && (
              <ActionButton label="终止任务" color="bg-red-600 hover:bg-red-700" loading={actionLoading} onClick={() => handleAction('cancel')} />
            )}
            {task.status === 'completed' && task.result && (
              <span className="text-xs text-green-400">{task.result.summary}</span>
            )}
            {task.status === 'failed' && (
              <span className="text-xs text-red-400">任务执行失败</span>
            )}
          </div>
        </div>
      )}

      {/* ====== 步骤列表 ====== */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {task && task.plan.length > 0 && (
          <div className="p-3 space-y-1">
            <div className="text-xs text-gray-500 font-medium mb-2">执行步骤</div>
            {task.plan.map((step, i) => {
              const isCurrent = i === task.currentStepIndex;
              const iconInfo = stepStatusIcons[step.status];
              return (
                <div key={step.id} className={`text-xs py-1.5 px-2 rounded ${isCurrent ? 'bg-blue-500/10 border border-blue-500/20' : 'border border-transparent'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${iconInfo.color}`}>{iconInfo.icon}</span>
                    <span className={`flex-1 truncate ${
                      step.status === 'completed' ? 'text-gray-300'
                      : step.status === 'failed' ? 'text-red-400'
                      : step.status === 'running' ? 'text-blue-300'
                      : step.status === 'waiting_human' ? 'text-orange-300'
                      : 'text-gray-500'
                    }`}>{step.title}</span>
                    {step.duration != null && <span className="text-gray-600 flex-shrink-0">{formatDuration(step.duration)}</span>}
                  </div>
                  {step.status === 'waiting_human' && step.toolParams?.reason && (
                    <div className="mt-1 ml-5 text-orange-400/80 truncate">{step.toolParams.reason}</div>
                  )}
                  {step.status === 'completed' && step.result?.userReply && (
                    <div className="mt-1 ml-5 text-blue-400/80 truncate">💬 用户回复: {step.result.userReply}</div>
                  )}
                  {step.status === 'completed' && step.result?.title && (
                    <div className="mt-1 ml-5 text-gray-500 truncate">{step.result.title}</div>
                  )}
                  {step.status === 'failed' && step.error && (
                    <div className="mt-1 ml-5 text-red-400/80 truncate">{step.error}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!task && (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 px-6 text-center">
            <svg className="w-12 h-12 mb-3 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">输入指令开始</p>
            <p className="text-xs text-gray-700 mt-1">Agent 将理解需求、分析步骤、逐步执行</p>
            <p className="text-xs text-gray-700 mt-0.5">需要时向你提问，你回复后继续</p>
          </div>
        )}
      </div>

      {/* ====== 实时日志 ====== */}
      {logs.length > 0 && (
        <div className="flex-shrink-0 border-t border-gray-700/50">
          <div className="px-3 py-1.5 text-xs text-gray-500 font-medium flex items-center justify-between">
            <span>实时日志</span>
            <span className="text-gray-600">{logs.length} 条</span>
          </div>
          <div className="max-h-[200px] overflow-y-auto px-3 pb-2 space-y-0.5">
            {logs.map((log, i) => (
              <div key={i} className={`text-xs font-mono leading-relaxed ${logLevelColors[log.level] || 'text-gray-400'}`}>
                <span className="text-gray-600">{formatTime(log.timestamp)}</span> {log.message}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, color, loading, onClick }: { label: string; color: string; loading: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={loading} className={`px-3 py-1 text-xs text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ${color}`}>
      {loading && <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
      {label}
    </button>
  );
}


