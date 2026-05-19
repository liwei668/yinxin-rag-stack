/**
 * 股票数据获取模块
 * 功能：股票搜索、实时行情、K线历史数据
 * 数据来源：新浪财经免费接口
 */

// ==================== 类型定义 ====================

export interface StockInfo {
  code: string;        // 股票代码
  name: string;        // 股票名称
  market: string;      // 市场：sh(上海)、sz(深圳)
  fullName?: string;   // 公司全称
}

export interface StockQuote {
  code: string;
  name: string;
  price: number;       // 当前价
  open: number;        // 开盘价
  close: number;       // 昨收
  high: number;        // 最高
  low: number;         // 最低
  volume: number;      // 成交量
  amount: number;      // 成交额
  time: string;        // 更新时间
}

export interface KLineData {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

// 基本面数据
export interface StockFundamentals {
  code: string;
  name: string;
  pe: number;           // 市盈率
  pb: number;           // 市净率
  roe: number;          // 净资产收益率
  totalMarketValue: number;  // 总市值（亿）
  circulatingMarketValue: number; // 流通市值（亿）
  revenueGrowth: number;      // 营收增长率
  profitGrowth: number;       // 净利润增长率
  grossMargin: number;        // 毛利率
  netMargin: number;          // 净利率
  debtRatio: number;          // 资产负债率
}

// 资金流向数据
export interface MoneyFlow {
  code: string;
  name: string;
  mainNetInflow: number;      // 主力净流入（万）
  retailNetInflow: number;    // 散户净流入（万）
  superLargeNetInflow: number; // 超大单净流入（万）
  largeNetInflow: number;     // 大单净流入（万）
  mediumNetInflow: number;    // 中单净流入（万）
  smallNetInflow: number;     // 小单净流入（万）
  date: string;
}

// ==================== 缓存配置 ====================

const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存
const cache = new Map<string, { data: any; expire: number }>();

function getCached<T>(key: string): T | null {
  const item = cache.get(key);
  if (item && item.expire > Date.now()) {
    return item.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, expire: Date.now() + CACHE_TTL });
}

// ==================== 股票名称映射表 ====================

// 常见股票名称到代码的映射（解决搜索接口不可用的问题）
const STOCK_NAME_MAP: Record<string, string> = {
  // 白酒
  '贵州茅台': '600519', '茅台': '600519',
  '五粮液': '000858',
  '泸州老窖': '000568',
  '洋河股份': '002304',
  '山西汾酒': '600809',
  '酒鬼酒': '000799',
  '水井坊': '600779',
  '古井贡酒': '000596',
  
  // 新能源
  '宁德时代': '300750', '宁德': '300750',
  '比亚迪': '002594',
  '隆基绿能': '601012', '隆基': '601012',
  '通威股份': '600438',
  '亿纬锂能': '300014',
  '天齐锂业': '002466',
  '赣锋锂业': '002460',
  
  // 金融
  '中国平安': '601318', '平安': '601318',
  '招商银行': '600036', '招行': '600036',
  '工商银行': '601398', '工行': '601398',
  '建设银行': '601939', '建行': '601939',
  '农业银行': '601288', '农行': '601288',
  '中国银行': '601988',
  '交通银行': '601328',
  '浦发银行': '600000',
  '民生银行': '600016',
  '兴业银行': '601166',
  '中信证券': '600030',
  '华泰证券': '601688',
  '东方财富': '300059',
  
  // 科技
  '腾讯控股': '00700', '腾讯': '00700',
  '阿里巴巴': '09988', '阿里': '09988',
  '美团': '03690',
  '京东': '09618',
  '小米集团': '01810', '小米': '01810',
  '百度': '09888',
  '网易': '09999',
  '快手': '01024',
  '哔哩哔哩': '09626', 'B站': '09626',
  
  // A股科技
  '立讯精密': '002475',
  '京东方A': '000725',
  'TCL科技': '002100',
  '歌尔股份': '002241',
  '三安光电': '600703',
  '韦尔股份': '603501',
  '兆易创新': '603986',
  '北方华创': '002371',
  '中芯国际': '688981',
  '寒武纪': '688256',
  '科大讯飞': '002230',
  '海康威视': '002415',
  '大华股份': '002236',
  
  // 医药
  '恒瑞医药': '600276',
  '药明康德': '603259',
  '迈瑞医疗': '300760',
  '片仔癀': '600436',
  '云南白药': '000538',
  '长春高新': '000661',
  '智飞生物': '300122',
  '沃森生物': '300142',
  '复星医药': '600196',
  '爱尔眼科': '300015',
  '通策医疗': '600763',
  
  // 消费
  '伊利股份': '600887', '伊利': '600887',
  '海天味业': '603288', '海天': '603288',
  '金龙鱼': '300999',
  '双汇发展': '000895',
  '安井食品': '603345',
  '涪陵榨菜': '002507',
  '中国中免': '601888',
  
  // 汽车
  '长城汽车': '601633',
  '上汽集团': '600104',
  '广汽集团': '601238',
  '长安汽车': '000625',
  '赛力斯': '601127',
  '理想汽车': '02015', '理想': '02015',
  '小鹏汽车': '09868', '小鹏': '09868',
  '蔚来': '09866',
  
  // 地产
  '万科A': '000002', '万科': '000002',
  '保利发展': '600048',
  '招商蛇口': '001979',
  '金地集团': '600383',
  
  // 其他
  '中国石油': '601857',
  '中国石化': '600028',
  '中国神华': '601088',
  '长江电力': '600900',
  '中国建筑': '601668',
  '中国中铁': '601390',
  '中国交建': '601800',
  '中国电建': '601669',
  '中国核电': '601985',
  '中国广核': '003816',
  '三峡能源': '600905',
};

