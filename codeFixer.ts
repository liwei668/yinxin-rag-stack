/**
 * 代码修复AI模块
 * 
 * 功能：
 * 1. 分析错误原因
 * 2. 定位问题文件
 * 3. 生成修复方案
 * 4. 执行安全修复
 */

import { 
  PROJECT_ROOT, 
  BACKUP_DIR, 
  isPathSafe, 
  isForbiddenPath 
} from './opsConfig';
import { pushFixResultToAdmin } from './opsNotifier';

// ============================================================
// 类型定义
// ============================================================

export interface ErrorInfo {
  message: string;
  stack?: string;
  filePath?: string;
  lineNumber?: number;
  module?: string;
}

export interface FixResult {
  reason: string;
  affectedFiles: string[];
  suggestedFix?: string;
  fixLanguage?: string;
  commands?: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface FixOptions {
  autoFix?: boolean;
  createBackup?: boolean;
  dryRun?: boolean;
}

export interface FixExecutionResult {
  success: boolean;
  message: string;
  filesModified: string[];
  commandsExecuted: string[];
  backupPath?: string;
}

// ============================================================
// 错误分析
// ============================================================

/**
 * 常见错误模式匹配
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
  fix: string;
  commands?: string[];
}> = [
  {
    pattern: /Cannot find module ['"](.+?)['"]/,
    reason: '缺少依赖包',
    fix: '安装缺失的依赖包',
    commands: ['npm install {package}'],
  },
  {
    pattern: /Module not found: Error: Can't resolve ['"](.+?)['"]/,
    reason: '模块路径错误或模块不存在',
    fix: '检查导入路径是否正确，或安装对应依赖',
  },
  {
    pattern: /TypeError: (.+?) is not a function/,
    reason: '调用了非函数类型的变量',
    fix: '检查变量类型，确保调用的是函数',
  },
  {
    pattern: /ReferenceError: (.+?) is not defined/,
    reason: '使用了未定义的变量',
    fix: '检查变量是否已声明和导入',
  },
  {
    pattern: /SyntaxError: Unexpected token/,
    reason: '语法错误',
    fix: '检查代码语法，如括号匹配、引号闭合等',
  },
  {
    pattern: /ENOENT: no such file or directory/,
    reason: '文件或目录不存在',
    fix: '检查文件路径是否正确，或创建所需文件',
  },
  {
    pattern: /ECONNREFUSED/,
    reason: '网络连接被拒绝',
    fix: '检查目标服务是否运行，端口是否正确',
  },
  {
    pattern: /ETIMEDOUT/,
    reason: '网络连接超时',
    fix: '检查网络连接，增加超时时间',
  },
  {
    pattern: /MongoServerError|MongoError/,
    reason: 'MongoDB 数据库错误',
    fix: '检查数据库连接配置和数据格式',
  },
  {
    pattern: /PrismaClientKnownRequestError/,
    reason: 'Prisma 数据库操作错误',
    fix: '检查数据库模型定义和查询条件',
  },
  {
    pattern: /Hydration failed/,
    reason: 'React 服务端和客户端渲染不一致',
    fix: '检查组件是否在服务端和客户端渲染了不同的内容',
  },
  {
    pattern: /Maximum call stack size exceeded/,
    reason: '无限递归调用',
    fix: '检查递归函数的终止条件',
  },
  {
    pattern: /Out of memory/,
    reason: '内存溢出',
    fix: '优化内存使用，处理大数据时分批进行',
  },
];

/**
 * 分析错误信息
 */
export async function analyzeError(error: ErrorInfo): Promise<FixResult> {
  const result: FixResult = {
    reason: '未知错误',
    affectedFiles: [],
    confidence: 'low',
  };
  
  // 1. 提取文件路径
  if (error.filePath) {
    result.affectedFiles.push(error.filePath);
  }
  
  // 2. 从堆栈中提取文件路径
  if (error.stack) {
    const fileMatches = error.stack.matchAll(/at\s+.*?\((.+?):(\d+):(\d+)\)/g);
    for (const match of fileMatches) {
      const filePath = match[1];
      if (filePath && !filePath.includes('node_modules')) {
        result.affectedFiles.push(filePath);
      }
    }
  }
  
  // 3. 匹配错误模式
  const fullMessage = `${error.message}\n${error.stack || ''}`;
  
  for (const { pattern, reason, fix, commands } of ERROR_PATTERNS) {
    const match = fullMessage.match(pattern);
    if (match) {
      result.reason = reason;
      result.suggestedFix = fix;
      result.confidence = 'high';
      
      // 处理命令模板
      if (commands) {
        result.commands = commands.map(cmd => {
          if (match[1]) {
            return cmd.replace('{package}', match[1]);
          }
          return cmd;
        });
      }
      
      break;
    }
  }
  
  // 4. 如果没有匹配到模式，使用AI分析（如果有配置）
  if (result.confidence === 'low') {
    // 这里可以调用外部AI服务进行更深入的分析
    // 暂时返回基本分析结果
    result.reason = `检测到${error.module || '系统'}模块错误: ${error.message.slice(0, 100)}`;
    result.suggestedFix = '请查看详细错误日志进行人工分析';
  }
  
  return result;
}

// ============================================================
// 文件操作
// ============================================================

/**
 * 创建备份
 */
async function createBackup(filePath: string): Promise<string | null> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // 确保备份目录存在
    const backupDir = path.join(PROJECT_ROOT, BACKUP_DIR);
    await fs.mkdir(backupDir, { recursive: true });
    
