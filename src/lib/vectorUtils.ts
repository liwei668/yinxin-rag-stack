// 向量相似度计算工具

// 简单的文本向量化函数（基于词频）
export function textToVector(text: string): number[] {
  const words = text.toLowerCase().split(/\s+/);
  const wordSet = new Set(words);
  const wordMap = new Map<string, number>();
  
  // 构建词汇表
  wordSet.forEach(word => wordMap.set(word, wordMap.size));
  
  // 生成向量
  const vector: number[] = new Array(wordMap.size).fill(0);
  words.forEach(word => {
    const index = wordMap.get(word);
    if (index !== undefined) {
      vector[index]++;
    }
  });
  
  return vector;
}

// 余弦相似度计算
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  // 确保向量长度相同
  const maxLength = Math.max(vec1.length, vec2.length);
  const paddedVec1 = [...vec1];
  const paddedVec2 = [...vec2];
  
  while (paddedVec1.length < maxLength) paddedVec1.push(0);
  while (paddedVec2.length < maxLength) paddedVec2.push(0);
  
  // 计算点积
  let dotProduct = 0;
  for (let i = 0; i < maxLength; i++) {
    dotProduct += paddedVec1[i] * paddedVec2[i];
  }
  
  // 计算模长
  const magnitude1 = Math.sqrt(paddedVec1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(paddedVec2.reduce((sum, val) => sum + val * val, 0));
  
  // 避免除以零
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }
  
  return dotProduct / (magnitude1 * magnitude2);
}

// 三维特征相似度计算
export function calculateFeatureSimilarity(
  feature1: { subject: string; event: string; request: string },
  feature2: { subject: string; event: string; request: string }
): number {
  const subjectSimilarity = cosineSimilarity(
    textToVector(feature1.subject),
    textToVector(feature2.subject)
  );
  
  const eventSimilarity = cosineSimilarity(
    textToVector(feature1.event),
    textToVector(feature2.event)
  );
  
  const requestSimilarity = cosineSimilarity(
    textToVector(feature1.request),
    textToVector(feature2.request)
  );
  
  // 三个维度权重相同
  return (subjectSimilarity + eventSimilarity + requestSimilarity) / 3;
}
