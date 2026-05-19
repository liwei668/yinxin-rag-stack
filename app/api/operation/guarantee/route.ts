import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../src/lib/logger';
import operationGuarantee, {
  OperationGuaranteeConfig,
  CleanupLog,
  ThresholdAdjustment,
  AnomalyRecord,
  ConflictRecord
} from '../../../../src/services/operationGuarantee';

// 获取运维配置
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'config':
        // 获取配置
        const config = operationGuarantee.getConfig();
        return NextResponse.json({ success: true, data: config });

      case 'cleanupLogs':
        // 获取清理日志
        const cleanupLogs = operationGuarantee.getCleanupLogs();
        return NextResponse.json({ success: true, data: cleanupLogs });

      case 'thresholdAdjustments':
        // 获取阈值调整记录
        const thresholdAdjustments = operationGuarantee.getThresholdAdjustments();
        return NextResponse.json({ success: true, data: thresholdAdjustments });

      case 'anomalyRecords':
        // 获取异常记录
        const anomalyRecords = operationGuarantee.getAnomalyRecords();
        return NextResponse.json({ success: true, data: anomalyRecords });

      case 'conflictRecords':
        // 获取冲突记录
        const conflictRecords = operationGuarantee.getConflictRecords();
        return NextResponse.json({ success: true, data: conflictRecords });

      default:
        // 获取所有运维信息
        const allData = {
          config: operationGuarantee.getConfig(),
          cleanupLogs: operationGuarantee.getCleanupLogs(),
          thresholdAdjustments: operationGuarantee.getThresholdAdjustments(),
          anomalyRecords: operationGuarantee.getAnomalyRecords(),
          conflictRecords: operationGuarantee.getConflictRecords()
        };
        return NextResponse.json({ success: true, data: allData });
    }
  } catch (error) {
    logger.error('SYSTEM', 'Error in operation guarantee GET', { extra: { error: String(error) } });
    return NextResponse.json(
      { success: false, error: 'Failed to get operation guarantee data' },
      { status: 500 }
    );
  }
}

// 更新配置或执行操作
export async function POST(request: NextRequest) {
  try {
    const { action, config } = await request.json();

    switch (action) {
      case 'updateConfig':
        // 更新配置
        if (config) {
          operationGuarantee.updateConfig(config as Partial<OperationGuaranteeConfig>);
          return NextResponse.json({ 
            success: true, 
            message: 'Configuration updated successfully',
            data: operationGuarantee.getConfig()
          });
        }
        return NextResponse.json(
          { success: false, error: 'Config is required' },
          { status: 400 }
        );

      case 'startCleanup':
        // 启动自动清理
        operationGuarantee.startAutoCleanup();
        return NextResponse.json({ 
          success: true, 
          message: 'Auto cleanup started successfully' 
        });

      case 'stopCleanup':
        // 停止自动清理
        operationGuarantee.stopAutoCleanup();
        return NextResponse.json({ 
          success: true, 
          message: 'Auto cleanup stopped successfully' 
        });

      case 'performCleanup':
        // 立即执行清理
        const cleanupLog = await operationGuarantee.performCleanup();
        return NextResponse.json({ 
          success: true, 
          message: 'Cleanup performed successfully',
          data: cleanupLog
        });

      case 'monitorThresholds':
        // 监测并微调阈值
        await operationGuarantee.monitorAndAdjustThresholds();
        return NextResponse.json({ 
          success: true, 
          message: 'Threshold monitoring completed',
          data: operationGuarantee.getThresholdAdjustments()
        });

      case 'fullValidation':
        // 执行全面校验
        const validationResult = await operationGuarantee.performFullValidation();
        return NextResponse.json({ 
          success: true, 
          message: 'Full validation completed',
          data: { passed: validationResult }
        });

      case 'validateMemoryPriority':
        // 校验记忆优先级
        const priorityResult = await operationGuarantee.validateMemoryPriority();
        return NextResponse.json({ 
          success: true, 
          message: 'Memory priority validation completed',
          data: { valid: priorityResult }
        });

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error('SYSTEM', 'Error in operation guarantee POST', { extra: { error: String(error) } });
    return NextResponse.json(
      { success: false, error: 'Failed to perform operation guarantee action' },
      { status: 500 }
    );
  }
}
