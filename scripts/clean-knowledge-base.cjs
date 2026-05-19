/**
 * 知识库清理脚本
 * - 删除重复文档（内容相似度 > 90%）
 * - 删除空/过短文档（< 50 字符）
 * - 清洗乱码格式
 */
const fs = require('fs');
const path = require('path');

const KB_PATH = path.join(__dirname, '..', 'data', 'knowledge-base.json');

function cleanText(text) {
  if (!text || typeof text !== 'string') return '';
  // 移除乱码字符（非中文、非英文、非数字、非标点）
  let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // 移除连续多个空行为单个空行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  // 移除行首行尾空白
  cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');
  // 移除多余空格
  cleaned = cleaned.replace(/ {2,}/g, ' ');
  return cleaned.trim();
}

function similarity(a, b) {
  if (!a || !b) return 0;
  // 简单的字符级 Jaccard 相似度（用于检测重复）
  const setA = new Set(a.split(''));
  const setB = new Set(b.split(''));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function main() {
  console.log('=== 知识库清理开始 ===\n');

  if (!fs.existsSync(KB_PATH)) {
    console.log('知识库文件不存在:', KB_PATH);
    return;
  }

  const raw = fs.readFileSync(KB_PATH, 'utf8');
  let documents = JSON.parse(raw);

  console.log(`原始文档数: ${documents.length}`);

  // 统计
  const stats = {
    empty: 0,        // 空文档
    tooShort: 0,     // 过短文档
    duplicate: 0,    // 重复文档
    cleaned: 0,      // 清洗格式
    kept: 0          // 保留
  };

  // 按原始文档 ID 分组
  const byFile = new Map();
  for (const doc of documents) {
    const fileId = doc.metadata?.id || doc.id.split('_')[0];
    if (!byFile.has(fileId)) byFile.set(fileId, []);
    byFile.get(fileId).push(doc);
  }

  console.log(`原始文件数: ${byFile.size}`);
  for (const [fileId, docs] of byFile) {
    const fileName = docs[0]?.metadata?.fileName || fileId;
    console.log(`  - ${fileName}: ${docs.length} 个分块`);
  }

  // 第1步：清洗文本格式
  for (const doc of documents) {
    const original = doc.content;
    doc.content = cleanText(doc.content);
    if (doc.content !== original) {
      stats.cleaned++;
    }
  }

  // 第2步：删除空/过短文档
  let filtered = documents.filter(doc => {
    if (!doc.content || doc.content.length < 50) {
      stats.empty++;
      return false;
    }
    return true;
  });

  // 第3步：删除重复文档（Jaccard 相似度 > 0.9）
  const toRemove = new Set();
  for (let i = 0; i < filtered.length; i++) {
    if (toRemove.has(i)) continue;
    for (let j = i + 1; j < filtered.length; j++) {
      if (toRemove.has(j)) continue;
      // 只比较同一文件的分块
      if (filtered[i].metadata?.id !== filtered[j].metadata?.id) continue;
      const sim = similarity(filtered[i].content, filtered[j].content);
      if (sim > 0.9) {
        toRemove.add(j);
        stats.duplicate++;
      }
    }
  }

  const result = filtered.filter((_, idx) => !toRemove.has(idx));
  stats.kept = result.length;

  // 输出结果
  console.log('\n=== 清理结果 ===');
  console.log(`清洗格式: ${stats.cleaned} 个`);
  console.log(`删除空/过短: ${stats.empty} 个`);
  console.log(`删除重复: ${stats.duplicate} 个`);
  console.log(`保留: ${stats.kept} 个`);
  console.log(`共删除: ${documents.length - stats.kept} 个 (${((1 - stats.kept / documents.length) * 100).toFixed(1)}%)`);

  // 保留的文档按文件统计
  const keptByFile = new Map();
  for (const doc of result) {
    const fileId = doc.metadata?.id || doc.id.split('_')[0];
    if (!keptByFile.has(fileId)) keptByFile.set(fileId, []);
    keptByFile.get(fileId).push(doc);
  }
  console.log('\n清理后文件分布:');
  for (const [fileId, docs] of keptByFile) {
    const fileName = docs[0]?.metadata?.fileName || fileId;
    console.log(`  - ${fileName}: ${docs.length} 个分块`);
  }

  // 备份原文件
  const backupPath = KB_PATH + '.backup';
  fs.copyFileSync(KB_PATH, backupPath);
  console.log(`\n已备份原文件: ${backupPath}`);

  // 写入清理后的数据
  fs.writeFileSync(KB_PATH, JSON.stringify(result, null, 2));
  console.log('清理完成！');
}

main();
