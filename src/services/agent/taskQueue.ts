import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from '../../lib/redis';
import { logger } from '../../lib/logger';

// 任务数据接口
export interface TaskData {
  taskId: string;
  userId: string;
  title: string;
  description?: string;
  plan?: any[];
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

// 创建任务队列
export const agentTaskQueue = new Queue<TaskData>('agent-tasks', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,                    // 失败重试3次
    backoff: {
      type: 'exponential',          // 指数退避
      delay: 1000,                  // 初始延迟1秒
    },
    removeOnComplete: {
      age: 24 * 3600,               // 24小时后删除已完成任务
      count: 1000,                  // 保留最近1000个
    },
    removeOnFail: {
      age: 7 * 24 * 3600,           // 7天后删除失败任务
    },
  },
});

// 任务处理器类型
type TaskProcessor = (taskData: TaskData) => Promise<void>;

let taskProcessor: TaskProcessor | null = null;

// 创建任务处理器 Worker
export function createTaskWorker(processor: TaskProcessor): Worker<TaskData> {
  taskProcessor = processor;
  
  const worker = new Worker<TaskData>('agent-tasks', async (job: Job<TaskData>) => {
    const { taskId, userId, title } = job.data;
    logger.info('AGENT', `开始执行任务: ${taskId}`, { extra: { userId, title } });
    
    try {
      await processor(job.data);
      logger.info('AGENT', `任务执行完成: ${taskId}`);
    } catch (error: any) {
      logger.error('AGENT', `任务执行失败: ${taskId}`, { extra: { error: error.message } });
      throw error; // 抛出错误让 BullMQ 处理重试
    }
  }, {
    connection: redisConnection,
    concurrency: 5, // 同时处理5个任务
  });

  // Worker 事件监听
  worker.on('completed', (job) => {
    logger.info('AGENT', `任务已完成: ${job.data.taskId}`);
  });

  worker.on('failed', (job, err) => {
    logger.error('AGENT', `任务失败: ${job?.data.taskId}`, { extra: { error: err.message } });
  });

  worker.on('stalled', (jobId) => {
    logger.warn('AGENT', `任务停滞: ${jobId}`);
  });

  return worker;
}

// 添加任务到队列
export async function addTaskToQueue(taskData: TaskData): Promise<Job<TaskData>> {
  const job = await agentTaskQueue.add(
    `task-${taskData.taskId}`,
    taskData,
    {
      jobId: taskData.taskId, // 使用 taskId 作为 jobId，确保唯一性
    }
  );
  
  logger.info('AGENT', `任务已加入队列: ${taskData.taskId}`);
  return job;
}

// 获取任务状态
export async function getTaskJobStatus(taskId: string): Promise<string | null> {
  const job = await agentTaskQueue.getJob(taskId);
  if (!job) return null;
  
  const state = await job.getState();
  return state;
}

// 暂停任务
export async function pauseTaskJob(taskId: string): Promise<boolean> {
  const job = await agentTaskQueue.getJob(taskId);
  if (!job) return false;
  
  // BullMQ 没有直接暂停单个任务，可以通过自定义逻辑实现
  // 这里更新任务数据，标记为暂停
  await job.updateData({
    ...job.data,
    status: 'paused',
  });
  
  logger.info('AGENT', `任务已暂停: ${taskId}`);
  return true;
}

// 恢复任务（重新添加到队列）
export async function resumeTaskJob(taskData: TaskData): Promise<Job<TaskData>> {
  // 先移除旧的任务（如果存在）
  const oldJob = await agentTaskQueue.getJob(taskData.taskId);
  if (oldJob) {
    await oldJob.remove();
  }
  
  // 添加新任务
  return addTaskToQueue({
    ...taskData,
    status: 'pending',
    updatedAt: new Date().toISOString(),
  });
}

// 取消任务
export async function cancelTaskJob(taskId: string): Promise<boolean> {
  const job = await agentTaskQueue.getJob(taskId);
  if (!job) return false;
  
  await job.remove();
  logger.info('AGENT', `任务已取消: ${taskId}`);
  return true;
}

// 获取队列统计
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    agentTaskQueue.getWaitingCount(),
    agentTaskQueue.getActiveCount(),
    agentTaskQueue.getCompletedCount(),
    agentTaskQueue.getFailedCount(),
    agentTaskQueue.getDelayedCount(),
  ]);
  
  return { waiting, active, completed, failed, delayed };
}

// 清理旧任务
export async function cleanOldJobs(): Promise<void> {
  // 清理已完成的任务（保留24小时）
  await agentTaskQueue.clean(24 * 3600 * 1000, 1000, 'completed');
  
  // 清理失败的任务（保留7天）
  await agentTaskQueue.clean(7 * 24 * 3600 * 1000, 1000, 'failed');
  
  logger.info('AGENT', '旧任务清理完成');
}

// 优雅关闭队列
export async function closeTaskQueue(): Promise<void> {
  await agentTaskQueue.close();
  logger.info('AGENT', '任务队列已关闭');
}

console.log('[TaskQueue] BullMQ 任务队列初始化完成');
