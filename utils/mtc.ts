/**
 * MTC（Multi-step Task Configuration）对话分步引导
 * 类型定义和默认配置
 */

export type ExportFormat = 'word' | 'pdf' | 'markdown'
export type TableMode = 'editable' | 'readonly'
export type RepairStrategy = 'auto' | 'prompt-only'

export interface MTCConfig {
  exportFormat: ExportFormat
  tableMode: TableMode
  repairStrategy: RepairStrategy
}

export const MTC_DEFAULT_CONFIG: MTCConfig = {
  exportFormat: 'word',
  tableMode: 'editable',
  repairStrategy: 'auto',
}

// MTC 步骤定义（JSON 配置驱动，可扩展）
export interface MTCStep {
  id: string
  title: string
  description: string
  options: { label: string; value: string; description?: string }[]
  configKey: keyof MTCConfig
}

export const MTC_STEPS: MTCStep[] = [
  {
    id: 'export-format',
    title: '选择导出格式',
    description: '生成的文档最终导出为什么格式？',
    options: [
      { label: 'Word 文档', value: 'word', description: '.docx 格式，适合编辑和分享' },
      { label: 'PDF 文档', value: 'pdf', description: '.pdf 格式，适合打印和归档' },
      { label: 'Markdown', value: 'markdown', description: '.md 格式，适合技术文档' },
    ],
    configKey: 'exportFormat',
  },
  {
    id: 'table-mode',
    title: '表格编辑模式',
    description: '文档中的表格是否需要可编辑？',
    options: [
      { label: '可编辑表格', value: 'editable', description: '导入后可直接修改表格内容' },
      { label: '纯文本展示', value: 'readonly', description: '表格以文本形式展示，不可编辑' },
    ],
    configKey: 'tableMode',
  },
  {
    id: 'repair-strategy',
    title: '表格异常修复',
    description: 'AI 生成的表格格式不规范时如何处理？',
    options: [
      { label: '前端自动修复', value: 'auto', description: '自动补全分隔线、对齐列数（推荐）' },
      { label: '仅靠 AI 约束', value: 'prompt-only', description: '不做额外修复，依赖 AI 输出质量' },
    ],
    configKey: 'repairStrategy',
  },
]

// 强关键词库（命中后进入 LLM 语义判定）
export const MTC_STRONG_KEYWORDS = [
  '生成', '制作', '整理', '编写', '撰写', '起草',
  '报表', '合同', '红头文件', '方案', '计划书',
  '会议纪要', '工作总结', '项目报告', '可行性报告',
]

// 弱关键词库（仅在句首/句尾命中时才判定）
export const MTC_WEAK_KEYWORDS = [
  '表格', '报告', '文档', '合同', '方案',
]

/**
 * 初筛：判断用户输入是否可能需要进入 MTC 引导
 * 返回 true 表示需要进一步 LLM 语义判定
 */
export function mtcKeywordMatch(input: string): boolean {
  const trimmed = input.trim()

  // 强关键词：任意位置命中
  for (const kw of MTC_STRONG_KEYWORDS) {
    if (trimmed.includes(kw)) return true
  }

  // 弱关键词：仅在句首或句尾命中
  for (const kw of MTC_WEAK_KEYWORDS) {
    if (trimmed.startsWith(kw) || trimmed.endsWith(kw)) return true
  }

  return false
}
