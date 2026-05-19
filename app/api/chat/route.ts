import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { callAPI } from '../../../src/api/apiManager'
import { modelStore } from '../../../src/lib/modelStore'
import { handleAmbiguousInput } from '../../../src/services/spellCorrectionService'
import { promptService } from '../../../src/services/prompt-service/PromptService'
import { centralBrain } from '../../../src/services/central-brain/CentralBrain'
import { MemorySystem } from '../../../src/services/memorySystem'
import preferenceExtractor from '../../../src/services/preferenceExtractor'
import preferenceInterceptor from '../../../src/services/preferenceInterceptor'
import branchManager from '../../../src/services/branchManager'
import topicContinuity from '../../../src/services/topicContinuity'
import duplicateIntentDetector from '../../../src/services/duplicateIntentDetector'
import operationGuarantee from '../../../src/services/operationGuarantee'
// 记账模块 - 延迟加载，避免 native 模块加载失败导致整个服务崩溃
let _accountingModule: any = null;
let _accountingLoadFailed = false;
async function getAccountingHandler() {
  if (_accountingLoadFailed) return null;
  if (!_accountingModule) {
    try {
      _accountingModule = await import('../../../src/services/accounting/chatIntegration');
    } catch (e) {
      logger.warn('SYSTEM', '记账模块加载失败，记账功能不可用', { extra: { error: (e as Error).message } });
      _accountingLoadFailed = true;
      return null;
    }
  }
  return _accountingModule.handleAccountingIntent;
}
import { vectorDB } from '../../../src/lib/vectorDB'
import { rateLimit, getRateLimitKey } from '../../../lib/rateLimit'
import { learnFromConversation } from '../../../src/services/conversationLearner'
import { logger } from '../../../src/lib/logger'

