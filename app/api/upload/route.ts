import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { configStore } from '../../../src/lib/configStore';
import { logger } from '../../../src/lib/logger';

// 确保上传目录存在
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export async function POST(request: NextRequest) {
  try {
    // 读取上传配置
    const systemConfig = configStore.getGroup('system');
    const maxUploadSize = (systemConfig?.maxUploadSize || 50) * 1024 * 1024; // MB → bytes
    const allowedFileTypes = (systemConfig?.allowedFileTypes || '').split(',').map(t => t.trim().toLowerCase());

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    const uploadedFiles = [];

    for (const file of files) {
      // 检查文件大小
      if (file.size > maxUploadSize) {
        return NextResponse.json(
          { error: `文件 ${file.name} 超过大小限制（最大 ${systemConfig?.maxUploadSize || 50}MB）` },
          { status: 400 }
        );
      }

      // 检查文件类型
      if (allowedFileTypes.length > 0) {
        const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!allowedFileTypes.includes(fileExt)) {
          return NextResponse.json(
            { error: `文件 ${file.name} 类型不允许，允许的类型：${systemConfig?.allowedFileTypes}` },
            { status: 400 }
          );
        }
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const filename = `${Date.now()}_${file.name}`;
      const filepath = path.join(uploadDir, filename);

      fs.writeFileSync(filepath, buffer);

      uploadedFiles.push({
        name: file.name,
        filename,
        size: file.size,
        type: file.type,
        url: `/uploads/${filename}`
      });
    }

    return NextResponse.json({ files: uploadedFiles });
  } catch (error) {
    logger.error('SYSTEM', 'Error uploading files', { extra: { error: String(error) } });
    return NextResponse.json({ error: 'Failed to upload files' }, { status: 500 });
  }
}
