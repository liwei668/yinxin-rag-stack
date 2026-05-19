/**
 * 日志系统集成补丁
 * 
 * 将此代码集成到您现有的 src/lib/logger.ts 中
 * 在 error() 和 fatal() 方法中添加自动推送逻辑
 */

import { pushErrorToAdmin, PushErrorOptions } from './opsNotifier';

// ============================================================
// 在 Logger 类中添加以下方法
// ============================================================

/**
 * 在现有的 error() 方法末尾添加：
 */
async error(
  module: LogModule, 
  message: string, 
  data?: LogData
): Promise<void> {
  // ... 原有的日志记录逻辑 ...
  
  // ===== 新增：自动推送给管理员 =====
  try {
    await pushErrorToAdmin({
      type: 'ERROR',
      module,
      message,
      stack: data?.extra?.stack || data?.extra?.error,
      filePath: data?.extra?.file,
      lineNumber: data?.extra?.line,
      userId: data?.userId,
    });
  } catch (pushError) {
    // 推送失败不影响日志记录
    console.error('[Logger] 推送错误给管理员失败:', pushError);
  }
}

/**
 * 在现有的 fatal() 方法末尾添加：
 */
async fatal(
  module: LogModule, 
  message: string, 
  data?: LogData
): Promise<void> {
  // ... 原有的日志记录逻辑 ...
  
  // ===== 新增：自动推送给管理员 =====
  try {
    await pushErrorToAdmin({
      type: 'FATAL',
      module,
      message,
      stack: data?.extra?.stack || data?.extra?.error,
      filePath: data?.extra?.file,
      lineNumber: data?.extra?.line,
      userId: data?.userId,
    });
  } catch (pushError) {
    console.error('[Logger] 推送致命错误给管理员失败:', pushError);
  }
}

// ============================================================
// 或者使用装饰器模式包装现有 Logger
// ============================================================

/**
 * 创建一个带自动推送功能的 Logger 包装器
 */
export function createOpsEnabledLogger(originalLogger: any) {
  const originalError = originalLogger.error.bind(originalLogger);
  const originalFatal = originalLogger.fatal.bind(originalLogger);
  
  originalLogger.error = async function(
    module: string, 
    message: string, 
    data?: any
  ) {
    // 先记录日志
    await originalError(module, message, data);
    
    // 再推送给管理员
    try {
      await pushErrorToAdmin({
        type: 'ERROR',
        module,
        message,
        stack: data?.extra?.stack,
        filePath: data?.extra?.file,
        lineNumber: data?.extra?.line,
        userId: data?.userId,
      });
    } catch (e) {
      console.error('[OpsLogger] 推送失败:', e);
    }
  };
  
  originalLogger.fatal = async function(
    module: string, 
    message: string, 
    data?: any
  ) {
    // 先记录日志
    await originalFatal(module, message, data);
    
    // 再推送给管理员
    try {
      await pushErrorToAdmin({
        type: 'FATAL',
        module,
        message,
        stack: data?.extra?.stack,
        filePath: data?.extra?.file,
        lineNumber: data?.extra?.line,
        userId: data?.userId,
      });
    } catch (e) {
      console.error('[OpsLogger] 推送失败:', e);
    }
  };
  
  return originalLogger;
}

// ============================================================
// 使用示例
// ============================================================

/*
// 方式1：直接修改 logger.ts
import { logger } from '@/lib/logger';

// 错误会自动推送给管理员
logger.error('SYSTEM', '数据库连接失败', {
  extra: { error: 'Connection refused' }
});

// 方式2：使用包装器
import { logger } from '@/lib/logger';
import { createOpsEnabledLogger } from '@/lib/loggerOpsPatch';

const opsLogger = createOpsEnabledLogger(logger);
export { opsLogger as logger };
*/
