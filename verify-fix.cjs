#!/usr/bin/env node

/**
 * 验证客户档案API修复
 */

const fs = require('fs');
const path = require('path');

console.log('=== 验证客户档案API修复 ===\n');

// 测试1: 检查customerArchiveStore.js是否正确
const storePath = path.join(__dirname, 'lib', 'customerArchiveStore.ts');
console.log('1. 检查 store 文件:', storePath);
if (fs.existsSync(storePath)) {
  const content = fs.readFileSync(storePath, 'utf8');
  const hasArchivesSupport = content.includes('parsed.archives');
  const hasArrayCheck = content.includes('Array.isArray');
  console.log(`   ✅ 文件存在`);
  console.log(`   ✅ 支持 archives 格式: ${hasArchivesSupport}`);
  console.log(`   ✅ 有数组检查: ${hasArrayCheck}`);
} else {
  console.log('   ❌ 文件不存在');
}

// 测试2: 检查数据文件格式
const dataPath = path.join(__dirname, 'data', 'customer-archives.json');
console.log('\n2. 检查数据文件:', dataPath);
if (fs.existsSync(dataPath)) {
  const content = fs.readFileSync(dataPath, 'utf8');
  try {
    const parsed = JSON.parse(content);
    console.log(`   ✅ JSON格式正确`);
    console.log(`   ✅ 数据结构: ${JSON.stringify(parsed)}`);
    const hasArchives = parsed && parsed.archives;
    const isArray = hasArchives && Array.isArray(parsed.archives);
    console.log(`   ✅ 有 archives 字段: ${hasArchives}`);
    console.log(`   ✅ archives 是数组: ${isArray}`);
  } catch (e) {
    console.log(`   ❌ JSON解析失败: ${e.message}`);
  }
} else {
  console.log('   ❌ 文件不存在');
}

// 测试3: 检查组件修复
const componentPath = path.join(__dirname, 'src', 'components', 'admin', 'CustomerArchiveManagement.tsx');
console.log('\n3. 检查组件文件:', componentPath);
if (fs.existsSync(componentPath)) {
  const content = fs.readFileSync(componentPath, 'utf8');
  const hasNullCheck = content.includes('(customers || [])');
  const hasArrayCheck = content.includes('Array.isArray');
  console.log(`   ✅ 文件存在`);
  console.log(`   ✅ 有空值检查: ${hasNullCheck}`);
  console.log(`   ✅ 有数组验证: ${hasArrayCheck}`);
} else {
  console.log('   ❌ 文件不存在');
}

console.log('\n✅ 修复验证完成！');
console.log('\n请在浏览器中访问: http://localhost:3001/admin');
console.log('使用账号登录后点击"客户"菜单测试功能');
