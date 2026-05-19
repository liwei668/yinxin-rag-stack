import { NextRequest, NextResponse } from 'next/server';
import knowledgeStructureService from '../../../src/services/knowledgeStructureService';
import { logger } from '../../../src/lib/logger';

// 获取知识库结构或文档
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const kbId = searchParams.get('kbId');
    const categoryId = searchParams.get('categoryId');

    // 如果是获取文档
    if (action === 'getDocuments' && kbId) {
      const documents = await knowledgeStructureService.getDocumentsByPath(
        kbId,
        categoryId || undefined
      );
      return NextResponse.json({ success: true, documents });
    }

    // 否则返回知识库结构
    const tree = await knowledgeStructureService.getKnowledgeTree();
    const list = await knowledgeStructureService.getKnowledgeList();
    return NextResponse.json({ success: true, tree, list });
  } catch (error) {
    logger.error('SYSTEM', 'Error fetching knowledge structure', { extra: { error: String(error) } });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch knowledge structure' },
      { status: 500 }
    );
  }
}

// 创建知识库/分类 或 上传文档
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    const userId = 'default-user';

    // 如果是 FormData（上传文档）
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File;
      const kbId = formData.get('kbId') as string;
      const categoryId = formData.get('categoryId') as string | null;
      const metadataStr = formData.get('metadata') as string;

      if (!file || !kbId) {
        return NextResponse.json(
          { success: false, error: 'File and kbId are required' },
          { status: 400 }
        );
      }

      // 解析文档内容（支持多种格式）
      let content: string;
      const fileName = file.name.toLowerCase();
      try {
        const { parseDocument } = await import('../../../src/lib/documentParser');
        const result = await parseDocument(file);
        
        if (!result.success) {
          logger.warn('SYSTEM', '文档解析失败', { extra: { error: String(result.error) } });
          // 对于二进制文件（PDF/DOCX/XLSX 等），解析失败时报错而不是回退到二进制乱码
          if (fileName.endsWith('.pdf') || fileName.endsWith('.docx') || 
              fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || 
              fileName.endsWith('.pptx')) {
            return NextResponse.json(
              { success: false, error: `文档解析失败: ${result.error || '未知错误'}` },
              { status: 400 }
            );
          }
          // 只有纯文本格式才回退
          content = await file.text();
        } else {
          content = result.content;
        }
      } catch (error) {
        logger.warn('SYSTEM', '解析工具加载失败', { extra: { error: String(error) } });
        // 只对纯文本格式回退
        if (fileName.endsWith('.txt') || fileName.endsWith('.md') || 
            fileName.endsWith('.json') || fileName.endsWith('.csv') || 
            fileName.endsWith('.html') || fileName.endsWith('.css') || 
            fileName.endsWith('.js') || fileName.endsWith('.ts') || 
            fileName.endsWith('.jsx') || fileName.endsWith('.tsx') || 
            fileName.endsWith('.py') || fileName.endsWith('.java') || 
            fileName.endsWith('.go') || fileName.endsWith('.rs')) {
          content = await file.text();
        } else {
          return NextResponse.json(
            { success: false, error: `文档解析失败: ${error instanceof Error ? error.message : '未知错误'}` },
            { status: 400 }
          );
        }
      }
      
      const metadata = metadataStr ? JSON.parse(metadataStr) : {};
      metadata.fileName = file.name;
      metadata.fileType = file.type;
      metadata.fileSize = file.size;

      const result = await knowledgeStructureService.uploadDocument(
        kbId,
        categoryId,
        content,
        metadata,
        userId
      );

      return NextResponse.json({ success: true, document: result });
    }

    // 否则是 JSON（创建知识库/分类）
    const data = await req.json();
    const result = await knowledgeStructureService.createKnowledgeItem(data, userId);

    return NextResponse.json({ success: true, knowledgeItem: result });
  } catch (error) {
    logger.error('SYSTEM', 'Error in POST request', { extra: { error: String(error) } });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Request failed' },
      { status: 500 }
    );
  }
}

// 更新知识库/分类
export async function PUT(req: NextRequest) {
  try {
    const data = await req.json();
    console.log('PUT 请求数据:', data);
    const userId = 'default-user';
    let result;
    
    if (data.action === 'rename') {
      console.log('执行重命名操作:', { id: data.id, newName: data.newName, currentVersion: data.currentVersion });
      result = await knowledgeStructureService.renameKnowledgeItem(
        data.id,
        data.newName,
        data.currentVersion,
        userId
      );
    } else if (data.action === 'move') {
      result = await knowledgeStructureService.moveCategory(
        data.id,
        data.newParentId,
        data.currentVersion,
        userId
      );
    } else if (data.action === 'toggleVisibility') {
      result = await knowledgeStructureService.toggleVisibility(
        data.id,
        data.visibility,
        data.currentVersion,
        userId
      );
    } else if (data.action === 'toggleArchive') {
      result = await knowledgeStructureService.toggleArchive(
        data.id,
        data.isArchived,
        data.currentVersion,
        userId
      );
    } else if (data.action === 'updateDocument') {
      result = await knowledgeStructureService.updateDocument(
        data.docId,
        data.content,
        userId
      );
    } else {
      throw new Error(`Unknown action: ${data.action}`);
    }
    
    console.log('操作成功，返回结果:', result);
    return NextResponse.json({ success: true, knowledgeItem: result });
  } catch (error) {
    logger.error('SYSTEM', 'Error updating knowledge item', { extra: { error: String(error) } });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update knowledge item' },
      { status: 500 }
    );
  }
}

// 删除知识库/分类 或 文档
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const userId = 'default-user';

    // 如果是删除文档
    if (action === 'deleteDocument') {
      const docId = searchParams.get('docId');
      if (!docId) {
        return NextResponse.json(
          { success: false, error: 'docId is required' },
          { status: 400 }
        );
      }
      await knowledgeStructureService.deleteDocument(docId, userId);
      return NextResponse.json({ success: true });
    }

    // 否则是删除知识库/分类
    const id = searchParams.get('id');
    const moveToUncategorized = searchParams.get('moveToUncategorized') === 'true';

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID is required' },
        { status: 400 }
      );
    }

    await knowledgeStructureService.deleteKnowledgeItem(id, moveToUncategorized, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('SYSTEM', 'Error in DELETE request', { extra: { error: String(error) } });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Request failed' },
      { status: 500 }
    );
  }
}