// 文件缓存：避免每次请求都同步读取文件
const fileCache = new Map<string, { content: string; mtime: number }>();
function readConfigFile(filePath: string): string {
  const fs = require('fs');
  try {
    const stat = fs.statSync(filePath);
    const cached = fileCache.get(filePath);
    if (cached && cached.mtime === stat.mtimeMs) {
      return cached.content;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    fileCache.set(filePath, { content, mtime: stat.mtimeMs });
    return content;
  } catch {
    return '';
  }
}

// ========== 数学公式文本清洗 ==========

// 已知的 LaTeX 命令（用于识别裸 LaTeX）
const LATEX_COMMANDS = [
  '\\\\frac', '\\\\sqrt', '\\\\sum', '\\\\int', '\\\\lim', '\\\\prod',
  '\\\\sin', '\\\\cos', '\\\\tan', '\\\\log', '\\\\ln', '\\\\exp',
  '\\\\alpha', '\\\\beta', '\\\\gamma', '\\\\delta', '\\\\theta', '\\\\pi', '\\\\lambda', '\\\\sigma', '\\\\omega', '\\\\phi',
  '\\\\infty', '\\\\partial', '\\\\nabla', '\\\\angle', '\\\\triangle', '\\\\perp', '\\\\parallel',
  '\\\\approx', '\\\\neq', '\\\\leq', '\\\\geq', '\\\\equiv', '\\\\sim', '\\\\propto',
  '\\\\cdot', '\\\\times', '\\\\div', '\\\\pm', '\\\\mp',
  '\\\\left', '\\\\right', '\\\\quad', '\\\\qquad',
  '\\\\boldsymbol', '\\\\mathbb', '\\\\mathcal', '\\\\mathrm', '\\\\text',
  '\\\\hat', '\\\\bar', '\\\\vec', '\\\\dot', '\\\\tilde',
  '\\\\binom', '\\\\choose', '\\\\begin', '\\\\end',
]

// 代码块正则（用于跳过代码块）
const CODE_BLOCK_REGEX = /```[\s\S]*?```/g

/**
 * 清洗数学公式文本，确保 KaTeX 能正确渲染
 * - 清除零宽空格等不可见字符
 * - 将 \(...\) 转为 $...$
 * - 将裸 LaTeX 命令自动包裹 $...$
 * - 跳过代码块内容
 */
function sanitizeMathText(text: string): string {
  if (!text) return text

  // 1. 清除零宽空格等不可见 Unicode 字符
  text = text.replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060]/g, '')

  // 2. 保护代码块，替换为占位符
  const codeBlocks: string[] = []
  text = text.replace(CODE_BLOCK_REGEX, (match) => {
    codeBlocks.push(match)
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`
  })

  // 3. 将 \(...\) 转为 $...$（LaTeX 行内公式）
  text = text.replace(/\\\(([^)]*?)\\\)/g, '$$$1$$')

  // 4. 将裸 LaTeX 命令包裹 $...$
  // 匹配模式：不在 $...$ 内的裸 LaTeX 命令
  const cmdPattern = LATEX_COMMANDS.join('|')
  // 找到所有裸 LaTeX 片段（不在 $ 包裹内的）
  const segments: { text: string; inMath: boolean }[] = []
  let remaining = text
  const mathDelimRegex = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g
  let lastIdx = 0
  let delimMatch: RegExpExecArray | null

  while ((delimMatch = mathDelimRegex.exec(remaining)) !== null) {
    if (delimMatch.index > lastIdx) {
      segments.push({ text: remaining.slice(lastIdx, delimMatch.index), inMath: false })
    }
    segments.push({ text: delimMatch[0], inMath: true })
    lastIdx = delimMatch.index + delimMatch[0].length
  }
  if (lastIdx < remaining.length) {
    segments.push({ text: remaining.slice(lastIdx), inMath: false })
  }

  // 对非数学片段中的裸 LaTeX 命令包裹 $
  text = segments.map(seg => {
    if (seg.inMath) return seg.text
    // 匹配裸 LaTeX 命令（前面没有 $）
    return seg.text.replace(new RegExp(`(?<!\\$)((?:${cmdPattern})[^\\n$]{0,40})`, 'g'), '$$$1$$')
  }).join('')

  // 5. 恢复代码块
  codeBlocks.forEach((block, i) => {
    text = text.replace(`__CODE_BLOCK_${i}__`, block)
  })

  return text
}

const DEFAULT_SYSTEM_PROMPT = '你是一个有用的AI助手。'

// 数学公式格式指令（追加到 system prompt 末尾）
const MATH_FORMAT_INSTRUCTION = '\n\n【数学公式格式要求】\n- 数学公式必须用 $...$ 包裹（行内）或 $$...$$ 包裹（块级）\n- 禁止使用 \\(...\\) 或 \\[...\\] 格式\n- 示例：$x^2 + y^2 = r^2$、$$\\int_0^1 x\\,dx = \\frac{1}{2}$$\n- 分数用 \\frac{a}{b}，根号用 \\sqrt{x}，上下标用 ^ 和 _\n- 禁止在公式中使用零宽空格等不可见字符'

const memorySystem = MemorySystem.getInstance();

const configPath = path.join(process.cwd(), 'config', 'prompt-config.json')

// 功能开关：是否启用中央大脑
const USE_CENTRAL_BRAIN = process.env.USE_CENTRAL_BRAIN === 'true' || false;

// 联网搜索触发指令（追加到所有 system prompt 后面）
const AGENT_TRIGGER_INSTRUCTION = `

【重要 - Agent 触发规则】
系统已内置自动联网搜索能力（天气、新闻、股价、汇率等实时信息会自动搜索）。
你不需要标记 [NEEDS_AGENT] 来触发搜索，系统会自动处理。
只有以下情况才需要在回复开头加上 [NEEDS_AGENT] 标记：
1. 需要在网页上执行多步操作（如打开特定网站、登录、填表等）
2. 需要访问特定网页并提取结构化数据（如爬取某个页面的内容）
3. 用户明确要求"打开XX网站"、"帮我上XX看看"

不要对天气、新闻、股价、汇率、时间等问题标记 [NEEDS_AGENT]，系统已自动处理。
`

// 格式规范放在 system prompt 末尾（最高注意力权重）
const FORMAT_RULES = `
【强制表格输出规则 · 必须遵守】

当内容需要用表格展示时，必须严格使用以下标准 Markdown 格式：

| 列头1 | 列头2 | 列头3 |
| :--- | :--- | :--- |
| 内容1 | 内容2 | 内容3 |

铁律：
1. 表格前后各空一行，绝对不能紧贴文字
2. 分隔行的 | 数量必须与表头行完全一致
3. 每个数据行的 | 数量必须与表头行完全一致，缺少数据用 - 补齐
4. 禁止输出伪表格、文字排版表格、缺少 | 的表格
5. 不需要表格时，不要强行生成表格

自检（每次输出表格后必须执行）：
- 逐行数 | 的数量：表头行、分隔行、每个数据行，三者必须完全一致
- 确认表格前后各有一个空行
- 如果自检发现不一致，立即修正后再输出

其他格式要求：
- 代码示例使用代码块（\`\`\`语言名 ... \`\`\`），前后各留一个空行
- 重点内容用 **加粗**，次要说明用 *斜体*
- 避免使用自定义标记（如【标题】、【正文】等），直接使用标准 Markdown
- 标题使用 ## 或 ### ，不要用其他方式模拟标题
- 每种格式元素之间用空行分隔
`

// ========== 提词器读取（JSON 文件） ==========
const PROMPTS_JSON_PATH = path.join(process.cwd(), 'data', 'prompts.json');

function readPrompts(): any[] {
  try {
    if (fs.existsSync(PROMPTS_JSON_PATH)) {
      return JSON.parse(fs.readFileSync(PROMPTS_JSON_PATH, 'utf8'));
    }
  } catch (e) {
    logger.error('SYSTEM', '读取提词器文件失败', { extra: { error: String(e) } });
  }
  return [];
}

// ========== 场景关键词映射表 ==========
const SCENARIO_KEYWORDS: Record<string, string[]> = {
  '财务': ['税务','纳税','申报','发票','台账','报表','账','会计','审计','增值税','企业所得税','个税','社保','公积金','工资','薪酬','财务','利润','营收','成本','费用','资产','负债','折旧','营业执照','注册','注销','变更','年报','汇算清缴','税率','减免','优惠','扣除','对账','流水','凭证','记账','出纳'],
  '编程': ['代码','编程','程序','脚本','函数','API','接口','开发','Python','JavaScript','TypeScript','Java','Go','Rust','React','Vue','Node','Next.js','数据库','SQL','MongoDB','算法','数据结构','调试','Bug','错误','异常','部署','服务器','前端','后端','全栈','移动端','小程序','网页','网站'],
  '写作': ['写作','文章','文案','润色','修改','编辑','创作','撰写','标题','开头','结尾','段落','结构','大纲','摘要','邮件','通知','公告','报告','方案','计划','总结','小说','故事','诗歌','散文','日记','博客'],
  '翻译': ['翻译','译','英文','中文','日语','韩语','法语','德语','西班牙语','English','Japanese','Korean','French','German','Spanish','中译英','英译中','互译','双语'],
  '分析': ['分析','研究','调研','调查','评估','诊断','洞察','数据','统计','图表','趋势','对比','比较','差异','报告','总结','归纳','结论','建议','方案','市场','竞品','用户','行业','企业','公司'],
  '客服': ['客服','投诉','咨询','解答','回复','处理','解决','客户','消费者','顾客','买家','卖家','退换','退款','售后','维权','纠纷'],
  '教育': ['教学','教育','学习','课程','培训','辅导','讲解','考试','测试','作业','题目','答案','解析','学生','老师','教师','学校','课堂','知识点','数学','物理','化学','生物','历史','地理','语文','英语'],
  '法律': ['法律','法规','条例','条款','合同','协议','契约','诉讼','仲裁','判决','裁定','起诉','应诉','律师','法院','检察院','公安','司法','权利','义务','责任','赔偿','违约','侵权'],
  '医疗': ['医疗','健康','疾病','症状','治疗','药物','医院','医生','护士','患者','病人','诊断','检查','化验','感冒','发烧','咳嗽','头痛','胃痛','过敏','中医','西医','养生','保健','营养'],
};

/** 场景匹配：根据用户消息找到最合适的提词器 */
const matchScenario = (message: string): any | null => {
  const templates = readPrompts();
  const activeTemplates = templates.filter((t: any) =>
    t.isActive && t.scenario && t.scenario.length > 0
  );

  if (activeTemplates.length === 0) return null;

  let bestMatch: { template: any; score: number } | null = null;
  for (const template of activeTemplates) {
    let score = 0;
    for (const scenarioName of template.scenario) {
      const keywords = SCENARIO_KEYWORDS[scenarioName];
      if (!keywords) continue;
      for (const keyword of keywords) {
        if (message.includes(keyword)) score += 1;
      }
    }
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { template, score };
    }
  }
  return bestMatch?.template || null;
};

const getSystemPrompt = (templateId?: string, userMessage?: string) => {
  let prompt = ''
  const templates = readPrompts();

  // 优先级1：指定了模板ID
  if (templateId) {
    try {
      const template = templates.find((t: any) => t.id === templateId);
      if (template && template.isActive) {
        prompt = template.content;
      }
    } catch (error) {
      logger.error('SYSTEM', '读取指定模板失败', { extra: { error: String(error) } })
    }
  }

  // 优先级2：场景智能匹配（需要用户消息）
  if (!prompt && userMessage) {
    try {
      const matched = matchScenario(userMessage);
      if (matched) {
        prompt = matched.content;
        logger.info('SYSTEM', `提词器场景匹配: ${matched.name}`);
      }
    } catch (error) {
      logger.error('SYSTEM', '场景匹配失败', { extra: { error: String(error) } })
    }
  }

  // 优先级3：默认模板
  if (!prompt) {
    try {
      const defaultTemplate = templates.find((t: any) => t.isDefault && t.isActive);
      if (defaultTemplate) {
        prompt = defaultTemplate.content
      }
    } catch (error) {
      logger.error('SYSTEM', '读取默认模板失败', { extra: { error: String(error) } })
    }
  }

  // 优先级4：config/prompt-config.json 文件
  if (!prompt) {
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(readConfigFile(configPath))
        prompt = config.systemPrompt
      }
    } catch (error) {
      logger.error('SYSTEM', '读取prompt配置文件失败', { extra: { error: String(error) } })
    }
  }

  // 优先级5：硬编码默认
  if (!prompt) {
    prompt = '你是全能AI顾问，具备多重专业能力，可以根据用户的具体需求灵活切换角色。\n\n始终坚持：合规优先、落地可行、数据可控、权责明确。'
  }

  // 追加当前日期 + 联网搜索触发指令 + 格式规范（放在末尾，最高注意力权重）
  const now = new Date()
  const currentDate = `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日 ${['日','一','二','三','四','五','六'][now.getDay()]}`
  return prompt + `\n\n当前日期：${currentDate}\n` + AGENT_TRIGGER_INSTRUCTION + FORMAT_RULES
}

