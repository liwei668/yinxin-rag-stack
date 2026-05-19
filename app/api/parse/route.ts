import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { callAPI } from '@/api/apiManager';
import { logger } from '../../../src/lib/logger';

const uploadDir = path.join(process.cwd(), 'public', 'uploads');

export async function POST(request: NextRequest) {
  try {
    const { filename, type } = await request.json();
    
    if (!filename) {
      return NextResponse.json({ error: 'No filename provided' }, { status: 400 });
    }
    
    const filepath = path.join(uploadDir, filename);
    if (!fs.existsSync(filepath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    
    let content = '';
    let metadata: any = {};
    
    const extension = path.extname(filename).toLowerCase();
    
    try {
      switch (extension) {
        case '.txt':
        case '.md':
        case '.json':
        case '.xml':
        case '.csv':
        case '.html':
        case '.htm':
          // 文本类文件直接读取
          content = fs.readFileSync(filepath, 'utf8');
          if (extension === '.html' || extension === '.htm') {
            content = content.replace(/<[^>]*>/g, ' ');
          }
          if (extension === '.json') {
            try { metadata = JSON.parse(content); } catch (e) {}
          }
          break;
        
        case '.jpg':
        case '.jpeg':
        case '.png':
        case '.gif':
        case '.bmp':
        case '.webp':
          // 使用 Qwen-VL-Max 识别图片（替代 tesseract.js）
          const imageBuffer = fs.readFileSync(filepath);
          const base64Image = imageBuffer.toString('base64');
          const mimeType = `image/${extension === '.jpg' ? 'jpeg' : extension.slice(1)}`;
          
          console.log(`[Parse API] 使用 Qwen-VL-Max 识别图片: ${filename}`);
          const result = await callAPI('deepseek', 'vision', {
            base64Image,
            message: '请识别并提取这张图片中的所有文字内容，保持原有格式和排版。如果没有文字，请描述图片内容。',
            mimeType
          });
          
          content = result?.choices?.[0]?.message?.content || '无法识别图片内容';
          metadata = { model: 'qwen-vl-max', source: 'vision' };
          break;
        
        default:
          const stats = fs.statSync(filepath);
          metadata = { size: stats.size, mtime: stats.mtime, type };
          content = `文件类型: ${type}\n文件大小: ${stats.size} 字节`;
      }
    } catch (error: any) {
      logger.error('SYSTEM', 'Error parsing file', { extra: { error: String(error) } });
      content = `无法解析文件: ${error.message}`;
    }
    
    return NextResponse.json({ content, metadata, filename, type: extension });
  } catch (error) {
    logger.error('SYSTEM', 'Error processing file', { extra: { error: String(error) } });
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 });
  }
}
