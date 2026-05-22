// 任务持久化存储
// 从 agentEngine.ts 拆分
import { AgentTask } from './types';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
export const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

export function saveTasksToFile(tasks: Map<string, AgentTask>): void {
  try {
    const serializable = Array.from(tasks.entries()).map(([id, task]) => ({
      ...task,
      screenshots: [], // 不保存截图到文件
    }));
    fs.writeFileSync(TASKS_FILE, JSON.stringify(serializable, null, 2));
  } catch (error: any) {
    console.error('[Agent] 保存任务失败:', error.message);
  }
}

export function loadTasksFromFile(tasks: Map<string, AgentTask>): void {
  try {
    if (fs.existsSync(TASKS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
      for (const task of data) {
        // 只恢复非活跃任务
        if (['completed', 'failed', 'cancelled'].includes(task.status)) {
          tasks.set(task.id, task);
        }
      }
      console.log(`[Agent] 已恢复 ${data.length} 个历史任务`);
    }
  } catch (error: any) {
    console.error('[Agent] 加载任务失败:', error.message);
  }
}