// 检测简单问候语
const isSimpleGreeting = (message: string): boolean => {
  const greetings = ['hi', '你好', '您好', '嗨', '哈喽', '早上好', '下午好', '晚上好', '早安', '晚安']
  const trimmedMessage = message.trim().toLowerCase()
  return greetings.some(greeting => trimmedMessage.includes(greeting))
}

// 检测是否是纯问当前时间/日期的问题（排除"申报时间"、"营业时间"等）
const isDateTimeQuestion = (message: string): boolean => {
  // 排除包含业务场景关键词的消息
  const businessKeywords = ['申报', '营业', '上班', '下班', '上课', '开门', '截止', '发布', '更新', '起飞', '发车', '开会', '考试', '报名', '截止', '天气', '气温', '下雨']
  const hasBusinessContext = businessKeywords.some(keyword => message.includes(keyword))
  if (hasBusinessContext) return false

  // 匹配纯问时间的各种口语化表达
  const pureTimePatterns = [
    /^现在几点/, /^几点了/, /^现在什么时候/, /^今天几号/,
    /^今天星期/, /^今天礼拜/, /^什么日期/, /^现在什么时间/,
    /^今天是几号/, /^今天是星期/, /^现在日期/,
    /几号了/, /星期几/, /礼拜几/, /什么时间/,
    /当前时间/, /具体时间/, /准确时间/, /现在的时间/,
    /查.*时间/, /看.*时间/, /告诉我.*时间/,
    /今天是.*号/, /今天是.*期/,
    /现在.*日期/, /当前.*日期/,
  ]
  return pureTimePatterns.some(pattern => pattern.test(message))
}

// 生成日期时间回答
const generateDateTimeResponse = (message: string): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const seconds = now.getSeconds()
  
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const weekday = weekdays[now.getDay()]
  
  let response = `当前时间：${year}年${month}月${day}日 ${weekday} ${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  
  // 根据具体问题调整回答
  if (message.includes('今天')) {
    response = `今天是${year}年${month}月${day}日，${weekday}。`
  } else if (message.includes('星期') || message.includes('礼拜')) {
    response = `今天是${weekday}。`
  } else if (message.includes('几号')) {
    response = `今天是${year}年${month}月${day}日。`
  } else if (message.includes('时间') || message.includes('几点')) {
    response = `当前时间是${hours}:${minutes.toString().padStart(2, '0')}。`
  }
  
  return response
}

// 多样化问候语列表
const greetingResponses = [
  '您好！很高兴再次与您对话。',
  '嗨！有什么可以帮您的？',
  '你好！今天想聊点什么？',
  '哈喽！欢迎回来。',
  '您好！我是露丝，随时为您服务。',
  '嗨！很高兴见到您。',
  '你好！有什么问题我可以帮您解答吗？',
  '哈喽！今天有什么新想法吗？',
  '您好！期待与您的交流。',
  '嗨！让我们开始今天的对话吧。'
]

// 随机选择问候语
const getRandomGreeting = (): string => {
  const randomIndex = Math.floor(Math.random() * greetingResponses.length)
  return greetingResponses[randomIndex]
}

// 搜索触发函数：仅使用关键词匹配
const shouldSearch = (message: string): boolean => {
  // 关键词匹配：只保留明确的搜索意图关键词
  const searchKeywords = [
    '最新', '最近', '新闻', '热点', '大事', '时事',
    '股价', '股票', '指数', '基金', '行情', '大盘',
    '创业板', '上证指数', '深证成指', '股市',
    '天气', '温度', '气温', '预报',
    '汇率', '美元', '欧元', '日元',
    '查一下', '搜一下', '帮我查', '帮我搜',
    '搜索', '百度一下', '查询', '帮我查询',
    '多少号', '今天几号', '星期几', '几点了', '现在几点', '什么时候', '时间',
    '财经', '科技', '体育', '娱乐',
  ]
  const hasSearchKeyword = searchKeywords.some(keyword => message.includes(keyword))

  // 如果命中搜索关键词，直接返回 true（不受排除模式影响）
  if (hasSearchKeyword) return true

  // 明确不需要搜索的场景：追问、确认、闲聊（仅在无搜索关键词时生效）
  const noSearchPatterns = [
    /这是什么/, /为什么/, /怎么回事/, /啥意思/, /啥原因/,
    /你为啥/, /你为什么/, /你是不是/, /你检查/,
    /牛头不对马嘴/, /傻了/, /废话/, /再说/,
    /谢谢/, /好的/, /嗯/, /哦/, /知道了/,
    /^[这是啥|这是什么|那是什么|为什么|咋]/
  ]
  const isNoSearch = noSearchPatterns.some(pattern => pattern.test(message))
  return !isNoSearch
}

// 优化的搜索结果处理函数
const processSearchResults = (results: any[], message: string = ''): string => {
  if (!results || results.length === 0) {
    return ''
  }
  
  // 过滤和排序结果（Tavily 已按请求条数返回，这里只做格式化）
  // 保留 url 和 published_date，供新闻类查询使用
  const processedResults = results
    .filter(result => result.title && result.summary)
    .map((result, index) => {
      // 从 URL 提取媒体名称
      let source = ''
      if (result.url) {
        try {
          const hostname = new URL(result.url).hostname.replace('www.', '')
          source = hostname.split('.')[0]
        } catch { /* ignore */ }
      }
      const date = result.published_date || result.date || ''
      return `[搜索结果 ${index + 1}] ${result.title}: ${result.summary}${source ? ` [来源: ${source}]` : ''}${date ? ` [日期: ${date}]` : ''}`
    })
    .join('\n\n')
  
  return processedResults
}

// 处理股票数据查询
const processStockQuery = async (message: string): Promise<string> => {
  let symbol = 'sh000001'
  let indexName = '上证指数'
  
  // 股票名称到代码的映射
  const stockMap: Record<string, string> = {
    '比亚迪': 'sz002594',
    '茅台': 'sh600519',
    '宁德时代': 'sz300750',
    '腾讯': 'hk00700',
    '阿里巴巴': 'hk09988',
    '苹果': 'usAAPL',
    '特斯拉': 'usTSLA',
    '万丰奥威': 'sz002085',
    '中国平安': 'sh601318',
    '招商银行': 'sh600036',
    '工商银行': 'sh601398',
    '西部超导': 'sh688122',
    '康比特': 'bj920429'
  }
  
  // 检查是否是指数查询
  if (message.includes('深证') || message.includes('深指数') || message.includes('深成指')) {
    symbol = 'sz399001'
    indexName = '深证成指'
  } else if (message.includes('创业板')) {
    symbol = 'sz399006'
    indexName = '创业板指'
  } else if (message.includes('科创')) {
    symbol = 'sh000688'
    indexName = '科创50'
  } else {
    // 检查是否是个股查询
    for (const [name, code] of Object.entries(stockMap)) {
      if (message.includes(name)) {
        symbol = code
        indexName = name
        break
      }
    }
  }

    try {
    // 调用finance API获取股票数据
    const stockResponse = await fetch(`http://localhost:3000/api/finance?symbol=${symbol}&market=sina`)
    const stockData = await stockResponse.json()
    
    if (stockData.success && stockData.data && stockData.data[symbol]) {
      const indexData = stockData.data[symbol]
      const price = indexData.price
      const change = (parseFloat(indexData.price) - parseFloat(indexData.lastClose)).toFixed(2)
      const changePercent = ((parseFloat(change) / parseFloat(indexData.lastClose)) * 100).toFixed(2)
      
      const changeNum = parseFloat(change)
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const result = `${indexName}最新数据 (${dateStr})：收盘价 ${price}元，${changeNum > 0 ? '上涨' : '下跌'}${Math.abs(changeNum)}元，${changeNum > 0 ? '上涨' : '下跌'}${Math.abs(parseFloat(changePercent))}%。开盘价 ${indexData.open}元，最高价 ${indexData.high}元，最低价 ${indexData.low}元，昨收盘价 ${indexData.lastClose}元，成交量 ${(parseInt(indexData.volume) / 100000000).toFixed(2)}亿手，成交额 ${(parseInt(indexData.amount) / 100000000).toFixed(2)}亿元。`
      return result
    }
  } catch (error) {
    logger.error('AI_API', 'Stock API 调用失败', { extra: { error: String(error) } })
  }

  return ''
}

