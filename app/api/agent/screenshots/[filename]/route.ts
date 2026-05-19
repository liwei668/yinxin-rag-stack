import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { logger } from '../../../../../src/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    // 安全检查：防止路径遍历
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json({ error: '非法文件名' }, { status: 400 });
    }

    const filepath = path.join(process.cwd(), 'data', 'screenshots', filename);

    if (!fs.existsSync(filepath)) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }

    const buffer = fs.readFileSync(filepath);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
