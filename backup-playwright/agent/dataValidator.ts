// 金融数据准确性校验模块
// 在 Agent 通过 browser_read 读取页面内容后，AI 返回 complete 之前对提取数据进行校验

// ========== 类型定义 ==========

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitized: any; // 校验后的数据
}

export interface DataProvenance {
  source: string;      // 来源URL
  timestamp: string;   // 采集时间
  rawText: string;     // 原始文本
  extractedValue: any; // 提取的值
  confidence: number;  // 置信度 0-1
}

// ========== 金融数据类型枚举 ==========

type FinancialDataType =
  | 'stock_price'      // 股价/指数
  | 'change_rate'      // 涨跌幅
  | 'amount'           // 金额
  | 'tax_id'           // 税号
  | 'date'             // 日期
  | 'percentage'       // 百分比
  | 'id_card';         // 身份证号

// ========== 数据类型识别正则 ==========

const FINANCIAL_PATTERNS: { type: FinancialDataType; patterns: RegExp[]; label: string }[] = [
  {
    type: 'stock_price',
    label: '股价/指数',
    patterns: [
      /股价[：:\s]*(\d+\.?\d*)/g,
      /指数[点：:\s]*(\d+\.?\d*)/g,
      /收盘[价：:\s]*(\d+\.?\d*)/g,
      /开盘[价：:\s]*(\d+\.?\d*)/g,
      /最新[价：:\s]*(\d+\.?\d*)/g,
      /现价[：:\s]*(\d+\.?\d*)/g,
      /(\d{1,3}(?:,\d{3})*\.\d{2})\s*(?:元|点)/g,
    ],
  },
  {
    type: 'change_rate',
    label: '涨跌幅',
    patterns: [
      /涨跌[幅：:\s]*([+-]?\d+\.?\d*)\s*%/g,
      /涨幅[：:\s]*([+-]?\d+\.?\d*)\s*%/g,
      /跌幅[：:\s]*([+-]?\d+\.?\d*)\s*%/g,
      /([+-]?\d+\.?\d*)\s*%/g,
    ],
  },
  {
    type: 'amount',
    label: '金额',
    patterns: [
      /(\d+\.?\d*)\s*(?:万元|亿元|元|美元|欧元|日元|港币|人民币)/g,
      /金额[：:\s]*(\d+\.?\d*)/g,
      /总资产[：:\s]*(\d+\.?\d*)/g,
      /营收[：:\s]*(\d+\.?\d*)/g,
      /利润[：:\s]*(\d+\.?\d*)/g,
      /收入[：:\s]*(\d+\.?\d*)/g,
    ],
  },
  {
    type: 'tax_id',
    label: '税号',
    patterns: [
      /[0-9A-Z]{18}/g,
      /[0-9A-Z]{15}/g,
      /统一社会信用代码[：:\s]*([0-9A-Z]{18})/g,
      /纳税人识别号[：:\s]*([0-9A-Z]{15,18})/g,
    ],
  },
  {
    type: 'date',
    label: '日期',
    patterns: [
      /\d{4}[-/]\d{1,2}[-/]\d{1,2}/g,
      /\d{4}年\d{1,2}月\d{1,2}日/g,
      /\d{8}(?!\d)/g,
    ],
  },
  {
    type: 'percentage',
    label: '百分比',
    patterns: [
      /占比[：:\s]*(\d+\.?\d*)\s*%/g,
      /比例[：:\s]*(\d+\.?\d*)\s*%/g,
      /(\d+\.?\d*)\s*%/g,
    ],
  },
  {
    type: 'id_card',
    label: '身份证号',
    patterns: [
      /[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g,
    ],
  },
];

// ========== 校验规则 ==========

interface ValidationRule {
  type: FinancialDataType;
  label: string;
  validate: (value: string) => { valid: boolean; error?: string; warning?: string; sanitized: any };
}

const VALIDATION_RULES: ValidationRule[] = [
  {
    type: 'stock_price',
    label: '股价/指数',
    validate(value: string) {
      // 去除千分位逗号
      const cleaned = value.replace(/,/g, '');
      const num = Number(cleaned);
      if (isNaN(num)) {
        return { valid: false, error: `股价/指数 "${value}" 不是有效数字`, sanitized: null };
      }
      if (num < 0 || num > 100000) {
        return { valid: false, error: `股价/指数 ${num} 超出合理范围 (0-100000)`, sanitized: null };
      }
      // 检查小数位数
      const decimalPart = cleaned.split('.')[1];
      if (decimalPart && decimalPart.length > 2) {
        return {
          valid: true,
          warning: `股价/指数 ${value} 小数位数超过2位，已截断`,
          sanitized: Math.round(num * 100) / 100,
        };
      }
      return { valid: true, sanitized: num };
    },
  },
  {
    type: 'change_rate',
    label: '涨跌幅',
    validate(value: string) {
      const cleaned = value.replace(/[+%]/g, '').trim();
      const num = Number(cleaned);
      if (isNaN(num)) {
        return { valid: false, error: `涨跌幅 "${value}" 不是有效数字`, sanitized: null };
      }
      if (num < -30 || num > 30) {
        return {
          valid: true,
          warning: `涨跌幅 ${num}% 超出常规范围 (-30% ~ +30%)，请确认数据准确性`,
          sanitized: num,
        };
      }
      return { valid: true, sanitized: num };
    },
  },
  {
    type: 'amount',
    label: '金额',
    validate(value: string) {
      const cleaned = value.replace(/,/g, '');
      const num = Number(cleaned);
      if (isNaN(num)) {
        return { valid: false, error: `金额 "${value}" 不是有效数字`, sanitized: null };
      }
      if (num < 0) {
        return { valid: false, error: `金额不能为负数: ${value}`, sanitized: null };
      }
      return { valid: true, sanitized: num };
    },
  },
  {
    type: 'tax_id',
    label: '税号',
    validate(value: string) {
      const cleaned = value.replace(/[^0-9A-Z]/gi, '').toUpperCase();
      if (cleaned.length === 18) {
        // 统一社会信用代码校验（基本格式）
        if (!/^[0-9A-Z]{18}$/.test(cleaned)) {
          return { valid: false, error: `统一社会信用代码 "${value}" 格式不正确`, sanitized: null };
        }
        return { valid: true, sanitized: cleaned };
      }
      if (cleaned.length === 15) {
        // 旧税号校验
        if (!/^[0-9A-Z]{15}$/.test(cleaned)) {
          return { valid: false, error: `税号 "${value}" 格式不正确`, sanitized: null };
        }
        return { valid: true, sanitized: cleaned };
      }
      return { valid: false, error: `税号 "${value}" 长度不正确（应为15位或18位，当前${cleaned.length}位）`, sanitized: null };
    },
  },
  {
    type: 'date',
    label: '日期',
    validate(value: string) {
      // 尝试多种日期格式解析
      let date: Date | null = null;

      // YYYY-MM-DD 或 YYYY/MM/DD
      const dashMatch = value.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (dashMatch) {
        date = new Date(Number(dashMatch[1]), Number(dashMatch[2]) - 1, Number(dashMatch[3]));
      }

      // YYYYMMDD
      if (!date || isNaN(date.getTime())) {
        const compactMatch = value.match(/(\d{4})(\d{2})(\d{2})/);
        if (compactMatch) {
          date = new Date(Number(compactMatch[1]), Number(compactMatch[2]) - 1, Number(compactMatch[3]));
        }
      }

      // YYYY年MM月DD日
      if (!date || isNaN(date.getTime())) {
        const cnMatch = value.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (cnMatch) {
          date = new Date(Number(cnMatch[1]), Number(cnMatch[2]) - 1, Number(cnMatch[3]));
        }
      }

      if (!date || isNaN(date.getTime())) {
        return { valid: false, error: `日期 "${value}" 格式不合法`, sanitized: null };
      }

      // 验证日期合理性（年份 1900-2100）
      const year = date.getFullYear();
      if (year < 1900 || year > 2100) {
        return { valid: false, error: `日期 "${value}" 年份不合理 (${year})`, sanitized: null };
      }

      // 标准化为 YYYY-MM-DD
      const sanitized = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return { valid: true, sanitized };
    },
  },
  {
    type: 'percentage',
    label: '百分比',
    validate(value: string) {
      const cleaned = value.replace(/%/g, '').trim();
      const num = Number(cleaned);
      if (isNaN(num)) {
        return { valid: false, error: `百分比 "${value}" 不是有效数字`, sanitized: null };
      }
      if (num < 0 || num > 100) {
        return { valid: false, error: `百分比 ${num}% 超出范围 (0-100)`, sanitized: null };
      }
      return { valid: true, sanitized: num };
    },
  },
  {
    type: 'id_card',
    label: '身份证号',
    validate(value: string) {
      const cleaned = value.toUpperCase().replace(/[^0-9X]/g, '');
      if (cleaned.length !== 18) {
        return { valid: false, error: `身份证号 "${value}" 长度不正确（应为18位，当前${cleaned.length}位）`, sanitized: null };
      }
      // 前17位必须是数字
      if (!/^\d{17}[\dX]$/.test(cleaned)) {
        return { valid: false, error: `身份证号 "${value}" 格式不正确（前17位应为数字，最后一位可为X）`, sanitized: null };
      }
      // 校验码验证（加权因子算法）
      const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
      const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
      let sum = 0;
      for (let i = 0; i < 17; i++) {
        sum += parseInt(cleaned[i]) * weights[i];
      }
      const expectedCheck = checkCodes[sum % 11];
      if (cleaned[17] !== expectedCheck) {
        return {
          valid: true,
          warning: `身份证号 "${value}" 校验码不匹配（期望 ${expectedCheck}，实际 ${cleaned[17]}），请确认`,
          sanitized: cleaned,
        };
      }
      return { valid: true, sanitized: cleaned };
    },
  },
];

// ========== 核心校验函数 ==========

/**
 * 金融数据准确性校验
 * 对 AI 返回的 summary 中提取的金融数据进行类型校验
 */
export function validateFinancialData(
  data: any,
  context: { url: string; pageTitle: string },
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sanitized: any = data;

  // 如果 data 是字符串，直接进行文本扫描
  if (typeof data === 'string') {
    return validateTextContent(data, context);
  }

  // 如果 data 是对象，递归校验每个字段
  if (typeof data === 'object' && data !== null) {
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        const fieldResult = validateTextContent(value, context, key);
        errors.push(...fieldResult.errors.map(e => `[${key}] ${e}`));
        warnings.push(...fieldResult.warnings.map(w => `[${key}] ${w}`));
        if (fieldResult.sanitized !== value) {
          sanitized[key] = fieldResult.sanitized;
        }
      } else if (typeof value === 'number') {
        // 数字类型直接校验范围
        const numResult = validateNumberValue(value, key);
        if (numResult.error) errors.push(`[${key}] ${numResult.error}`);
        if (numResult.warning) warnings.push(`[${key}] ${numResult.warning}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitized,
  };
}

/**
 * 校验文本内容中的金融数据
 */
function validateTextContent(
  text: string,
  context: { url: string; pageTitle: string },
  fieldName?: string,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const patternGroup of FINANCIAL_PATTERNS) {
    for (const pattern of patternGroup.patterns) {
      // 重置正则的 lastIndex
      const regex = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const rawValue = match[1] || match[0];
        const rule = VALIDATION_RULES.find(r => r.type === patternGroup.type);
        if (!rule) continue;

        const result = rule.validate(rawValue);
        if (!result.valid && result.error) {
          errors.push(`${result.error}（来源: ${context.url}）`);
        }
        if (result.warning) {
          warnings.push(`${result.warning}（来源: ${context.url}）`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitized: text,
  };
}

/**
 * 校验数字值的基本范围
 */
function validateNumberValue(
  value: number,
  fieldName?: string,
): { error?: string; warning?: string } {
  if (isNaN(value)) {
    return { error: `字段值不是有效数字` };
  }
  if (!isFinite(value)) {
    return { error: `字段值超出可表示范围 (Infinity)` };
  }
  return {};
}

// ========== 变化率异常检测 ==========

/**
 * 检测数据变化率是否异常
 * @param current 当前值
 * @param previous 上一次的值（null 表示首次采集，不做检测）
 * @param type 数据类型：stock（股价）、amount（金额）、rate（汇率）
 */
export function detectAnomaly(
  current: number,
  previous: number | null,
  type: 'stock' | 'amount' | 'rate',
): { isAnomaly: boolean; reason: string } {
  // 首次采集，无法比较
  if (previous === null || previous === 0) {
    return { isAnomaly: false, reason: '无历史数据，无法进行变化率检测' };
  }

  const changeRate = ((current - previous) / Math.abs(previous)) * 100;

  switch (type) {
    case 'stock': {
      // 股价单日涨跌超过 +/-10% 视为异常
      if (Math.abs(changeRate) > 10) {
        return {
          isAnomaly: true,
          reason: `股价变化率 ${changeRate.toFixed(2)}% 超过阈值 +/-10%（${previous} -> ${current}）`,
        };
      }
      return { isAnomaly: false, reason: `股价变化率 ${changeRate.toFixed(2)}% 在正常范围内` };
    }
    case 'amount': {
      // 金额变化超过 +/-50% 视为异常
      if (Math.abs(changeRate) > 50) {
        return {
          isAnomaly: true,
          reason: `金额变化率 ${changeRate.toFixed(2)}% 超过阈值 +/-50%（${previous} -> ${current}）`,
        };
      }
      return { isAnomaly: false, reason: `金额变化率 ${changeRate.toFixed(2)}% 在正常范围内` };
    }
    case 'rate': {
      // 汇率变化超过 +/-5% 视为异常
      if (Math.abs(changeRate) > 5) {
        return {
          isAnomaly: true,
          reason: `汇率变化率 ${changeRate.toFixed(2)}% 超过阈值 +/-5%（${previous} -> ${current}）`,
        };
      }
      return { isAnomaly: false, reason: `汇率变化率 ${changeRate.toFixed(2)}% 在正常范围内` };
    }
    default:
      return { isAnomaly: false, reason: `未知的数据类型: ${type}` };
  }
}

// ========== 数据溯源标记 ==========

/**
 * 为提取的数据添加溯源信息
 * @param data 提取的数据
 * @param source 来源 URL
 * @param rawText 原始文本
 */
export function addProvenance(
  data: any,
  source: string,
  rawText: string,
): DataProvenance {
  // 计算置信度：基于提取值与原始文本的匹配程度
  const confidence = calculateConfidence(data, rawText);

  return {
    source,
    timestamp: new Date().toISOString(),
    rawText: rawText.substring(0, 2000), // 限制原始文本长度，避免过大
    extractedValue: data,
    confidence,
  };
}

/**
 * 计算数据提取的置信度
 * 基于提取值在原始文本中的匹配程度
 */
function calculateConfidence(data: any, rawText: string): number {
  if (data === null || data === undefined) return 0;

  let confidence = 0.5; // 基础置信度

  // 如果是字符串，检查是否在原始文本中出现
  if (typeof data === 'string') {
    if (rawText.includes(data)) {
      confidence = 0.95; // 完全匹配
    } else {
      // 检查部分匹配
      const partialMatch = data.split('').filter(ch => rawText.includes(ch)).length / data.length;
      confidence = 0.3 + partialMatch * 0.5;
    }
  }

  // 如果是数字，检查数字是否在原始文本中出现
  if (typeof data === 'number') {
    const numStr = String(data);
    if (rawText.includes(numStr)) {
      confidence = 0.95;
    } else {
      // 检查近似匹配（如千分位格式）
      const formatted = data.toLocaleString();
      if (rawText.includes(formatted)) {
        confidence = 0.9;
      }
    }
  }

  // 如果是对象，取所有字段置信度的平均值
  if (typeof data === 'object' && !Array.isArray(data)) {
    const values = Object.values(data) as any[];
    if (values.length > 0) {
      const totalConfidence: number = values.reduce((sum: number, val: any) => {
        return sum + calculateConfidence(val, rawText);
      }, 0);
      confidence = totalConfidence / values.length;
    }
  }

  // 置信度限制在 0-1 之间
  return Math.max(0, Math.min(1, confidence));
}