// 根据 apiId 从 apis.json 查找 API 配置
const getApiConfig = (apiId: string): { baseUrl: string; apiKey: string } | null => {
  try {
    const apisFile = path.join(process.cwd(), 'data', 'apis.json')
    if (fs.existsSync(apisFile)) {
      const apis = JSON.parse(readConfigFile(apisFile))
      const apiConfig = apis.find((a: any) => a.api_id === apiId)
      if (apiConfig) {
        return { baseUrl: apiConfig.baseUrl || '', apiKey: apiConfig.apiKey || '' }
      }
    }
  } catch (error) {
    logger.error('AI_API', '读取 API 配置失败', { extra: { error: String(error) } })
  }
  return null
}

// 根据模型配置动态调用 LLM API（带降级）
const callLLM = async (params: { message: string; history?: any[]; systemPrompt?: string; model?: string }) => {
  const { message, history = [], systemPrompt, model = 'deepseek-v4-flash' } = params

  try {
    return await _callLLMInternal({ message, history, systemPrompt, model });
  } catch (error: any) {
    logger.error('AI_API', `模型 ${model} 调用失败`, { extra: { error: error.message } });
    // 降级：尝试同场景其他模型
    const allModels = modelStore.getAll();
    const failedModel = allModels.find((m: any) => m.modelId === model);
    const failedScenarios = failedModel?.scenario || [];

    // 找同场景的其他启用模型
    const fallback = allModels.find((m: any) =>
      m.type === 'llm' && m.isEnabled && m.modelId !== model &&
      m.scenario?.some((s: string) => failedScenarios.includes(s))
    );

    if (fallback) {
      logger.warn('AI_API', `降级到备用模型: ${fallback.modelId}`);
      try {
        return await _callLLMInternal({ message, history, systemPrompt, model: fallback.modelId });
      } catch (e: any) {
        logger.error('AI_API', `备用模型 ${fallback.modelId} 也失败`, { extra: { error: e.message } });
      }
    }

    // 最终兜底：deepseek-v4-flash
    if (model !== 'deepseek-v4-flash') {
      logger.warn('AI_API', '最终兜底到 deepseek-v4-flash');
      try {
        return await _callLLMInternal({ message, history, systemPrompt, model: 'deepseek-v4-flash' });
      } catch (e: any) {
        logger.error('AI_API', '最终兜底也失败', { extra: { error: e.message } });
      }
    }

    throw error;
  }
}

