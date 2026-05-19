'use client';

import { useState, useEffect, useRef } from 'react';
import { TaskStatus, StepStatus, AgentTask } from '@/services/agent/types';

interface AgentTaskPanelProps {
  task: AgentTask;
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onViewMonitor?: () => void;
}

const statusLabels: Record<TaskStatus, string> = {
  planning: '🤔 规划中',
  pending_approval: '📋 待确认',
  running: '🔄 执行中',
  paused: '⏸️ 已暂停',
  waiting_human: '👤 等待操作',
  completed: '✅ 已完成',
  failed: '❌ 已失败',
  cancelled: '🚫 已取消',
};

const stepStatusIcons: Record<StepStatus, string> = {
  pending: '⏳',
  running: '🔄',
  completed: '✅',
  failed: '❌',
  skipped: '⏭️',
  waiting_human: '👤',
};

export default function AgentTaskPanel({
  task,
  onStart,
  onPause,
  onResume,
  onCancel,
  onViewMonitor,
}: AgentTaskPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [currentTask, setCurrentTask] = useState(task);
  const [actionLoading, setActionLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null); // 原始URL
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [autoPreview, setAutoPreview] = useState(false); // 任务完成时自动预览
  const prevTaskRef = useRef(task);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 当外部 task prop 变化时，同步更新 currentTask
  useEffect(() => {
    if (task !== prevTaskRef.current) {
      prevTaskRef.current = task;
      setCurrentTask(task);
    }
  }, [task]);

  // 任务完成时自动显示预览
  useEffect(() => {
    if (currentTask.status === 'completed' && !autoPreview) {
      const url = getLastCompletedUrl();
      if (url) {
        setAutoPreview(true);
        setPreviewUrl(url);
      }
    }
  }, [currentTask.status, currentTask.plan]);

  // SSE 实时更新
  useEffect(() => {
    if (currentTask.status !== 'running' && currentTask.status !== 'paused' && currentTask.status !== 'waiting_human') return;

    const eventSource = new EventSource(`/api/agent?action=subscribe&taskId=${currentTask.id}`);
    eventSource.onmessage = (event) => {
      try {
        const updated = JSON.parse(event.data);
        setCurrentTask(updated);
      } catch (e) {
        console.error('[AgentPanel] SSE 数据解析失败:', e);
      }
    };
    eventSource.onerror = (e) => {
      console.error('[AgentPanel] SSE 连接错误:', e);
      eventSource.close();
    };

    return () => eventSource.close();
  }, [currentTask.id, currentTask.status]);

  const completedSteps = currentTask.plan.filter(s => s.status === 'completed').length;
  const totalSteps = currentTask.plan.length;
  const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // 从步骤结果中提取 URL
  const getStepUrl = (step: any): string | null => {
    if (step.result?.data?.url) return step.result.data.url;
    if (step.result?.url) return step.result.url;
    if (step.result?.finalUrl) return step.result.finalUrl;
    if (step.toolParams?.url) return step.toolParams.url;
    return null;
  };

  // 获取最后一个成功步骤的 URL
  const getLastCompletedUrl = (): string | null => {
    for (let i = currentTask.plan.length - 1; i >= 0; i--) {
      const url = getStepUrl(currentTask.plan[i]);
      if (url && currentTask.plan[i].status === 'completed') return url;
    }
    return null;
  };

  const lastCompletedUrl = getLastCompletedUrl();

  // 将原始URL转为代理URL
  const getProxyUrl = (url: string) => {
    return `/api/proxy/page?url=${encodeURIComponent(url)}`;
  };

  // 打开预览
  const openPreview = (url: string) => {
    setPreviewUrl(url);
    setPreviewLoading(true);
    setPreviewError(null);
  };

  // 关闭预览
  const closePreview = () => {
    setPreviewUrl(null);
    setPreviewLoading(false);
    setPreviewError(null);
  };

  // iframe 加载完成
  const handleIframeLoad = () => {
    setPreviewLoading(false);
  };

  // iframe 加载失败
  const handleIframeError = () => {
    setPreviewLoading(false);
    setPreviewError('网页加载失败，可能是网络问题或网站限制了访问');
  };

  // 带加载状态的按钮处理
  const handleStart = async () => {
    setActionLoading(true);
    setAutoPreview(false);
    try { await onStart?.(); } finally { setTimeout(() => setActionLoading(false), 500); }
  };
  const handlePause = async () => {
    setActionLoading(true);
    try { await onPause?.(); } finally { setTimeout(() => setActionLoading(false), 500); }
  };
  const handleResume = async () => {
    setActionLoading(true);
    try { await onResume?.(); } finally { setTimeout(() => setActionLoading(false), 500); }
  };
  const handleCancel = async () => {
    setActionLoading(true);
    try { await onCancel?.(); } finally { setTimeout(() => setActionLoading(false), 500); }
  };

  return (
    <div className="border border-gray-100 rounded-lg bg-gray-50 overflow-visible my-2">
      {/* 标题栏 */}
      <div
        className="px-4 py-3 bg-gray-50 cursor-pointer flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🎬</span>
          <span className="font-medium text-gray-800 text-sm">{currentTask.title}</span>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {statusLabels[currentTask.status]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {totalSteps > 0 && (
            <span className="text-xs text-gray-600">{completedSteps}/{totalSteps} 步骤</span>
          )}
          <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 py-3 space-y-3">
          {/* 进度条 */}
          {totalSteps > 0 && (
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-gray-400 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* 网页实时预览区域 */}
          {previewUrl && (
            <div className="border border-gray-300 rounded-lg overflow-hidden bg-white shadow-sm">
              {/* 预览标题栏 - 模拟浏览器 */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 border-b">
                {/* 浏览器圆点 */}
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
                </div>
                {/* 地址栏 */}
                <div className="flex-1 flex items-center bg-white border border-gray-200 rounded px-2 py-0.5 text-xs text-gray-500 truncate">
                  <span className="text-green-600 mr-1">🔒</span>
                  {previewUrl}
                </div>
                {/* 操作按钮 */}
                <div className="flex items-center gap-1">
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 px-2 py-0.5 bg-blue-50 rounded border border-blue-200 hover:bg-blue-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    ↗ 新窗口
                  </a>
                  <button
                    onClick={(e) => { e.stopPropagation(); closePreview(); }}
                    className="text-xs text-gray-500 hover:text-gray-700 px-1.5 py-0.5 hover:bg-gray-200 rounded"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* iframe 内容区 */}
              <div className="relative" style={{ height: '400px' }}>
                {previewLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full"></div>
                      <span className="text-sm text-gray-500">正在加载网页...</span>
                    </div>
                  </div>
                )}
                {previewError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
                    <div className="flex flex-col items-center gap-2 text-center px-4">
                      <span className="text-2xl">⚠️</span>
                      <span className="text-sm text-red-500">{previewError}</span>
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        点击这里在新窗口中打开
                      </a>
                    </div>
                  </div>
                )}
                <iframe
                  ref={iframeRef}
                  src={getProxyUrl(previewUrl)}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                  title="网页预览"
                  onLoad={handleIframeLoad}
                  onError={handleIframeError}
                />
              </div>
            </div>
          )}

          {/* 执行计划 */}
          {currentTask.plan.length > 0 && (
            <div className="space-y-1">
              {currentTask.plan.map((step, i) => {
                const stepUrl = getStepUrl(step);
                const isCurrentStep = i === currentTask.currentStepIndex;
                return (
                  <div
                    key={step.id}
                    className={`text-sm py-1.5 px-2 rounded border ${
                      isCurrentStep ? 'bg-gray-50 border-gray-200' : 'border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{stepStatusIcons[step.status]}</span>
                      <span className={step.status === 'completed' ? 'text-green-700' : step.status === 'failed' ? 'text-red-600' : 'text-gray-700'}>
                        {step.title}
                      </span>
                      {step.duration && (
                        <span className="text-xs text-gray-400 ml-auto">
                          {Math.round(step.duration / 1000)}s
                        </span>
                      )}
                    </div>

                    {/* 步骤结果 */}
                    {step.status === 'completed' && step.result && (
                      <div className="mt-1 ml-6 text-xs text-gray-600 space-y-1">
                        {step.result.data?.title && (
                          <div className="flex items-center gap-1">
                            <span>📄</span>
                            <span className="text-blue-700 font-medium">{step.result.data.title}</span>
                          </div>
                        )}
                        {step.result.message && (
                          <div className="text-green-600">{step.result.message}</div>
                        )}
                        {/* 搜索结果展示 */}
                        {step.result.data?.searchResults && step.result.data.searchResults.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            <div className="text-gray-500 font-medium">搜索结果：</div>
                            {step.result.data.searchResults.slice(0, 5).map((r: any, j: number) => (
                              <div key={j} className="text-gray-600 pl-2">
                                <div className="text-blue-600">{typeof r === 'string' ? r.substring(0, 80) : r.title}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* 页面内容摘要 */}
                        {step.result.data?.content && !step.result.data?.searchResults && (
                          <div className="mt-1 text-gray-500 line-clamp-3 bg-white rounded p-1.5 border">
                            {step.result.data.content.substring(0, 300)}
                            {step.result.data.content.length > 300 && '...'}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 步骤失败 */}
                    {step.status === 'failed' && step.error && (
                      <div className="mt-1 ml-6 text-xs text-red-500">{step.error}</div>
                    )}

                    {/* 操作按钮：查看网页 */}
                    {stepUrl && step.status === 'completed' && (
                      <div className="mt-1 ml-6 flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); previewUrl === stepUrl ? closePreview() : openPreview(stepUrl); }}
                          className="text-xs text-blue-600 hover:text-blue-800 px-2 py-0.5 bg-blue-50 rounded border border-blue-200 hover:bg-blue-100"
                        >
                          {previewUrl === stepUrl ? '🔽 收起预览' : '🌐 查看网页'}
                        </button>
                        <a
                          href={stepUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-0.5 bg-gray-50 rounded border border-gray-200 hover:bg-gray-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          ↗ 新窗口打开
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {currentTask.status === 'pending_approval' && (
              <button
                onClick={(e) => { e.stopPropagation(); handleStart(); }}
                disabled={actionLoading}
                className="px-4 py-1.5 bg-gray-400 text-white text-sm rounded-lg hover:bg-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                {actionLoading ? (
                  <>
                    <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
                    启动中...
                  </>
                ) : (
                  <>
🚀 开始执行</>
                )}
              </button>
            )}
            {currentTask.status === 'running' && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); handlePause(); }}
                  disabled={actionLoading}
                  className="px-3 py-1.5 bg-gray-300 text-white text-sm rounded-lg hover:bg-gray-400 transition-colors disabled:opacity-50"
                >
                  {actionLoading ? '处理中...' : '⏸️ 暂停'}
                </button>
                {lastCompletedUrl && (
                  <button
                    onClick={(e) => { e.stopPropagation(); previewUrl ? closePreview() : openPreview(lastCompletedUrl); }}
                    className="px-3 py-1.5 bg-gray-300 text-white text-sm rounded-lg hover:bg-gray-400 transition-colors"
                  >
                    📸 实时画面
                  </button>
                )}
              </>
            )}
            {currentTask.status === 'paused' && (
              <button
                onClick={(e) => { e.stopPropagation(); handleResume(); }}
                disabled={actionLoading}
                className="px-4 py-1.5 bg-gray-400 text-white text-sm rounded-lg hover:bg-gray-500 transition-colors disabled:opacity-50"
              >
                {actionLoading ? '处理中...' : '▶️ 继续执行'}
              </button>
            )}
            {currentTask.status === 'waiting_human' && (
              <button
                onClick={(e) => { e.stopPropagation(); handleResume(); }}
                disabled={actionLoading}
                className="px-4 py-1.5 bg-gray-400 text-white text-sm rounded-lg hover:bg-gray-500 transition-colors disabled:opacity-50"
              >
                {actionLoading ? '处理中...' : '✅ 我已完成操作'}
              </button>
            )}
            {(currentTask.status === 'running' || currentTask.status === 'paused') && (
              <button
                onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                disabled={actionLoading}
                className="px-3 py-1.5 bg-gray-300 text-white text-sm rounded-lg hover:bg-gray-400 transition-colors disabled:opacity-50"
              >
                {actionLoading ? '处理中...' : '❌ 终止任务'}
              </button>
            )}
            {currentTask.status === 'completed' && lastCompletedUrl && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); previewUrl ? closePreview() : openPreview(lastCompletedUrl); }}
                  className="px-3 py-1.5 bg-gray-300 text-white text-sm rounded-lg hover:bg-gray-400 transition-colors"
                >
                  {previewUrl ? '🔽 收起预览' : '📸 查看结果页面'}
                </button>
                <a
                  href={lastCompletedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-gray-300 text-white text-sm rounded-lg hover:bg-gray-400 transition-colors inline-flex items-center"
                >
                  ↗ 新窗口打开
                </a>
              </>
            )}
            {currentTask.status === 'completed' && currentTask.result && !lastCompletedUrl && (
              <span className="text-sm text-green-700">{currentTask.result.summary}</span>
            )}
          </div>

          {/* 执行日志 */}
          {currentTask.logs.length > 0 && (
            <div className="text-xs text-gray-500 bg-white rounded p-2 max-h-40 overflow-y-auto border border-gray-100">
              {currentTask.logs.map((log, i) => (
                <div key={i} className={log.level === 'error' ? 'text-red-500' : log.level === 'success' ? 'text-green-600' : log.level === 'warn' ? 'text-yellow-500' : ''}>
                  [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
