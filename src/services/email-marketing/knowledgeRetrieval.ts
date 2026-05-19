// 邮件系统的知识库检索服务
// 使用 DeepSeek 嵌入接口进行向量检索
import path from 'path';
import fs from 'fs';
import https from 'https';

// 知识库文件路径
const KNOWLEDGE_BASE_PATH = path.join(process.cwd(), 'data', 'knowledge-base.json');

// DeepSeek API配置
interface DeepSeekConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

// 知识库文档接口
interface KnowledgeDocument {
  id: string;
  content: string;
  metadata: {
    id?: string;
    fileName?: string;
    categories?: string[];
    fileType?: string;
    uploadDate?: string;
    [key: string]: any;
  };
  embedding?: number[];
}

// 检索结果接口
interface RetrievalResult {
  content: string;
  score: number;
  metadata: any;
}

// 加载DeepSeek配置
function getDeepSeekConfig(): DeepSeekConfig {
  try {
    const apisPath = path.join(process.cwd(), 'data', 'apis.json');
    if (fs.existsSync(apisPath)) {
      const data = fs.readFileSync(apisPath, 'utf8');
      const apis = JSON.parse(data);
      const deepseekApi = apis.find((a: any) => 
        a.api_id === 'deepseek-api' || 
        a.name?.toLowerCase().includes('deepseek')
      );
      if (deepseekApi?.apiKey) {
        return {
          apiKey: deepseekApi.apiKey,
          baseURL: 'https://api.deepseek.com',
          model: 'deepseek-v4-flash'
        };
      }
    }
  } catch (error) {
    console.error('加载API配置失败:', error);
  }
  
  // 回退到环境变量
  return {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash'
  };
}

// 加载知识库
function loadKnowledgeBase(): KnowledgeDocument[] {
  try {
    if (fs.existsSync(KNOWLEDGE_BASE_PATH)) {
      const data = fs.readFileSync(KNOWLEDGE_BASE_PATH, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        console.log(`✅ 知识库加载成功，当前文档数: ${parsed.length}`);
        return parsed;
      }
    }
  } catch (error) {
    console.error('加载知识库失败:', error);
  }
  return [];
}

// 计算余弦相似度
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    // 如果向量长度不同，进行填充
    const maxLength = Math.max(vec1.length, vec2.length);
    while (vec1.length < maxLength) vec1.push(0);
    while (vec2.length < maxLength) vec2.push(0);
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    normA += vec1[i] * vec1[i];
    normB += vec2[i] * vec2[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator > 0 ? dotProduct / denominator : 0;
}

// 调用 DeepSeek 嵌入接口
async function generateEmbedding(text: string, config: DeepSeekConfig): Promise<number[]> {
  if (!config.apiKey) {
    throw new Error('DeepSeek API Key 未配置');
  }

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'deepseek',
      input: text
    });

    const options = {
      hostname: 'api.deepseek.com',
      port: 443,
      path: '/embeddings',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.data && json.data[0] && json.data[0].embedding) {
            resolve(json.data[0].embedding);
          } else {
            reject(new Error('嵌入接口返回格式错误'));
          }
        } catch (e) {
          reject(new Error('解析嵌入响应失败: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('嵌入请求超时'));
    });

    req.write(body);
    req.end();
  });
}

// 检索知识库
export async function retrieveKnowledge(
  query: string, 
  topK: number = 3
): Promise<RetrievalResult[]> {
  try {
    console.log('🔍 开始知识检索...');
    console.log(`查询内容: ${query.substring(0, 100)}...`);
    
    // 加载配置和知识库
    const config = getDeepSeekConfig();
    const documents = loadKnowledgeBase();
    
    if (documents.length === 0) {
      console.log('⚠️  知识库为空，跳过检索');
      return [];
    }

    // 生成查询向量
    console.log('📡 调用 DeepSeek 嵌入接口...');
    const queryEmbedding = await generateEmbedding(query, config);
    console.log(`✅ 向量生成成功，维度: ${queryEmbedding.length}`);

    // 计算相似度
    const results: RetrievalResult[] = documents
      .filter(doc => doc.embedding && doc.embedding.length > 0)
      .map(doc => ({
        content: doc.content,
        score: cosineSimilarity(queryEmbedding, doc.embedding!),
        metadata: doc.metadata
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    console.log(`✅ 检索完成，找到 ${results.length} 条相关结果`);
    
    if (results.length > 0) {
      console.log('📊 Top-3 结果:');
      results.forEach((r, i) => {
        console.log(`  ${i + 1}. [${(r.score * 100).toFixed(2)}%] ${r.content.substring(0, 80)}...`);
      });
    }

    return results;
  } catch (error: any) {
    console.error('❌ 知识检索失败:', error.message);
    return [];
  }
}

// 获取知识库统计信息
export function getKnowledgeBaseStats() {
  const documents = loadKnowledgeBase();
  return {
    totalDocuments: documents.length,
    hasEmbeddings: documents.filter(d => d.embedding && d.embedding.length > 0).length,
    categories: [...new Set(
      documents.flatMap(d => d.metadata?.categories || [])
    )]
  };
}

export default {
  retrieveKnowledge,
  getKnowledgeBaseStats
};
