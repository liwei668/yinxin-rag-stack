import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { logger } from '../../../src/lib/logger';

// 分类存储路径
const categoriesPath = path.join(process.cwd(), 'data', 'categories.json');

// 确保数据目录存在
const ensureDataDir = () => {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
};

// 读取分类
const readCategories = (): string[] => {
  ensureDataDir();
  if (!fs.existsSync(categoriesPath)) {
    return ['默认分类'];
  }
  try {
    const data = fs.readFileSync(categoriesPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error('SYSTEM', '读取分类失败', { extra: { error: String(error) } });
    return ['默认分类'];
  }
};

// 写入分类
const writeCategories = (categories: string[]): void => {
  ensureDataDir();
  try {
    fs.writeFileSync(categoriesPath, JSON.stringify(categories, null, 2));
  } catch (error) {
    logger.error('SYSTEM', '写入分类失败', { extra: { error: String(error) } });
  }
};

export async function GET(request: NextRequest) {
  try {
    const categories = readCategories();
    return NextResponse.json({ success: true, categories });
  } catch (error) {
    logger.error('SYSTEM', '获取分类失败', { extra: { error: String(error) } });
    return NextResponse.json({ success: false, error: '获取分类失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, category, oldCategory } = await request.json();
    const categories = readCategories();
    
    switch (action) {
      case 'create':
        if (!category) {
          return NextResponse.json({ success: false, error: '分类名称不能为空' }, { status: 400 });
        }
        if (categories.includes(category)) {
          return NextResponse.json({ success: false, error: '分类已存在' }, { status: 400 });
        }
        categories.push(category);
        writeCategories(categories);
        return NextResponse.json({ success: true, categories });
        
      case 'update':
        if (!category || !oldCategory) {
          return NextResponse.json({ success: false, error: '分类名称不能为空' }, { status: 400 });
        }
        if (categories.includes(category) && category !== oldCategory) {
          return NextResponse.json({ success: false, error: '分类名称已存在' }, { status: 400 });
        }
        const index = categories.indexOf(oldCategory);
        if (index !== -1) {
          categories[index] = category;
          writeCategories(categories);
        }
        return NextResponse.json({ success: true, categories });
        
      case 'delete':
        if (!category) {
          return NextResponse.json({ success: false, error: '分类名称不能为空' }, { status: 400 });
        }
        if (category === '默认分类') {
          return NextResponse.json({ success: false, error: '默认分类不能删除' }, { status: 400 });
        }
        const updatedCategories = categories.filter(cat => cat !== category);
        writeCategories(updatedCategories);
        return NextResponse.json({ success: true, categories: updatedCategories });
        
      default:
        return NextResponse.json({ success: false, error: '无效的操作' }, { status: 400 });
    }
  } catch (error) {
    logger.error('SYSTEM', '分类操作失败', { extra: { error: String(error) } });
    return NextResponse.json({ success: false, error: '分类操作失败' }, { status: 500 });
  }
}
