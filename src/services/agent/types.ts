// Agent 核心类型定义

export type TaskStatus = 'planning' | 'pending_approval' | 'running' | 'paused' | 'waiting_human' | 'completed' | 'failed' | 'cancelled';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting_human';

export type RiskLevel = 'safe' | 'manual' | 'dangerous';

export interface AgentTask {
  id: string;
  userId: string;
  title: string;
  description: string;
  status: TaskStatus;
  plan: AgentStep[];
  currentStepIndex: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: TaskResult;
  screenshots: string[]; // base64 截图列表
  logs: AgentLog[];
  metadata: Record<string, any>;
}

export interface AgentStep {
  id: string;
  index: number;
  title: string;
  description: string;
  status: StepStatus;
  riskLevel: RiskLevel;
  toolName: string;
  toolParams: Record<string, any>;
  result?: any;
  screenshot?: string; // base64
  error?: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number; // 毫秒
}

export interface TaskResult {
  success: boolean;
  summary: string;
  data?: any;
  files?: string[]; // 生成的文件路径
  screenshots?: string[];
}

export interface AgentLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  stepId?: string;
  data?: any;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  riskLevel: RiskLevel;
  category: string;
  requiresApproval: boolean;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: any;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  screenshot?: string; // base64
  message?: string;
}

export interface SandboxConfig {
  allowedDomains: string[];
  blockedDomains: string[];
  maxExecutionTime: number; // 秒
  maxStepsPerTask: number;
  screenshotInterval: number; // 毫秒
  autoApproveSafe: boolean;
}

export interface EvolutionPattern {
  id: string;
  type: 'repeated_failure' | 'slow_step' | 'frequent_intervention' | 'page_change' | 'success_rate_drop' | 'success_pattern' | 'selector_tip';
  description: string;
  toolName: string;
  stepTitle: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  autoFix?: string;
  applied: boolean;
}

export interface EvolutionOptimization {
  id: string;
  patternId: string;
  description: string;
  toolName: string;
  oldBehavior: string;
  newBehavior: string;
  appliedAt: string;
  effectiveness: number; // 0-1
}

export interface AgentPerformance {
  totalTasks: number;
  successRate: number;
  avgDuration: number;
  trend: {
    date: string;
    successRate: number;
    avgDuration: number;
  }[];
}