// 流式输出：调用 LLM 并流式返回 SSE 响应
const callLLMStream = async (
  params: { message: string; history?: any[]; systemPrompt?: string; model?: string },
  writer: any
) => {
  const { message, history = [], systemPrompt, model = 'deepseek-v4-flash' } = params;

  const allModels = modelStore.getAll();
  const modelConfig = allModels.find((m: any) => m.modelId === model);

  let endpoint: string;
  let apiKey: string;
  let useOpenAIFormat = false;

  // DashScope（阿里云）支持流式
  if (modelConfig && modelConfig.provider === 'dashscope') {
    endpoint = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    apiKey = process.env.DASHSCOPE_API_KEY || '';
    if (modelConfig.apiId) {
      const apiConfig = getApiConfig(modelConfig.apiId);
      if (apiConfig) {
        if (apiConfig.baseUrl) endpoint = apiConfig.baseUrl.replace(/\/$/, '') + '/chat/completions';
        if (apiConfig.apiKey) apiKey = apiConfig.apiKey;
      }
    } else {
      if ((modelConfig as any).endpoint) endpoint = (modelConfig as any).endpoint;
      if ((modelConfig as any).apiKey) apiKey = (modelConfig as any).apiKey;
    }
  } 
  // DeepSeek 支持流式（OpenAI 兼容格式）
  else if (modelConfig && modelConfig.provider === 'deepseek') {
    endpoint = 'https://api.deepseek.com/v1/chat/completions';
    apiKey = '';
    if (modelConfig.apiId) {
      const apiConfig = getApiConfig(modelConfig.apiId);
      if (apiConfig) {
        if (apiConfig.baseUrl) endpoint = apiConfig.baseUrl.replace(/\/$/, '') + '/v1/chat/completions';
        if (apiConfig.apiKey) apiKey = apiConfig.apiKey;
      }
    }
    useOpenAIFormat = true;
  }
  // 其他 provider：回退到非流式
  else {
    const result = await callLLM({ message, history, systemPrompt, model });
    const content = result.choices?.[0]?.message?.content || '';
    await writer.write(`data: ${JSON.stringify({ content })}\n\n`);
    await writer.write(`data: [DONE]\n\n`);
    return;
  }

  const modelId = modelConfig.modelId || model;
  const params2 = modelConfig.parameters || {};

  const messages = [
    { role: 'system', content: systemPrompt || DEFAULT_SYSTEM_PROMPT + MATH_FORMAT_INSTRUCTION },
    ...history.filter((m: any) => m.role === 'user' || m.role === 'assistant').map((m: any) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message }
  ];

  const requestBody: any = { model: modelId, messages, stream: true };
  if (params2.temperature !== undefined) requestBody.temperature = params2.temperature;
  if (params2.topP !== undefined) requestBody.top_p = params2.topP;
  if (params2.maxTokens !== undefined) requestBody.max_tokens = params2.maxTokens;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const providerName = modelConfig.provider === 'dashscope' ? 'DashScope' : 'DeepSeek';
    throw new Error(`${providerName} API 流式请求失败 (${response.status}): ${body.substring(0, 100)}`);
  }

  if (!response.body) {
    throw new Error('流式响应无 body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;

      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') {
        await writer.write(`data: [DONE]\n\n`);
        return;
      }

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          await writer.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
  }

  await writer.write(`data: [DONE]\n\n`);
  return;
}

// callLLM 内部实现
const _callLLMInternal = async (params: { message: string; history?: any[]; systemPrompt?: string; model?: string }) => {
  const { message, history = [], systemPrompt, model = 'deepseek-v4-flash' } = params

  // 从 modelStore 查找模型配置
  const allModels = modelStore.getAll()
  const modelConfig = allModels.find((m: any) => m.modelId === model)

  // 如果找到模型配置且是 ollama 类型，调用本地 Ollama API
  if (modelConfig && modelConfig.provider === 'ollama') {
    // 优先从 apis.json 获取 baseUrl，兼容旧数据
    let endpoint = 'http://localhost:11434'
    if (modelConfig.apiId) {
      const apiConfig = getApiConfig(modelConfig.apiId)
      if (apiConfig?.baseUrl) endpoint = apiConfig.baseUrl
    } else if ((modelConfig as any).endpoint) {
      endpoint = (modelConfig as any).endpoint
    }
    const modelId = modelConfig.modelId || model
    const params = modelConfig.parameters || {}

    const messages = [
      { role: 'system', content: systemPrompt || DEFAULT_SYSTEM_PROMPT + MATH_FORMAT_INSTRUCTION },
      ...history.filter((m: any) => m.role === 'user' || m.role === 'assistant').map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message }
    ]

    const requestBody: any = { model: modelId, messages, stream: false }
    if (params.temperature !== undefined) requestBody.temperature = params.temperature
    if (params.topP !== undefined) requestBody.top_p = params.topP
    if (params.maxTokens !== undefined) requestBody.num_predict = params.maxTokens

    const response = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      throw new Error(`Ollama API 请求失败 (${response.status}): ${response.statusText}`)
    }

    const data = await response.json()
    // 转换为 OpenAI 兼容格式
    return {
      choices: [{
        message: { role: 'assistant', content: data.message?.content || data.response || '' }
      }]
    }
  }

  // 如果是 DashScope（阿里云）类型，使用 OpenAI 兼容接口
  if (modelConfig && modelConfig.provider === 'dashscope') {
    // 优先从 apis.json 获取配置，兼容旧数据
    let endpoint = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
    let apiKey = process.env.DASHSCOPE_API_KEY || ''
    if (modelConfig.apiId) {
      const apiConfig = getApiConfig(modelConfig.apiId)
      if (apiConfig) {
        if (apiConfig.baseUrl) endpoint = apiConfig.baseUrl.replace(/\/$/, '') + '/chat/completions'
        if (apiConfig.apiKey) apiKey = apiConfig.apiKey
      }
    } else {
      if ((modelConfig as any).endpoint) endpoint = (modelConfig as any).endpoint
      if ((modelConfig as any).apiKey) apiKey = (modelConfig as any).apiKey
    }
    const modelId = modelConfig.modelId || model
    const params = modelConfig.parameters || {}

    const messages = [
      { role: 'system', content: systemPrompt || DEFAULT_SYSTEM_PROMPT + MATH_FORMAT_INSTRUCTION },
      ...history.filter((m: any) => m.role === 'user' || m.role === 'assistant').map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message }
    ]

    const requestBody: any = { model: modelId, messages, stream: false }
    if (params.temperature !== undefined) requestBody.temperature = params.temperature
    if (params.topP !== undefined) requestBody.top_p = params.topP
    if (params.maxTokens !== undefined) requestBody.max_tokens = params.maxTokens
    if (params.frequencyPenalty !== undefined) requestBody.frequency_penalty = params.frequencyPenalty
    if (params.presencePenalty !== undefined) requestBody.presence_penalty = params.presencePenalty
    if (params.responseFormat && params.responseFormat !== 'text') requestBody.response_format = { type: params.responseFormat }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`DashScope API 请求失败 (${response.status}): ${response.statusText} ${body.substring(0, 100)}`)
    }

    return await response.json()
  }

  // 根据 provider 调用对应 API
  if (modelConfig) {
    const apiId = modelConfig.apiId
    if (apiId) {
      return await callAPI(apiId, 'chat', {
        message, history, systemPrompt,
        model: modelConfig.modelId || model,
        parameters: modelConfig.parameters || {},
        customPrompt: modelConfig.customPrompt || '',
      })
    }
  }

  // 最终兜底：使用 deepseek-api
  return await callAPI('deepseek-api', 'chat', { message, history, systemPrompt, model })
}