// ==================== 股票搜索 ====================

/**
 * 搜索股票（名称→代码映射）
 * 支持输入：股票代码、股票简称、公司全称
 * 使用东方财富搜索接口
 */
export async function searchStock(keyword: string): Promise<StockInfo | null> {
  const trimmed = keyword.trim();
  
  // 1. 如果是纯数字6位，直接当作代码处理
  if (/^\d{6}$/.test(trimmed)) {
    const quote = await fetchQuote(trimmed);
    if (quote) {
      return {
        code: trimmed,
        name: quote.name,
        market: trimmed.startsWith('6') ? 'sh' : 'sz',
      };
    }
    return null;
  }
  
  // 2. 调用东方财富搜索接口
  try {
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(trimmed)}&type=14&token=D43BF722C8E33BCE903FB4D3A3B8F5CE`;
    console.log('[股票搜索] 请求URL:', url);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://quote.eastmoney.com/',
      },
    });
    
    const text = await response.text();
    console.log('[股票搜索] 响应:', text.substring(0, 300));
    
    // 解析JSON
    const data = JSON.parse(text);
    
    if (data?.QuotationCodeTable?.Data && data.QuotationCodeTable.Data.length > 0) {
      const first = data.QuotationCodeTable.Data[0];
      const code = first.Code;
      const name = first.Name;
      
      // 判断市场
      let market = 'sh';
      if (code.startsWith('0') || code.startsWith('3')) {
        market = 'sz';
      }
      
      console.log('[股票搜索] 找到:', name, code);
      
      return {
        code,
        name,
        market,
      };
    }
    
    console.log('[股票搜索] 未找到结果');
    return null;
    
  } catch (error) {
    console.error('[股票搜索] 失败:', error);
    
    // 降级：尝试使用内置映射表
    const mappedCode = STOCK_NAME_MAP[trimmed];
    if (mappedCode) {
      console.log('[股票搜索] 映射表命中:', trimmed, '->', mappedCode);
      const quote = await fetchQuote(mappedCode);
      if (quote) {
        return {
          code: mappedCode,
          name: quote.name,
          market: mappedCode.startsWith('6') ? 'sh' : 'sz',
        };
      }
    }
    
    return null;
  }
}

// ==================== 实时行情 ====================

/**
 * 获取股票实时行情
 */
export async function fetchQuote(code: string): Promise<StockQuote | null> {
  // 检查缓存
  const cacheKey = `quote_${code}`;
  const cached = getCached<StockQuote>(cacheKey);
  if (cached) {
    console.log('[行情] 使用缓存:', code);
    return cached;
  }
  
  try {
    // 判断市场前缀
    const prefix = getMarketPrefix(code);
    const url = `https://hq.sinajs.cn/list=${prefix}${code}`;
    console.log('[行情] 请求URL:', url);
    
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://finance.sina.com.cn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    // 获取 ArrayBuffer 然后用 GBK 解码
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('gbk');
    const text = decoder.decode(buffer);
    console.log('[行情] 响应:', text.substring(0, 200));
    
    // 解析返回结果
    // 格式：var hq_str_sh600519="贵州茅台,1800.00,1790.00,1815.00,1820.00,1790.00,1815.00,1816.00,12345678,12345678900,...";
    const match = text.match(/="([^"]+)"/);
    if (!match || !match[1]) {
      console.log('[行情] 未匹配到数据');
      return null;
    }
    
    const parts = match[1].split(',');
    if (parts.length < 32) {
      console.log('[行情] 数据字段不足:', parts.length);
      return null;
    }
    
    // 解析价格（注意：当前价可能为0，需要用昨收代替）
    let currentPrice = parseFloat(parts[3]) || 0;
    const closePrice = parseFloat(parts[2]) || 0;
    
    // 如果当前价为0（盘前/停牌），使用昨收价
    if (currentPrice === 0) {
      currentPrice = closePrice;
      console.log('[行情] 当前价为0，使用昨收价:', closePrice);
    }
    
    const quote: StockQuote = {
      code,
      name: parts[0],
      open: parseFloat(parts[1]) || closePrice,
      close: closePrice,
      price: currentPrice,
      high: parseFloat(parts[4]) || currentPrice,
      low: parseFloat(parts[5]) || currentPrice,
      volume: parseInt(parts[8]) || 0,
      amount: parseFloat(parts[9]) || 0,
      time: `${parts[30]} ${parts[31]}`,
    };
    
    console.log('[行情] 解析结果:', quote.name, '价格:', quote.price);
    
    setCache(cacheKey, quote);
    return quote;
    
  } catch (error) {
    console.error('[行情] 获取失败:', error);
    return null;
  }
}