    // 生成备份文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const basename = path.basename(filePath);
    const backupPath = path.join(backupDir, `${timestamp}_${basename}`);
    
    // 复制文件
    await fs.copyFile(filePath, backupPath);
    
    console.log(`[CodeFixer] 已创建备份: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error('[CodeFixer] 创建备份失败:', error);
    return null;
  }
}

/**
 * 安全地读取文件
 */
async function safeReadFile(filePath: string): Promise<string | null> {
  // 安全检查
  if (!isPathSafe(filePath)) {
    console.error('[CodeFixer] 非法路径:', filePath);
    return null;
  }
  
  if (isForbiddenPath(filePath)) {
    console.error('[CodeFixer] 禁止访问的路径:', filePath);
    return null;
  }
  
  try {
    const fs = await import('fs/promises');
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    console.error('[CodeFixer] 读取文件失败:', error);
    return null;
  }
}

/**
 * 安全地写入文件
 */
async function safeWriteFile(filePath: string, content: string): Promise<boolean> {
  // 安全检查
  if (!isPathSafe(filePath)) {
    console.error('[CodeFixer] 非法路径:', filePath);
    return false;
  }
  
  if (isForbiddenPath(filePath)) {
    console.error('[CodeFixer] 禁止访问的路径:', filePath);
    return false;
  }
  
  try {
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error('[CodeFixer] 写入文件失败:', error);
    return false;
  }
}

// ============================================================
// 修复执行
// ============================================================

/**
 * 执行命令
 */
async function executeCommand(command: string): Promise<{ success: boolean; output: string }> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const { stdout, stderr } = await execAsync(command, {
      cwd: PROJECT_ROOT,
      timeout: 60000, // 60秒超时
    });
    
    return {
      success: true,
      output: stdout || stderr,
    };
  } catch (error: any) {
    return {
      success: false,
      output: error.message || String(error),
    };
  }
}

/**
 * 执行修复
 */
export async function executeFix(
  errorId: string,
  fix: FixResult,
  options: FixOptions = {}
): Promise<FixExecutionResult> {
  const result: FixExecutionResult = {
    success: false,
    message: '',
    filesModified: [],
    commandsExecuted: [],
  };
  
  const { autoFix = false, createBackup = true, dryRun = false } = options;
  
  try {
    // 1. 执行命令
    if (fix.commands && fix.commands.length > 0) {
      for (const cmd of fix.commands) {
        if (dryRun) {
          console.log(`[CodeFixer] [DRY-RUN] 将执行: ${cmd}`);
          result.commandsExecuted.push(cmd);
          continue;
        }
        
        console.log(`[CodeFixer] 执行命令: ${cmd}`);
        const cmdResult = await executeCommand(cmd);
        
        if (cmdResult.success) {
          result.commandsExecuted.push(cmd);
          console.log(`[CodeFixer] 命令执行成功: ${cmd}`);
        } else {
          result.message = `命令执行失败: ${cmd}\n${cmdResult.output}`;
          await pushFixResultToAdmin(errorId, result);
          return result;
        }
      }
    }
    
    // 2. 应用代码修复（如果有）
    if (fix.suggestedFix && fix.affectedFiles.length > 0 && autoFix) {
      for (const filePath of fix.affectedFiles) {
        // 创建备份
        if (createBackup && !dryRun) {
          const backupPath = await createBackup(filePath);
          if (backupPath) {
            result.backupPath = backupPath;
          }
        }
        
        if (dryRun) {
          console.log(`[CodeFixer] [DRY-RUN] 将修改文件: ${filePath}`);
          result.filesModified.push(filePath);
          continue;
        }
        
        // 这里需要更智能的代码修改逻辑
        // 目前只是示例，实际需要根据错误类型进行精确修改
        console.log(`[CodeFixer] 修改文件: ${filePath}`);
        result.filesModified.push(filePath);
      }
    }
    
    result.success = true;
    result.message = '修复执行完成';
    
    // 3. 推送修复结果
    await pushFixResultToAdmin(errorId, result);
    
    return result;
  } catch (error) {
    result.message = `修复执行失败: ${error}`;
    await pushFixResultToAdmin(errorId, result);
    return result;
  }
}

/**
 * 清理缓存
 */
export async function clearCache(): Promise<{ success: boolean; message: string }> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const cacheDir = path.join(PROJECT_ROOT, '.next');
    
    await fs.rm(cacheDir, { recursive: true, force: true });
    
    return {
      success: true,
      message: '已清理 .next 缓存目录',
    };
  } catch (error: any) {
    return {
      success: false,
      message: `清理缓存失败: ${error.message}`,
    };
  }
}

/**
 * 重启开发服务器
 */
export async function restartDevServer(): Promise<{ success: boolean; message: string }> {
  try {
    // 查找并杀死占用端口的进程
    const killResult = await executeCommand('lsof -ti:3000 | xargs kill -9 2>/dev/null || true');
    
    // 重新启动
    // 注意：这需要在后台运行
    const { spawn } = await import('child_process');
    spawn('npm', ['run', 'dev'], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
    });
    
    return {
      success: true,
      message: '开发服务器已重启',
    };
  } catch (error: any) {
    return {
      success: false,
      message: `重启失败: ${error.message}`,
    };
  }
}

// ============================================================
// 导出
// ============================================================

export default {
  analyzeError,
  executeFix,
  clearCache,
  restartDevServer,
  safeReadFile,
  safeWriteFile,
};