// 并行处理搜索和AI调用
const processMessageWithSearch = async (message: string, history: any[] = [], userId: string = 'default', model: string = '', source: string = 'chat', templateId?: string, conversationId?: string | null) => {
  const totalStart = Date.now();
  const timings: Record<string, number> = {};
  
  // ===== 中央大脑路径（可选启用）=====
  if (USE_CENTRAL_BRAIN) {
    try {
      logger.info('CentralBrain', '启用中央大脑处理');
      const brainResult = await centralBrain.execute(message, userId);
      
      // 写入黑板状态到日志（调试用）
      const blackboardState = centralBrain.getBlackboard().exportState();
      logger.debug('CentralBrain', '黑板状态', { state: Object.keys(blackboardState) });
      
      // 任务队列状态
      const queueState = centralBrain.getTaskQueue().getAll();
      logger.debug('CentralBrain', '任务队列状态', { tasks: queueState.length });
      
    } catch (error) {
      logger.warn('CentralBrain', '中央大脑处理异常', { error: String(error) });
      // 失败时继续使用传统路径
    }
  }

  // ===== 读取全局功能开关和模型 features =====
  let t0 = Date.now();
  let globalFeatures = { enableInternetSearch: true, enableRag: true, enableAgent: true, enableMemory: true };
  let modelFeatures = { webSearch: true, ragEnabled: true, agentEnabled: true, memoryEnabled: true };
  let allModels: any[] = [];
  try {
    const configsData = JSON.parse(readConfigFile(path.join(process.cwd(), 'data', 'configs.json')));
    if (configsData.features) globalFeatures = { ...globalFeatures, ...configsData.features };
    allModels = modelStore.getAll();
  } catch (e) {
    logger.error('SYSTEM', '读取功能开关配置失败，使用默认值', { extra: { error: String(e) } });
  }
  timings.configLoad = Date.now() - t0;

  // ===== 模型选择：使用统一提示词服务进行路由 =====
  let routedModel = model;
  let skillPrompt = '';
  
  if (!model) {
    const promptResult = await promptService.generate(message);
    routedModel = promptResult.modelId;
    skillPrompt = promptResult.systemPrompt;
    logger.info('AI_API', `路由匹配模型: ${routedModel}, 技能组合: ${promptResult.comboId || '无'}`);
  }
  
  logger.info('AI_API', `使用模型: ${routedModel}`);

  // 用路由后的模型读取 features
  const modelConfig = allModels.find((m: any) => m.modelId === routedModel);
  if (modelConfig?.features) modelFeatures = { ...modelFeatures, ...modelConfig.features };

  // 最终生效 = 全局 AND 模型
  const canSearch = globalFeatures.enableInternetSearch && modelFeatures.webSearch;
  const canRag = globalFeatures.enableRag && modelFeatures.ragEnabled;
  const canAgent = globalFeatures.enableAgent && modelFeatures.agentEnabled;
  const canMemory = globalFeatures.enableMemory && modelFeatures.memoryEnabled;

  // 检查是否是简单问候语
  if (isSimpleGreeting(message)) {
    return {
      choices: [{
        message: {
          role: 'assistant',
          content: getRandomGreeting()
        }
      }]
    };
  }
  
  // 检查是否是日期时间相关问题
  if (isDateTimeQuestion(message)) {
    return {
      choices: [{
        message: {
          role: 'assistant',
          content: generateDateTimeResponse(message)
        }
      }]
    };
  }

  // mtc-check 来源：只做简单判定，跳过所有重量级逻辑
  if (source === 'mtc-check') {
    return await callLLM({ message, model: routedModel });
  }

  // 知识库检索：仅 chat 和 mtc 来源执行，polish 等来源跳过
  // 需要全局 RAG 开关和模型 RAG 开关同时开启
  let knowledgeContext = '';
  let hasKnowledgeMatch = false;
  if (canRag && (source === 'chat' || source === 'mtc')) {
    t0 = Date.now();
  // 场景判断：仅企业业务场景才检索知识库，避免天气/闲聊等场景检索出无关税务文档
  const businessKeywords = [
    '税务', '纳税', '申报', '发票', '台账', '报表', '账', '会计', '审计',
    '增值税', '企业所得税', '个税', '社保', '公积金', '工资', '薪酬',
    '财务', '利润', '营收', '成本', '费用', '资产', '负债', '折旧',
    '营业执照', '注册', '注销', '变更', '年报', '汇算清缴',
    '公司', '企业', '引信', '客户', '供应商', '合同',
    '政策', '法规', '税率', '减免', '优惠', '扣除',
    '银行', '对账', '流水', '凭证', '记账', '出纳',
    '文档', '资料', '档案', '归档', '整理',
  ];
  const isBusinessQuery = businessKeywords.some(kw => message.includes(kw));

  if (isBusinessQuery) {
    try {
    await vectorDB.init();
    const docCount = await vectorDB.getDocumentCount();
    if (docCount > 0) {
      const knowledgeResults = await vectorDB.query(message, 3);
      if (knowledgeResults.documents && knowledgeResults.documents.length > 0 && knowledgeResults.documents[0].length > 0) {
        const validDocs = knowledgeResults.documents[0]
          .filter((doc: string) => doc && doc.trim().length > 0);
        if (validDocs.length > 0) {
          knowledgeContext = validDocs
            .map((doc: string, i: number) => `[参考资料${i + 1}] ${doc}`)
            .join('\n\n');
          hasKnowledgeMatch = true;
          logger.info('RAG', `检索到 ${validDocs.length} 条相关知识`);
        }
      }
    }
  } catch (error) {
    logger.error('RAG', '知识库检索失败，跳过知识库增强', { extra: { error: String(error) } });
  }
  timings.ragQuery = Date.now() - t0;
  } // end if isBusinessQuery
  } // end if canRag && source

  // 构建知识库增强指令
  const knowledgeInstruction = knowledgeContext
    ? `\n\n[企业知识库参考资料]\n${knowledgeContext}\n\n【指令】以上是企业知识库中的相关资料，请优先参考这些资料来回答用户问题。如果资料内容与问题不相关，请忽略资料，用你自己的知识回答。不要提及"知识库"、"参考资料"等字眼。`
    : '';

  // 检查是否是记账/财务相关意图
  // 如果知识库有匹配、或用户明确要求联网查询/搜索，则跳过记账拦截
  const wantsExternalInfo = /联网|查询一下|搜[索一下]*|帮我查|网上|公开|详细信息.*查/.test(message);
  let accountingResult: string | null = null;
  try {
    const accountingHandler = await getAccountingHandler();
    if (accountingHandler && !hasKnowledgeMatch && !wantsExternalInfo) {
      accountingResult = await accountingHandler(message);
    }
  } catch (e) {
    logger.error('SYSTEM', '记账模块 handleAccountingIntent 异常', { extra: { error: String(e) } });
    accountingResult = null; // 记账模块出错不影响正常聊天
  }
  if (accountingResult) {
    return {
      choices: [{
        message: {
          role: 'assistant',
          content: accountingResult
        }
      }]
    };
  }
  
  // 并行执行独立的预处理步骤（记忆优先级校验 + 话题连续性 + 偏好提取）
  t0 = Date.now();
  const [_, continuityResult, __] = await Promise.all([
    operationGuarantee.validateMemoryPriority(),
    topicContinuity.handleTopicContinuity(userId, message),
    canMemory ? memorySystem.extractAndUpdatePreference(userId, message) : Promise.resolve()
  ]);
  timings.parallelPreprocess = Date.now() - t0;
  
  if (continuityResult.isWakeup) {
    // 唤醒分支，返回唤醒响应
    return {
      choices: [{
        message: {
          role: 'assistant',
          content: continuityResult.response!
        }
      }]
    };
  }
  
  // 分支匹配
  const branchMatchResult = await branchManager.matchBranch(userId, message);
  
  // 处理分支创建
  let branchId = branchMatchResult.branchId;
  if (branchMatchResult.isNew) {
    branchId = await branchManager.createBranch(userId, branchMatchResult.feature);
  }
  
  // 检测重复意图
  const duplicateResult = await duplicateIntentDetector.handleDuplicateIntent(userId, message, branchId);
  
  if (duplicateResult.isDuplicate && duplicateResult.response) {
    // 重复问题，直接返回历史结论
    return {
      choices: [{
        message: {
          role: 'assistant',
          content: duplicateResult.response
        }
      }]
    };
  }
  
  // 锁定当前分支
  branchManager.lockBranch(branchId!);
  
  // 提取和更新用户偏好（已在并行步骤中完成）
  
  // 获取用户偏好
  const userPreference = canMemory ? await memorySystem.getUserPreference(userId) : { globalPreference: {} };
  
  // 生成偏好提示
  const preferencePrompt = preferenceExtractor.generatePreferencePrompt(userPreference.globalPreference as any);
  
  // 获取系统提示（支持场景智能匹配）
  const systemPrompt = getSystemPrompt(templateId, message);
  
  // 合并技能组合内容（放在基础提示词之前）
  const skillSection = skillPrompt ? `## 角色定义\n${skillPrompt}\n\n` : '';
  
  // 注入当前北京时间，让 LLM 能准确回答时间相关问题
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'long' })
  const timeContext = `\n\n【当前时间】${now}（北京时间，准确可靠，可直接引用）`
  const enhancedSystemPrompt = skillSection + systemPrompt + timeContext + (preferencePrompt ? `\n\n用户偏好：${preferencePrompt}` : '');
  
  // 检查是否是模糊输入
  const ambiguousResult = handleAmbiguousInput(message);
  
  // 如果是模糊输入，生成选项
  if (ambiguousResult.isAmbiguous && ambiguousResult.candidates.length > 1) {
    const options = ambiguousResult.candidates.map((candidate, index) => `${index + 1}. ${candidate}`).join('\n');
    
    // 生成带有选项的响应
    let responseContent = `我注意到您的输入可能存在一些歧义，以下是我推测的几种可能含义，请选择您想表达的选项：\n\n${options}\n\n或者您可以重新输入更清晰的内容。`;
    
    // 检查并修正响应
    const processedResponse = preferenceInterceptor.processResponse(responseContent, userPreference.globalPreference as any);
    
    return {
      choices: [{
        message: {
          role: 'assistant',
          content: processedResponse.corrected
        }
      }]
    };
  }
  
  // 检查是否是股票查询
  const stockKeywords = ['上证指数', '深证', '创业板', '股票', '指数', '比亚迪', '茅台', '宁德时代', '腾讯', '阿里巴巴', '苹果', '特斯拉', '万丰奥威', '中国平安', '招商银行', '工商银行', '西部超导', '康比特'];
  const isStockQuery = canSearch && stockKeywords.some(keyword => message.includes(keyword));
  const needsSearch = canSearch && shouldSearch(message);

  // 股票查询（串行，因为需要先拿到数据）
  let stockData = '';
  if (isStockQuery) {
    stockData = await processStockQuery(message);
  }

  let finalResponse;

  t0 = Date.now();
  if (needsSearch || stockData) {
    const searchResult = await performSearchIfNeeded(message);
    timings.webSearch = Date.now() - t0;

    // 搜索失败时，不触发 Agent，直接让 LLM 回答（避免 Agent 报错）
    if (searchResult.failed && !stockData) {
      logger.warn('AGENT', '搜索失败或无结果，跳过搜索，由 LLM 直接回答');
      const llmStart = Date.now();
      finalResponse = await callLLM({ message: message + knowledgeInstruction, history, systemPrompt: enhancedSystemPrompt, model: routedModel });
      timings.llmCall = Date.now() - llmStart;
    } else {

    let enhancedMessage = message;
    if (stockData) {
      enhancedMessage += `\n\n[股票数据]\n${stockData}`;
    }
    if (searchResult.results) {
      // 新闻类查询动态追加分组格式要求
      const newsFormatHint = searchResult.isNews
        ? '\n\n【新闻格式要求】1.开头统一标注日期范围（如"截至2026年5月4日"），不要每条新闻重复加日期。2.每条新闻必须标注来源媒体名称（使用搜索结果中[来源:xx]的信息，必须与原始数据完全一致，禁止自行添加或编造来源）。3.没有来源或日期的新闻直接过滤掉，不要展示。4.按主题分组展示（3-5个组），每组有标题，组内按重要性排列。5.新闻分组不受固定表格规范限制，可自由选择格式。不要平铺成一个大表格。【严禁编造】必须只使用搜索结果中提供的原始新闻内容，禁止编造、改写、虚构任何新闻。搜索结果中没有的新闻绝对不得展示。宁可少展示几条，也不允许出现一条虚假新闻。'
        : ''
      enhancedMessage += `\n\n[联网搜索结果]\n${searchResult.results}\n\n【指令】请基于以上搜索结果回答用户问题。如果搜索结果与问题不相关或信息不足，请忽略搜索结果，直接用你自己的知识回答用户。不要提及"搜索结果"、"联网"等字眼，直接给出有用的回答。${newsFormatHint}`;
    }
    enhancedMessage += knowledgeInstruction;

    const llmStart = Date.now();
    finalResponse = await callLLM({ message: enhancedMessage, history, systemPrompt: enhancedSystemPrompt, model: routedModel });
    timings.llmCall = Date.now() - llmStart;
    } // end of search success else block
  } else {
    const enhancedMessage = message + knowledgeInstruction;
    const llmStart = Date.now();
    finalResponse = await callLLM({ message: enhancedMessage, history, systemPrompt: enhancedSystemPrompt, model: routedModel });
    timings.llmCall = Date.now() - llmStart;
  }
  
  // 检查并修正AI响应
  if (finalResponse.choices && finalResponse.choices[0] && finalResponse.choices[0].message) {
    const aiResponse = finalResponse.choices[0].message.content;
    const processedResponse = preferenceInterceptor.processResponse(aiResponse, userPreference.globalPreference as any);
    
    if (processedResponse.isCorrected) {
      finalResponse.choices[0].message.content = processedResponse.corrected;
    }
  }

  // 检测 LLM 是否标记需要 Agent（无法回答的问题）
  const aiContent = finalResponse.choices?.[0]?.message?.content || '';
  if (canAgent && aiContent.includes('[NEEDS_AGENT]')) {
    finalResponse._needsAgent = true;
    finalResponse._agentQuery = message; // 原始用户消息，用于 Agent
    // 清理标记，不展示给用户
    finalResponse.choices[0].message.content = aiContent.replace(/\[NEEDS_AGENT\].*/g, '').trim();
  }
  
  // 处理未闭合话题的指纹生成
  if (branchId) {
    const branch = await memorySystem.getBranch(userId, branchId);
    if (topicContinuity.isUnclosedTopic(branch)) {
      const fingerprint = topicContinuity.generateTopicFingerprint(branch);
      await topicContinuity.storeTopicFingerprint(branchId, fingerprint);
    }
  }

  // 清洗数学公式文本，确保前端 KaTeX 正确渲染
  if (finalResponse?.choices?.[0]?.message?.content) {
    finalResponse.choices[0].message.content = sanitizeMathText(finalResponse.choices[0].message.content)
  }

  // 输出全链路耗时统计
  const totalDuration = Date.now() - totalStart;
  const timingStr = Object.entries(timings).map(([k, v]) => `${k}:${v}ms`).join(', ');
  logger.info('CHAT', `响应完成 总耗时:${totalDuration}ms | ${timingStr}`);

  return finalResponse
}

