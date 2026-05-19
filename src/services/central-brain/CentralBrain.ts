import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../lib/logger';
import { modelStore } from '../../lib/modelStore';
import { modelRouter } from '../model-router/routerEngine';
import { promptService } from '../prompt-service/PromptService';
import { promptCombiner } from '../skill-prompts/promptCombiner';
import { BlackBoard, BlackBoardData, globalBlackBoard } from './BlackBoard';
import { TaskQueue, Task, TaskExecutionResult, globalTaskQueue } from './TaskQueue';
import { MemorySystem } from '../memorySystem';

export interface BrainExecutionPlan {
  tasks: Task[];
  modelAssignments: Record<string, string>;
  skillAssignments: Record<string, string[]>;
}

export class CentralBrain {
  private blackboard: BlackBoard;
  private taskQueue: TaskQueue;
  private memory: MemorySystem;
  private isProcessing = false;

  constructor() {
    this.blackboard = globalBlackBoard;
    this.taskQueue = globalTaskQueue;
    this.memory = MemorySystem.getInstance();
    logger.info('CentralBrain', '中央大脑初始化完成');
  }

  // 主执行入口
  async execute(input: string, userId: string = 'default'): Promise<TaskExecutionResult> {
    const sessionId = uuidv4();
    
    logger.info('CentralBrain', '开始执行', { sessionId, input: input.substring(0, 100) });
    
    try {
      // 1. 写入输入到黑板
      this.writeToBlackboard('user_input', input, 'user', 'input');
      
      // 2. 规划执行策略
      const plan = await this.createExecutionPlan(input);
      logger.debug('CentralBrain', '执行计划', { plan });
      
      // 3. 写入计划到黑板
      this.writeToBlackboard('execution_plan', plan, 'brain', 'context');
      
      // 4. 提交任务到队列
      for (const task of plan.tasks) {
        this.taskQueue.add({
          type: task.type,
          input,
          priority: task.priority,
          assignedModel: plan.modelAssignments[task.id],
          assignedSkills: plan.skillAssignments[task.id],
          metadata: { sessionId },
        });
      }
      
      // 5. 执行任务链
      const finalResult = await this.processTaskChain(input, sessionId);
      
      return finalResult;
      
    } catch (error) {
      logger.error('CentralBrain', '执行失败', { error: String(error) });
      return {
        taskId: sessionId,
        status: 'failed',
        output: '处理失败，请稍后再试',
      };
    }
  }

  // 创建执行计划
  private async createExecutionPlan(input: string): Promise<BrainExecutionPlan> {
    const tasks: Task[] = [];
    const modelAssignments: Record<string, string> = {};
    const skillAssignments: Record<string, string[]> = {};
    
    // 使用路由引擎分析
    const routeResult = await modelRouter.selectModel({ text: input });
    const modelId = routeResult.modelId;
    
    // 基础任务 - 响应生成
    const responseTaskId = uuidv4();
    tasks.push({
      id: responseTaskId,
      type: 'response',
      input,
      status: 'pending',
      priority: 100,
      createdAt: Date.now(),
    });
    modelAssignments[responseTaskId] = modelId;
    
    // 路由匹配了技能组合
    if (routeResult.comboId) {
      const combo = promptCombiner.getCombinations().find(c => c.id === routeResult.comboId);
      if (combo) {
        skillAssignments[responseTaskId] = combo.skills;
      }
    }
    
    // 如果是复杂问题，添加分析任务
    const isComplex = this.isComplexQuery(input);
    if (isComplex) {
      const analysisTaskId = uuidv4();
      tasks.push({
        id: analysisTaskId,
        type: 'analysis',
        input,
        status: 'pending',
        priority: 90,
        createdAt: Date.now(),
      });
      // 复杂分析优先使用 pro 模型
      modelAssignments[analysisTaskId] = 'deepseek-v4-pro';
    }
    
    return {
      tasks,
      modelAssignments,
      skillAssignments,
    };
  }

  // 简单启发式判断复杂问题
  private isComplexQuery(input: string): boolean {
    const complexKeywords = ['分析', '计算', '预测', '规划', '综合', '评估', '财务'];
    return complexKeywords.some(keyword => input.includes(keyword));
  }

  // 处理任务链
  private async processTaskChain(input: string, sessionId: string): Promise<TaskExecutionResult> {
    // 获取任务并执行（简化版本，实际可并行）
    const pendingTasks = this.taskQueue.getByStatus('pending');
    
    let finalResult: TaskExecutionResult | null = null;
    
    for (const task of pendingTasks) {
      const result = await this.executeSingleTask(task, input);
      finalResult = result;
      
      // 写入结果到黑板
      if (result.status === 'success') {
        this.writeToBlackboard(`task_${task.id}_result`, result.output, 'model', 'model_output');
      }
    }
    
    // 没有任务时的降级
    if (!finalResult) {
      finalResult = await this.executeFallback(input);
    }
    
    return finalResult;
  }

  // 执行单个任务（占位，实际调用现有 callLLM 流程）
  private async executeSingleTask(task: Task, input: string): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    
    try {
      logger.debug('CentralBrain', `执行任务: ${task.type}`, { taskId: task.id, model: task.assignedModel });
      
      // 更新任务状态
      this.taskQueue.update(task.id, { status: 'in_progress', startedAt: Date.now() });
      
      // 获取提示词
      let systemPrompt = '';
      if (task.assignedSkills && task.assignedSkills.length > 0) {
        const combo = {
          id: 'temp',
          name: 'Temp Combo',
          description: 'Temporary combo',
          skills: task.assignedSkills,
          defaultModelId: task.assignedModel || 'deepseek-v4-flash',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        systemPrompt = await promptCombiner.combinePrompts(combo);
      }
      
      // 写入技能提示词到黑板
      if (systemPrompt) {
        this.writeToBlackboard('skills', systemPrompt, 'brain', 'skill');
      }
      
      // 写入记忆到黑板
      const recentMemories = await this.memory.getRecentInteractions(5);
      if (recentMemories.length > 0) {
        this.writeToBlackboard('memory', recentMemories, 'brain', 'memory');
      }
      
      // 更新任务状态为完成
      this.taskQueue.update(task.id, {
        status: 'completed',
        completedAt: Date.now(),
      });
      
      return {
        taskId: task.id,
        status: 'success',
        modelUsed: task.assignedModel,
        duration: Date.now() - startTime,
      };
      
    } catch (error) {
      this.taskQueue.update(task.id, {
        status: 'failed',
        error: String(error),
      });
      
      throw error;
    }
  }

  // 降级执行
  private async executeFallback(input: string): Promise<TaskExecutionResult> {
    return {
      taskId: uuidv4(),
      status: 'success',
      output: '请稍候，正在为您处理...',
      modelUsed: 'deepseek-v4-flash',
    };
  }

  private writeToBlackboard(key: string, content: any, source: string, type: BlackBoardData['type']) {
    this.blackboard.write(key, {
      id: uuidv4(),
      content,
      timestamp: Date.now(),
      source,
      type,
    });
  }

  getBlackboard(): BlackBoard {
    return this.blackboard;
  }

  getTaskQueue(): TaskQueue {
    return this.taskQueue;
  }
}

export const centralBrain = new CentralBrain();