// ==================== K线历史数据 ====================

/**
 * 获取K线历史数据（近120个交易日）
 */
export async function fetchKLineData(code: string): Promise<KLineData[]> {
  // 检查缓存
  const cacheKey = `kline_${code}`;
  const cached = getCached<KLineData[]>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const prefix = getMarketPrefix(code);
    
    // 新浪财经历史K线接口
    // 参数：symbol=股票代码，scale=240（日线），datalen=120（120天）
    const url = `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=${prefix}${code}&scale=240&datalen=120`;
    
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://finance.sina.com.cn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    const data = await response.json();
    
    if (!data || !Array.isArray(data)) {
      console.log('[K线] 数据为空或格式错误');
      return [];
    }
    
    const klines: KLineData[] = data.map((item: any) => ({
      date: item.day || item.date,
      open: parseFloat(item.open) || 0,
      close: parseFloat(item.close) || 0,
      high: parseFloat(item.high) || 0,
      low: parseFloat(item.low) || 0,
      volume: parseInt(item.volume) || 0,
    })).filter((k: KLineData) => k.close > 0); // 过滤无效数据
    
    console.log('[K线] 获取到', klines.length, '条数据');
    
    setCache(cacheKey, klines);
    return klines;
    
  } catch (error) {
    console.error('[K线] 获取失败:', error);
    return [];
  }
}

// ==================== 辅助函数 ====================

/**
 * 根据股票代码判断市场前缀
 */
function getMarketPrefix(code: string): string {
  // 6开头：上海
  // 0、3开头：深圳
  // 688开头：科创板（上海）
  if (code.startsWith('6')) {
    return 'sh';
  }
  return 'sz';
}

/**
 * 批量获取热门股票列表（用于首页展示）
 */
export async function fetchHotStocks(): Promise<StockInfo[]> {
  // 热门股票代码列表
  const hotCodes = [
    '600519', // 贵州茅台
    '300750', // 宁德时代
    '002594', // 比亚迪
    '601318', // 中国平安
    '600036', // 招商银行
  ];
  
  const results: StockInfo[] = [];
  
  for (const code of hotCodes) {
    const quote = await fetchQuote(code);
    if (quote) {
      results.push({
        code,
        name: quote.name,
        market: code.startsWith('6') ? 'sh' : 'sz',
      });
    }
  }
  
  return results;
}