// 添加搜索功能
const performSearchIfNeeded = async (message: string): Promise<{ results: string; failed: boolean; isNews: boolean }> => {
  if (shouldSearch(message)) {
    try {
      // 使用API管理中心调用搜索API（Tavily）
      // 根据用户请求动态调整返回条数
      // 搜索词清洗：去掉数量词噪音（"20条""15个"等），只保留真正的搜索内容
      let searchQuery = message.replace(/\d+\s*[条个篇张份]/g, '').trim()

      let maxResults = 5
      const countMatch = message.match(/(\d+)\s*[条个篇]/)
      if (countMatch) {
        maxResults = Math.min(parseInt(countMatch[1]), 20) // 最多请求20条
      }
      // 新闻类查询自动切换到 news 模式（按时间排序，只返回一天内）
      const newsKeywords = ['新闻', '热点', '大事', '时事', '头条']
      const isNews = newsKeywords.some(k => message.includes(k))
      const topic = isNews ? 'news' : 'general'
      const timeRange = isNews ? 'day' : undefined
      const searchDepth = (isNews && maxResults > 10) ? 'advanced' : 'basic'
      const searchResult = await callAPI('tavily-search', 'search', { query: searchQuery, max_results: maxResults, topic, time_range: timeRange, search_depth: searchDepth })
      
      // Tavily 返回的 answer 是直接回答（适合天气、汇率等简单查询）
      // 新闻类优先用 results 列表（需要逐条展示、分组、标注来源）
      if (searchResult.answer && searchResult.answer.trim().length > 0 && !isNews) {
        return { results: searchResult.answer, failed: false, isNews }
      }
      
      const searchResults = searchResult.results || []
      const processed = processSearchResults(searchResults, message)
      // 搜索成功但无结果，也算失败
      if (!processed || processed.trim().length === 0) {
        return { results: '', failed: true, isNews }
      }
      return { results: processed, failed: false, isNews }
    } catch (error) {
      logger.error('AGENT', '搜索出错', { extra: { error: String(error) } })
      return { results: '', failed: true, isNews: false }
    }
  }
  
  return { results: '', failed: false, isNews: false }
}

