// 向量数据库管理 - 使用 DashScope 嵌入 API + 文件持久化
import path from 'path';
import fs from 'fs';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';
const EMBEDDING_MODEL = 'text-embedding-v3';
const EMBEDDING_DIMENSIONS = 1024;

// 持久化文件路径
const DATA_DIR = path.join(process.cwd(), 'data');
const KNOWLEDGE_FILE = path.join(DATA_DIR, 'knowledge-base.json');

interface StoredDocument {
  id: string;
  content: string;
  metadata: any;
  embedding: number[];
}

class VectorDB {
  private documents: StoredDocument[] = [];
  private embeddingCache: Map<string, number[]> = new Map();
  private initialized = false;

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    try {
      // 确保数据目录存在
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      // 从文件加载已有数据
      if (fs.existsSync(KNOWLEDGE_FILE)) {
        const rawData = fs.readFileSync(KNOWLEDGE_FILE, 'utf8');
        const parsed = JSON.parse(rawData);
        if (Array.isArray(parsed)) {
          this.documents = parsed;
          // 重建嵌入缓存
          for (const doc of this.documents) {
            if (doc.embedding) {
              this.embeddingCache.set(doc.content, doc.embedding);
            }
          }
        }
      }

      console.log(`VectorDB 初始化成功，当前文档数: ${this.documents.length}`);
    } catch (error) {
      console.error('VectorDB 初始化失败:', error);
      this.documents = [];
    }
  }

  private saveToFile() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(this.documents, null, 2), 'utf8');
    } catch (error) {
      console.error('保存知识库文件失败:', error);
    }
  }

  async addDocuments(documents: { id: string; content: string; metadata: any }[]) {
    try {
      const embeddings = await this.generateEmbeddings(
        documents.map(doc => doc.content)
      );

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const embedding = embeddings[i];

        // 移除已存在的同 ID 文档
        this.documents = this.documents.filter(d => d.id !== doc.id);

        this.documents.push({
          id: doc.id,
          content: doc.content,
          metadata: doc.metadata,
          embedding
        });
      }

      this.saveToFile();
      console.log(`已添加 ${documents.length} 个文档到知识库，总计: ${this.documents.length}`);
    } catch (error) {
      console.error('添加文档失败:', error);
    }
  }

  async query(query: string, k: number = 3) {
    if (this.documents.length === 0) {
      return { documents: [[]], distances: [[]], metadatas: [[]] };
    }

    try {
      const queryEmbedding = await this.generateEmbeddings([query]);
      const queryVec = queryEmbedding[0];

      // 计算余弦相似度
      const scored = this.documents.map(doc => {
        const docVec = doc.embedding;
        if (!docVec || docVec.length === 0) {
          return { doc, score: 0 };
        }

        // 余弦相似度
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < queryVec.length; i++) {
          dotProduct += queryVec[i] * docVec[i];
          normA += queryVec[i] * queryVec[i];
          normB += docVec[i] * docVec[i];
        }
        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        const score = denominator > 0 ? dotProduct / denominator : 0;

        return { doc, score };
      });

      // 按相似度降序排列，取 top-k
      const topK = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, k);

      return {
        documents: [topK.map(r => r.doc.content)],
        distances: [topK.map(r => 1 - r.score)],
        metadatas: [topK.map(r => r.doc.metadata)]
      };
    } catch (error) {
      console.error('向量查询失败，降级到关键词匹配:', error);
      return this.queryByKeywords(query, k);
    }
  }

  private queryByKeywords(query: string, k: number = 3) {
    // 中文友好的关键词匹配（降级方案）
    const queryChars = [...new Set(query.replace(/[\s,.\-!?;:，。！？；：、]/g, '').split(''))].filter(c => c.length > 0);

    const results = this.documents
      .map(doc => {
        const content = doc.content;
        let matchCount = 0;
        for (const char of queryChars) {
          if (content.includes(char)) {
            matchCount++;
          }
        }
        const score = queryChars.length > 0 ? matchCount / queryChars.length : 0;
        return { doc, score };
      })
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    return {
      documents: [results.map(r => r.doc.content)],
      distances: [results.map(r => 1 - r.score)],
      metadatas: [results.map(r => r.doc.metadata)]
    };
  }

  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const allEmbeddings: number[][] = [];
    const batchSize = 25;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const uncached: { index: number; text: string }[] = [];
      const batchEmbeddings: (number[] | null)[] = new Array(batch.length).fill(null);

      // 检查缓存
      for (let j = 0; j < batch.length; j++) {
        const cacheKey = batch[j];
        const cached = this.embeddingCache.get(cacheKey);
        if (cached) {
          batchEmbeddings[j] = cached;
        } else {
          uncached.push({ index: j, text: batch[j] });
        }
      }

      // 调用 API 获取未缓存的嵌入
      if (uncached.length > 0) {
        try {
          const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${DASHSCOPE_API_KEY}`
            },
            body: JSON.stringify({
              model: EMBEDDING_MODEL,
              input: uncached.map(item => item.text),
              dimensions: EMBEDDING_DIMENSIONS,
              encoding_format: 'float'
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`DashScope API 错误 ${response.status}: ${errorText}`);
          }

          const data = await response.json();

          if (data.data && Array.isArray(data.data)) {
            for (let j = 0; j < uncached.length; j++) {
              const embedding = data.data[j]?.embedding;
              if (embedding) {
                batchEmbeddings[uncached[j].index] = embedding;
                this.embeddingCache.set(uncached[j].text, embedding);
              }
            }
          }
        } catch (error) {
          console.error('DashScope 嵌入 API 调用失败:', error);
          for (const item of uncached) {
            batchEmbeddings[item.index] = new Array(EMBEDDING_DIMENSIONS).fill(0);
          }
        }
      }

      allEmbeddings.push(...batchEmbeddings.map(e => e || new Array(EMBEDDING_DIMENSIONS).fill(0)));
    }

    return allEmbeddings;
  }

  async getDocumentCount() {
    return this.documents.length;
  }

  async clear() {
    this.documents = [];
    this.embeddingCache.clear();
    this.saveToFile();
    console.log('已清空知识库');
  }

  async getDocuments() {
    return this.documents.map(doc => ({
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata
    }));
  }

  async deleteDocument(id: string) {
    this.documents = this.documents.filter(doc => doc.id !== id);
    this.saveToFile();
  }

  async updateDocumentMetadata(id: string, metadata: any) {
    const index = this.documents.findIndex(doc => doc.id === id);
    if (index !== -1) {
      this.documents[index] = {
        ...this.documents[index],
        metadata: { ...this.documents[index].metadata, ...metadata }
      };
      this.saveToFile();
    }
  }

  // 按知识库和分类获取文档
  async getDocumentsByPath(kbId: string, categoryId?: string) {
    return this.documents
      .filter(doc => {
        if (!doc.metadata) return false;
        if (doc.metadata.kbId !== kbId) return false;
        if (categoryId && doc.metadata.categoryId !== categoryId) return false;
        return true;
      })
      .map(doc => ({
        id: doc.id,
        content: doc.content,
        metadata: doc.metadata
      }));
  }

  // 删除指定目录下的所有文档
  async deleteDocumentsByPath(kbId: string, categoryId?: string) {
    const beforeCount = this.documents.length;
    this.documents = this.documents.filter(doc => {
      if (!doc.metadata) return true;
      if (doc.metadata.kbId !== kbId) return true;
      if (categoryId && doc.metadata.categoryId !== categoryId) return true;
      return false;
    });
    const deletedCount = beforeCount - this.documents.length;
    if (deletedCount > 0) {
      this.saveToFile();
    }
    return deletedCount;
  }

  // 高级检索 - 支持多种过滤条件
  async queryWithFilter(query: string, k: number = 3, filter: {
    kbId?: string;
    categoryId?: string;
    fileName?: string;
    dateFrom?: Date;
    dateTo?: Date;
  } = {}) {
    let candidates = this.documents;

    // 按知识库过滤
    if (filter.kbId) {
      candidates = candidates.filter(doc => doc.metadata?.kbId === filter.kbId);
    }

    // 按分类过滤
    if (filter.categoryId) {
      candidates = candidates.filter(doc => doc.metadata?.categoryId === filter.categoryId);
    }

    // 按文件名过滤（模糊）
    if (filter.fileName) {
      const lowerFileName = filter.fileName.toLowerCase();
      candidates = candidates.filter(doc => 
        doc.metadata?.fileName?.toLowerCase().includes(lowerFileName)
      );
    }

    // 按时间过滤
    if (filter.dateFrom || filter.dateTo) {
      candidates = candidates.filter(doc => {
        if (!doc.metadata?.uploadDate) return false;
        const docDate = new Date(doc.metadata.uploadDate);
        
        if (filter.dateFrom && docDate < filter.dateFrom) return false;
        if (filter.dateTo && docDate > filter.dateTo) return false;
        
        return true;
      });
    }

    if (candidates.length === 0) {
      return {
        documents: [[]],
        distances: [[]],
        metadatas: [[]],
        totalDocuments: 0,
        filteredCount: 0
      };
    }

    // 在过滤后的文档中进行向量检索
    // 注意：这里简化处理，实际应该重新计算相似度
    try {
      const queryEmbedding = await this.generateEmbeddings([query]);
      const queryVec = queryEmbedding[0];

      const scored = candidates.map(doc => {
        const docVec = doc.embedding;
        if (!docVec || docVec.length === 0) {
          return { doc, score: 0 };
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < queryVec.length; i++) {
          dotProduct += queryVec[i] * docVec[i];
          normA += queryVec[i] * queryVec[i];
          normB += docVec[i] * docVec[i];
        }
        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        const score = denominator > 0 ? dotProduct / denominator : 0;

        return { doc, score };
      });

      const topK = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, k);

      return {
        documents: [topK.map(r => r.doc.content)],
        distances: [topK.map(r => 1 - r.score)],
        metadatas: [topK.map(r => r.doc.metadata)],
        totalDocuments: this.documents.length,
        filteredCount: candidates.length
      };
    } catch (error) {
      console.error('向量检索失败，降级关键词匹配:', error);
      return this.queryByKeywordsWithFilter(query, k, filter);
    }
  }

  // 带过滤的关键词检索（降级方案）
  private queryByKeywordsWithFilter(query: string, k: number, filter: any) {
    const queryChars = [...new Set(query.replace(/[\s,.\-!?;:，。！？；：、]/g, '').split(''))].filter(c => c.length > 0);

    let candidates = this.documents;

    if (filter.kbId) {
      candidates = candidates.filter(doc => doc.metadata?.kbId === filter.kbId);
    }

    if (filter.categoryId) {
      candidates = candidates.filter(doc => doc.metadata?.categoryId === filter.categoryId);
    }

    const results = candidates
      .map(doc => {
        const content = doc.content;
        let matchCount = 0;
        for (const char of queryChars) {
          if (content.includes(char)) {
            matchCount++;
          }
        }
        const score = queryChars.length > 0 ? matchCount / queryChars.length : 0;
        return { doc, score };
      })
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    return {
      documents: [results.map(r => r.doc.content)],
      distances: [results.map(r => 1 - r.score)],
      metadatas: [results.map(r => r.doc.metadata)],
      totalDocuments: this.documents.length,
      filteredCount: candidates.length
    };
  }
}

export const vectorDB = new VectorDB();