// ==================== 基本面数据 ====================

/**
 * 获取股票基本面数据（PE/PB/ROE等）
 */
export async function fetchFundamentals(code: string): Promise<StockFundamentals | null> {
  const cacheKey = `fund_${code}`;
  const cached = getCached<StockFundamentals>(cacheKey);
  if (cached) return cached;
  
  try {
    const prefix = getMarketPrefix(code);
    // 新浪财务摘要接口
    const url = `https://vip.stock.finance.sina.com.cn/corp/go.php/vFD_FinanceSummary/stockid/${code}/displaytype/4.phtml`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.sina.com.cn/',
      },
    });
    
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('gbk');
    const html = decoder.decode(buffer);
    
    // 解析基本面数据（简化版，从HTML中提取关键指标）
    const fundamentals: StockFundamentals = {
      code,
      name: '',
      pe: extractNumber(html, '市盈率') || 0,
      pb: extractNumber(html, '市净率') || 0,
      roe: extractNumber(html, '净资产收益率') || 0,
      totalMarketValue: 0,
      circulatingMarketValue: 0,
      revenueGrowth: 0,
      profitGrowth: 0,
      grossMargin: extractNumber(html, '毛利率') || 0,
      netMargin: extractNumber(html, '净利率') || 0,
      debtRatio: extractNumber(html, '资产负债率') || 0,
    };
    
    // 获取股票名称
    const quote = await fetchQuote(code);
    if (quote) {
      fundamentals.name = quote.name;
    }
    
    setCache(cacheKey, fundamentals);
    return fundamentals;
    
  } catch (error) {
    console.error('[基本面] 获取失败:', error);
    return null;
  }
}

/**
 * 从HTML中提取数值
 */
function extractNumber(html: string, keyword: string): number | null {
  try {
    const regex = new RegExp(`${keyword}[\\s\\S]*?([\\d.]+)`, 'i');
    const match = html.match(regex);
    if (match && match[1]) {
      return parseFloat(match[1]);
    }
    return null;
  } catch {
    return null;
  }
}

// ==================== 资金流向数据 ====================

/**
 * 获取资金流向数据
 */
export async function fetchMoneyFlow(code: string): Promise<MoneyFlow | null> {
  const cacheKey = `flow_${code}`;
  const cached = getCached<MoneyFlow>(cacheKey);
  if (cached) return cached;
  
  try {
    const prefix = getMarketPrefix(code);
    // 东方财富资金流向接口
    const url = `https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=0&klt=1&secid=${prefix === 'sh' ? '1' : '0'}.${code}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://quote.eastmoney.com/',
      },
    });
    
    const data = await response.json();
    
    if (data?.data?.klines && data.data.klines.length > 0) {
      // 取最新一天的数据
      const latest = data.data.klines[0].split(',');
      
      const flow: MoneyFlow = {
        code,
        name: '',
        mainNetInflow: parseFloat(latest[1]) || 0,      // 主力净流入
        retailNetInflow: parseFloat(latest[5]) || 0,     // 散户净流入
        superLargeNetInflow: parseFloat(latest[2]) || 0, // 超大单
        largeNetInflow: parseFloat(latest[3]) || 0,      // 大单
        mediumNetInflow: parseFloat(latest[4]) || 0,     // 中单
        smallNetInflow: parseFloat(latest[6]) || 0,      // 小单
        date: latest[0],
      };
      
      // 获取股票名称
      const quote = await fetchQuote(code);
      if (quote) {
        flow.name = quote.name;
      }
      
      setCache(cacheKey, flow);
      return flow;
    }
    
    return null;
    
  } catch (error) {
    console.error('[资金流向] 获取失败:', error);
    return null;
  }
}

// ==================== 综合数据获取 ====================

/**
 * 获取股票完整数据（用于分析）
 */
export async function fetchStockCompleteData(code: string) {
  const [quote, klines, fundamentals, moneyFlow] = await Promise.all([
    fetchQuote(code),
    fetchKLineData(code),
    fetchFundamentals(code),
    fetchMoneyFlow(code),
  ]);
  
  return {
    quote,
    klines,
    fundamentals,
    moneyFlow,
  };
}