export async function POST(request: NextRequest) {
  // 限流检查：每分钟最多 30 次请求
  const rlKey = getRateLimitKey(request, 'chat')
  const { limited, retryAfterMs } = rateLimit(rlKey, { windowMs: 60000, maxRequests: 30 })
  if (limited) {
    return NextResponse.json(
      { error: `请求过于频繁，请 ${Math.ceil(retryAfterMs / 1000)} 秒后重试` },
      { status: 429 }
    )
  }

  try {
    const { message, history, userId = 'default', model, source = 'chat', templateId, conversationId, stream = false } = await request.json()

    // 流式输出模式（SSE）
    if (stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const write = (data: string) => {
            controller.enqueue(encoder.encode(data));
          };

          try {
            // 先发送空内容消息用于前端创建消息对象
            write(`data: ${JSON.stringify({ type: 'start', id: Date.now().toString() })}\n\n`);

            // 调用流式处理（只处理 LLM 调用，跳过沉淀等后处理）
            const allModels = modelStore.getAll();
            const routedModel = model || 'deepseek-v4-flash';
            const modelConfig = allModels.find((m: any) => m.modelId === routedModel);

            // 获取系统提示
            const systemPrompt = getSystemPrompt(templateId, message);
            
            // 获取技能组合内容
            let skillPrompt = '';
            if (!model) {
              const promptResult = await promptService.generate(message);
              skillPrompt = promptResult.systemPrompt;
            }
            
            const skillSection = skillPrompt ? `## 角色定义\n${skillPrompt}\n\n` : '';
            const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'long' })
            const timeContext = `\n\n【当前时间】${now}（北京时间，准确可靠，可直接引用）`;
            const enhancedSystemPrompt = skillSection + systemPrompt + timeContext;

            await callLLMStream(
              { message, history: history || [], systemPrompt: enhancedSystemPrompt, model: routedModel },
              { write }
            );
          } catch (error: any) {
            console.error('流式输出错误:', error);
            write(`data: ${JSON.stringify({ type: 'error', error: error.message || '处理失败' })}\n\n`);
          } finally {
            try {
              controller.close();
            } catch (e) {
              // 已关闭
            }
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // 非流式模式（原有逻辑）
    const data = await processMessageWithSearch(message, history, userId, model, source, templateId, conversationId)
    
    // 异步触发对话沉淀（不阻塞响应）
    if (data?.choices?.[0]?.message?.content) {
      learnFromConversation(message, data.choices[0].message.content)
        .then(r => { if (r.learned) logger.info('RAG', '对话已沉淀到知识库') })
        .catch(e => logger.error('RAG', '对话沉淀失败', { extra: { error: e?.message } }))
    }
    
    return NextResponse.json(data)
  } catch (error) {
    logger.error('SYSTEM', '聊天请求处理异常', { extra: { error: String(error) } })
    const message = error instanceof Error ? error.message : '未知错误'
    const isTimeout = message.includes('timeout') || message.includes('Timeout') || message.includes('aborted')
    const isAPIError = message.includes('API') || message.includes('api')
    let userMessage = '请求处理失败，请稍后再试。'
    if (isTimeout) userMessage = '请求超时，请检查网络后重试。'
    else if (isAPIError) userMessage = `AI 服务暂时不可用：${message}`
    return NextResponse.json(
      { error: userMessage },
      { status: 500 }
    )
  }
}
