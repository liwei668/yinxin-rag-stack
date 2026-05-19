/**
 * Agent 相关共享工具函数
 */

interface PlanStep {
  status?: string;
  result?: {
    data?: {
      url?: string;
      currentUrl?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  toolParams?: {
    url?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface TaskLike {
  plan?: PlanStep[];
  [key: string]: unknown;
}

/**
 * 从任务步骤中提取最后一个 URL
 */
export function extractLastUrl(task: { plan?: any[] }): string {
  if (!task.plan || task.plan.length === 0) return '';
  for (let i = task.plan.length - 1; i >= 0; i--) {
    const step = task.plan[i];
    if (step.status !== 'completed') continue;
    const url = step.result?.data?.url || step.result?.data?.currentUrl || step.toolParams?.url || '';
    if (url) return url;
  }
  return '';
}

/**
 * 从任务步骤中提取最后一个截图
 */
export function extractLastScreenshot(task: TaskLike): string | undefined {
  if (!task.plan || task.plan.length === 0) return undefined;
  for (let i = task.plan.length - 1; i >= 0; i--) {
    if ((task.plan[i] as any).screenshot) return (task.plan[i] as any).screenshot;
  }
  return undefined;
}
