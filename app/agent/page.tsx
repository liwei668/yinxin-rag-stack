'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { extractLastUrl } from '../../src/utils/agentUtils';
import { AgentTask } from '../../src/services/agent/types';
import AgentControlPanel from '../../src/components/agent/AgentControlPanel';
import WorkspacePanel from '../../src/components/agent/WorkspacePanel';

const statusLabels: Record<string, string> = {
  planning: '规划中',
  pending_approval: '待确认',
  running: '执行中',
  paused: '已暂停',
  waiting_human: '等待操作',
  completed: '已完成',
  failed: '已失败',
  cancelled: '已取消',
};

const statusColors: Record<string, string> = {
  planning: 'bg-yellow-500',
  pending_approval: 'bg-blue-500',
  running: 'bg-green-500 animate-pulse',
  paused: 'bg-yellow-500',
  waiting_human: 'bg-orange-500 animate-pulse',
  completed: 'bg-green-600',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-500',
};

export default function AgentPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center bg-gray-100"><div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>}>
      <AgentPageContent />
    </Suspense>
  );
}

function AgentPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentTask, setCurrentTask] = useState<AgentTask | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isManualMode, setIsManualMode] = useState(true); // 默认手动模式

  const handleUpdateTask = useCallback((task: AgentTask | null) => {
    setCurrentTask(task);
  }, []);

  const handleUrlChange = useCallback((url: string) => {
    setCurrentUrl(url);
  }, []);

  // 从 URL 参数加载任务
  useEffect(() => {
    const taskId = searchParams.get('task');
    if (taskId) {
      setLoading(true);
      fetch(`/api/agent?action=task&taskId=${taskId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.task) {
            setCurrentTask(data.task);
            const lastUrl = extractLastUrl(data.task);
            if (lastUrl) setCurrentUrl(lastUrl);
          }
        })
        .catch(err => {
          console.error('[AgentPage] 加载任务失败:', err);
        })
        .finally(() => setLoading(false));
    }
  }, [searchParams]);

  // 监听任务更新，自动提取 URL 和截图
  useEffect(() => {
    if (!currentTask) return;
    const url = extractLastUrl(currentTask);
    if (url && url !== currentUrl) {
      setCurrentUrl(url);
    }
  }, [currentTask]);

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回首页
          </button>
          <div className="w-px h-5 bg-gray-300" />
          <h1 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Agent 控制台
            <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded">真实浏览器</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {loading && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              加载中...
            </span>
          )}
          {currentTask && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 truncate max-w-[200px]">
                {currentTask.title}
              </span>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${statusColors[currentTask.status] || 'bg-gray-400'}`} />
                <span className="text-xs text-gray-600">
                  {statusLabels[currentTask.status] || currentTask.status}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 主内容区：左右分栏 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧控制面板 */}
        <div className="w-[380px] flex-shrink-0 border-r border-gray-200 overflow-hidden">
          <AgentControlPanel
            task={currentTask}
            onUpdateTask={handleUpdateTask}
            onUrlChange={handleUrlChange}
            isManualMode={isManualMode}
            onManualModeChange={setIsManualMode}
          />
        </div>

        {/* 右侧浏览器工作区 */}
        <div className="flex-1 overflow-hidden">
          <WorkspacePanel
            taskId={currentTask?.id || null}
            currentUrl={currentUrl}
            onUrlChange={handleUrlChange}
            onClose={() => {}}
          />
        </div>
      </div>
    </div>
  );
}


