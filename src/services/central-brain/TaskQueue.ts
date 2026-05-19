import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../lib/logger';
import { BlackBoard, globalBlackBoard } from './BlackBoard';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface Task {
  id: string;
  type: 'analysis' | 'response' | 'research' | 'synthesis';
  input: string;
  status: TaskStatus;
  result?: any;
  error?: string;
  assignedModel?: string;
  assignedSkills?: string[];
  priority: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  metadata?: Record<string, any>;
}

export interface TaskExecutionResult {
  taskId: string;
  status: 'success' | 'failed';
  output?: any;
  modelUsed?: string;
  duration?: number;
}

export class TaskQueue {
  private queue: Task[] = [];
  private maxQueueSize = 100;

  add(task: Omit<Task, 'id' | 'createdAt' | 'status'>): Task {
    const newTask: Task = {
      id: uuidv4(),
      status: 'pending',
      createdAt: Date.now(),
      ...task,
    };
    
    this.queue.push(newTask);
    
    // 按优先级排序
    this.queue.sort((a, b) => b.priority - a.priority);
    
    // 保持队列大小限制
    if (this.queue.length > this.maxQueueSize) {
      this.queue.pop();
    }
    
    logger.debug('TaskQueue', '添加任务', { taskId: newTask.id, type: newTask.type });
    return newTask;
  }

  getNext(): Task | null {
    const index = this.queue.findIndex(t => t.status === 'pending');
    if (index === -1) return null;
    
    const task = this.queue[index];
    task.status = 'in_progress';
    task.startedAt = Date.now();
    
    logger.debug('TaskQueue', '取出任务', { taskId: task.id });
    return task;
  }

  update(taskId: string, updates: Partial<Task>) {
    const index = this.queue.findIndex(t => t.id === taskId);
    if (index !== -1) {
      this.queue[index] = { ...this.queue[index], ...updates };
      logger.debug('TaskQueue', '更新任务', { taskId, updates });
    }
  }

  get(taskId: string): Task | undefined {
    return this.queue.find(t => t.id === taskId);
  }

  getByStatus(status: TaskStatus): Task[] {
    return this.queue.filter(t => t.status === status);
  }

  getAll(): Task[] {
    return [...this.queue];
  }

  remove(taskId: string) {
    const index = this.queue.findIndex(t => t.id === taskId);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }
  }

  clear() {
    this.queue = [];
  }
}

export const globalTaskQueue = new TaskQueue();
