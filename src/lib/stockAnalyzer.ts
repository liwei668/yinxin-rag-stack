/**
 * 股票分析核心算法
 * 功能：位置判定、支撑压力计算、月度驱动匹配、技术形态识别
 */

import { KLineData, StockQuote } from './stockData';

// ==================== 类型定义 ====================

export type PositionLevel = '低位' | '中位' | '高位';
export type TrendDirection = '多头排列' | '空头排列' | '震荡整理';
export type MonthTrend = '偏强' | '震荡' | '偏弱';

export interface StockAnalysis {
  // 基本信息
  code: string;
  name: string;
  price: number;
  
  // 位置判定
  position: PositionLevel;
  percentile: number;        // 0-100
  
  // 技术形态
  trend: TrendDirection;
  
  // 支撑压力
  supportLow: number;
  supportHigh: number;
  resistanceLow: number;
  resistanceHigh: number;
  
  // 当月周期
  month: number;
  monthTip: string;
  monthTrend: MonthTrend;
  
  // 原始数据（用于AI分析）
  klineData: KLineData[];
  quote: StockQuote;
}

// ==================== 月度驱动配置 ====================

const MONTH_CONFIG: Record<number, { tip: string; trend: MonthTrend; factors: string }> = {
  1: {
    tip: '春季躁动启动，流动性宽松',
    trend: '偏强',
    factors: '年初资金宽松、春节消费提前备货、机构布局明年主线',
  },
  2: {
    tip: '消费驱动，走势偏强',
    trend: '偏强',
    factors: '春节消费旺季、资金回流股市、年报预告披露',
  },
  3: {
    tip: '政策驱动，板块分化',
    trend: '震荡',
    factors: '两会政策落地、季末资金收紧、机构季度调仓',
  },
  4: {
    tip: '财报驱动，波动加大',
    trend: '震荡',
    factors: '年报+一季报集中披露、业绩分化明显',
  },
  5: {
    tip: '震荡整理，无明显趋势',
    trend: '震荡',
    factors: '五一消费旺季、业绩真空期、资金平稳',
  },
  6: {
    tip: '消费驱动，局部走强',
    trend: '偏强',
    factors: '618电商消费、季末资金结算、流动性偏紧',
  },
  7: {
    tip: '业绩分化，走势分化',
    trend: '震荡',
    factors: '中报披露启动、暑期消费升温、资金回流',
  },
  8: {
    tip: '震荡为主，无明显趋势',
    trend: '震荡',
    factors: '中报披露尾声、市场震荡、机构调仓',
  },
  9: {
    tip: '消费预期升温，局部走强',
    trend: '偏强',
    factors: '中秋备货、季末资金结算、流动性收紧',
  },
  10: {
    tip: '数据验证期，波动加大',
    trend: '震荡',
    factors: '国庆消费数据落地、三季报开启',
  },
  11: {
    tip: '消费驱动，板块轮动',
    trend: '偏强',
    factors: '双11电商消费、年末资金布局明年主线',
  },
  12: {
    tip: '核心蓝筹抗跌，小票承压',
    trend: '偏弱',
    factors: '机构年度排名、企业年末结算、春节备货',
  },
};

// ==================== 核心算法 ====================

/**
 * 分析股票
 */
export function analyzeStock(
  code: string,
  name: string,
  quote: StockQuote,
  klines: KLineData[]
): StockAnalysis {
  // 1. 计算位置百分位
  const { position, percentile } = calculatePosition(quote.price, klines);
  
  // 2. 判断技术形态
  const trend = calculateTrend(klines);
  
  // 3. 计算支撑压力位
  const { supportLow, supportHigh, resistanceLow, resistanceHigh } = calculateSupportResistance(klines);
  
  // 4. 获取当月周期
  const month = new Date().getMonth() + 1;
  const monthConfig = MONTH_CONFIG[month] || MONTH_CONFIG[1];
  
  return {
    code,
    name,
    price: quote.price,
    position,
    percentile,
    trend,
    supportLow,
    supportHigh,
    resistanceLow,
    resistanceHigh,
    month,
    monthTip: monthConfig.tip,
    monthTrend: monthConfig.trend,
    klineData: klines,
    quote,
  };
}

/**
 * 计算价格位置（基于近120日百分位）
 */
