// 拼写纠正服务 - 处理同音错字和手滑错字

// 预定义白名单（股票、公司、财税术语等专有名词）
const WHITELIST = {
  // 股票名称
  '康比特': ['康比特'],
  '比亚迪': ['比亚迪'],
  '茅台': ['茅台'],
  '宁德时代': ['宁德时代'],
  '西部超导': ['西部超导'],
  '万丰奥威': ['万丰奥威'],
  // 公司名称
  '引信技术': ['引信技术', '引信', '露丝'],
  '引信公司': ['引信公司', '引信'],
  // 财税术语
  '增值税': ['增值税'],
  '企业所得税': ['企业所得税'],
  '个人所得税': ['个人所得税'],
  // 通用高频词
  '吃饭': ['吃饭'],
  '你好': ['你好'],
  '谢谢': ['谢谢'],
  '再见': ['再见']
};

// 拼音映射表（简化版，实际项目中可使用更完整的拼音库）
const PINYIN_MAP: Record<string, string> = {
  '康': 'kang', '逼': 'bi', '特': 'te',
  '吃': 'chi', '犯': 'fan', '饭': 'fan',
  '比': 'bi', '亚': 'ya', '迪': 'di',
  '茅': 'mao', '台': 'tai',
  '宁': 'ning', '德': 'de', '时': 'shi', '代': 'dai',
  '西': 'xi', '部': 'bu', '超': 'chao', '导': 'dao',
  '万': 'wan', '丰': 'feng', '奥': 'ao', '威': 'wei',
  '引': 'yin', '信': 'xin', '技': 'ji', '术': 'shu',
  '财': 'cai',
  '增': 'zeng', '值': 'zhi', '税': 'shui',
  '企': 'qi', '业': 'ye', '所': 'suo', '得': 'de',
  '个': 'ge', '人': 'ren',
  '你': 'ni', '好': 'hao',
  '谢': 'xie',
  '再': 'zai', '见': 'jian'
};

// 计算编辑距离（Levenshtein距离）
function calculateEditDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // 删除
        dp[i][j - 1] + 1,      // 插入
        dp[i - 1][j - 1] + cost // 替换
      );
    }
  }
  
  return dp[m][n];
}

// 汉字转拼音（简化版）
function 汉字转拼音(text: string): string {
  return text.split('').map(char => PINYIN_MAP[char] || char).join('');
}

// 检查语义是否通顺（简化版，实际项目中可使用更复杂的语义模型）
function isSemanticallyValid(text: string): boolean {
  // 简单的语义检查，排除明显不通的组合
  const invalidCombinations = ['康逼特', '吃犯'];
  return !invalidCombinations.includes(text);
}

// 拼写纠正主函数
export function correctSpelling(input: string): string {
  // 1. 拼音归一化
  const inputPinyin = 汉字转拼音(input);
  
  // 2. 同音筛选
  const candidates: string[] = [];
  
  // 从白名单中筛选同音词
  for (const [correctWord, variations] of Object.entries(WHITELIST)) {
    for (const variation of variations) {
      const candidatePinyin = 汉字转拼音(variation);
      if (candidatePinyin === inputPinyin) {
        candidates.push(correctWord);
      }
    }
  }
  
  // 3. 编辑距离计算
  let bestCandidate = input;
  let minEditDistance = Infinity;
  
  for (const candidate of candidates) {
    const distance = calculateEditDistance(input, candidate);
    if (distance < minEditDistance && distance <= 1) { // 只认可修改1个字以内的笔误
      minEditDistance = distance;
      bestCandidate = candidate;
    }
  }
  
  // 4. 候选匹配兜底
  if (candidates.length > 0 && minEditDistance <= 1) {
    // 5. 语义校验
    if (isSemanticallyValid(bestCandidate)) {
      return bestCandidate;
    }
  }
  
  // 如果没有找到合适的纠正，返回原输入
  return input;
}

// 获取可能的候选词
export function getCandidateWords(input: string): string[] {
  // 1. 拼音归一化
  const inputPinyin = 汉字转拼音(input);
  
  // 2. 同音筛选
  const candidates: string[] = [];
  
  // 从白名单中筛选同音词
  for (const [correctWord, variations] of Object.entries(WHITELIST)) {
    for (const variation of variations) {
      const candidatePinyin = 汉字转拼音(variation);
      // 允许部分匹配，增加模糊匹配能力
      if (candidatePinyin.includes(inputPinyin) || inputPinyin.includes(candidatePinyin)) {
        candidates.push(correctWord);
      }
    }
  }
  
  // 3. 编辑距离计算，保留编辑距离较小的候选词
  const filteredCandidates: { word: string, distance: number }[] = [];
  
  for (const candidate of candidates) {
    const distance = calculateEditDistance(input, candidate);
    if (distance <= 2) { // 允许修改2个字以内的误差
      filteredCandidates.push({ word: candidate, distance });
    }
  }
  
  // 按编辑距离排序，返回前5个候选词
  return filteredCandidates
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
    .map(item => item.word);
}

// 处理模糊输入，生成选项
export function handleAmbiguousInput(input: string): { isAmbiguous: boolean, candidates: string[] } {
  const candidates = getCandidateWords(input);
  
  // 如果候选词数量大于1，认为是模糊输入
  if (candidates.length > 1) {
    return { isAmbiguous: true, candidates };
  }
  
  return { isAmbiguous: false, candidates };
}

// 批量纠正文本中的错误
export function correctText(text: string): string {
  // 简单的分词处理（实际项目中可使用更复杂的分词库）
  const words = text.split(/\s+/);
  const correctedWords = words.map(word => correctSpelling(word));
  return correctedWords.join(' ');
}