function calculatePosition(
  currentPrice: number,
  klines: KLineData[]
): { position: PositionLevel; percentile: number } {
  // 过滤有效数据
  const validKlines = klines.filter(k => k.high > 0 && k.low > 0);
  
  if (validKlines.length === 0 || currentPrice <= 0) {
    return { position: '中位', percentile: 50 };
  }
  
  // 找出区间最高价和最低价
  let highestPrice = 0;
  let lowestPrice = Infinity;
  
  for (const k of validKlines) {
    if (k.high > highestPrice) highestPrice = k.high;
    if (k.low < lowestPrice) lowestPrice = k.low;
  }
  
  // 边界检查
  if (highestPrice <= 0 || lowestPrice <= 0 || highestPrice <= lowestPrice) {
    return { position: '中位', percentile: 50 };
  }
  
  // 计算百分位，限制在 0-100 范围内
  const range = highestPrice - lowestPrice;
  let percentile = Math.round(((currentPrice - lowestPrice) / range) * 100);
  
  // 限制百分位在 0-100 范围
  percentile = Math.max(0, Math.min(100, percentile));
  
  // 判定位置
  let position: PositionLevel;
  if (percentile <= 30) {
    position = '低位';
  } else if (percentile <= 70) {
    position = '中位';
  } else {
    position = '高位';
  }
  
  return { position, percentile };
}

/**
 * 判断技术形态（基于均线）
 */
function calculateTrend(klines: KLineData[]): TrendDirection {
  if (klines.length < 20) {
    return '震荡整理';
  }
  
  // 计算5日、10日、20日均线
  const ma5 = calculateMA(klines, 5);
  const ma10 = calculateMA(klines, 10);
  const ma20 = calculateMA(klines, 20);
  
  if (ma5 === 0 || ma10 === 0 || ma20 === 0) {
    return '震荡整理';
  }
  
  // 判断均线排列
  const currentPrice = klines[klines.length - 1].close;
  
  // 多头排列：价格 > MA5 > MA10 > MA20
  if (currentPrice > ma5 && ma5 > ma10 && ma10 > ma20) {
    return '多头排列';
  }
  
  // 空头排列：价格 < MA5 < MA10 < MA20
  if (currentPrice < ma5 && ma5 < ma10 && ma10 < ma20) {
    return '空头排列';
  }
  
  return '震荡整理';
}

/**
 * 计算均线
 */
function calculateMA(klines: KLineData[], period: number): number {
  if (klines.length < period) return 0;
  
  const recentKlines = klines.slice(-period);
  const sum = recentKlines.reduce((acc, k) => acc + k.close, 0);
  return sum / period;
}

/**
 * 计算支撑位和压力位
 */
function calculateSupportResistance(klines: KLineData[]): {
  supportLow: number;
  supportHigh: number;
  resistanceLow: number;
  resistanceHigh: number;
} {
  if (klines.length < 10) {
    return {
      supportLow: 0,
      supportHigh: 0,
      resistanceLow: 0,
      resistanceHigh: 0,
    };
  }
  
  // 取近30日数据
  const recentKlines = klines.slice(-30);
  const currentPrice = klines[klines.length - 1].close;
  
  // 找出近期的低点（作为支撑）
  const lows = recentKlines.map(k => k.low).sort((a, b) => a - b);
  const supportLow = lows[0];
  const supportHigh = lows[Math.floor(lows.length * 0.3)];
  
  // 找出近期的高点（作为压力）
  const highs = recentKlines.map(k => k.high).sort((a, b) => b - a);
  const resistanceLow = highs[Math.floor(highs.length * 0.3)];
  const resistanceHigh = highs[0];
  
  return {
    supportLow: Math.round(supportLow * 100) / 100,
    supportHigh: Math.round(supportHigh * 100) / 100,
    resistanceLow: Math.round(resistanceLow * 100) / 100,
    resistanceHigh: Math.round(resistanceHigh * 100) / 100,
  };
}

// ==================== AI 提示词生成 ====================

/**
 * 生成AI分析提示词
 */
export function generateAIPrompt(analysis: StockAnalysis): string {
  const monthConfig = MONTH_CONFIG[analysis.month];
  
  return `你是一个股票数据分析助手，请严格按照以下要求输出分析结果。

【股票信息】
- 股票名称：${analysis.name}
- 股票代码：${analysis.code}
- 当前价格：${analysis.price} 元
- 价格位置：${analysis.position}（近120日百分位：${analysis.percentile}%）
- 技术形态：${analysis.trend}
- 支撑区间：${analysis.supportLow} - ${analysis.supportHigh} 元
- 压力区间：${analysis.resistanceLow} - ${analysis.resistanceHigh} 元

【当月市场周期】
- 当前月份：${analysis.month}月
- 周期特征：${analysis.monthTip}
- 核心驱动因素：${monthConfig.factors}

【输出要求】
1. 仅基于以上数据进行客观描述，不预测涨跌
2. 用大白话解释当前技术特征和价格位置的含义
3. 说明当月市场周期对这只股票可能的影响
4. 全程不使用"建议"、"应该"、"可以"等建议性词汇
5. 不预测具体涨跌幅度和方向
6. 输出一段完整的文字，约150字，不分点
7. 结尾必须加上："以上仅为数据解读，不构成任何投资建议。"

请开始输出：`;
}
