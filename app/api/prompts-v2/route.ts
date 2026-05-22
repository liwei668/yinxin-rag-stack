import { NextRequest, NextResponse } from 'next/server';
import { promptDb } from '../../../src/services/prompts/database';
import { v4 as uuidv4 } from 'uuid';

// ========== 提示词模板管理 ==========

// GET: 获取提示词列表或单个提示词
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const action = searchParams.get('action') || 'list';

    switch (action) {
      case 'list': {
        const activeOnly = searchParams.get('activeOnly') === 'true';
        const templates = activeOnly 
          ? promptDb.getActiveTemplates()
          : promptDb.getAllTemplates();
        return NextResponse.json({ success: true, templates });
      }

      case 'detail': {
        if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
        const template = promptDb.getTemplateById(id);
        if (!template) return NextResponse.json({ error: '模板不存在' }, { status: 404 });
        return NextResponse.json({ success: true, template });
      }

      case 'default': {
        const defaultTemplate = promptDb.getDefaultTemplate();
        return NextResponse.json({ success: true, template: defaultTemplate });
      }

      case 'versions': {
        if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
        const versions = promptDb.getVersionsByTemplateId(id);
        return NextResponse.json({ success: true, versions });
      }

      case 'logs': {
        if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
        const limit = parseInt(searchParams.get('limit') || '100');
        const logs = promptDb.getLogsByTemplateId(id, limit);
        return NextResponse.json({ success: true, logs });
      }

      case 'stats': {
        if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
        const template = promptDb.getTemplateById(id);
        if (!template) return NextResponse.json({ error: '模板不存在' }, { status: 404 });
        
        const stats = {
          useCount: template.useCount || 0,
          successCount: template.successCount || 0,
          failCount: template.failCount || 0,
          successRate: template.successRate || 0,
          lastUsedAt: template.lastUsedAt,
        };
        return NextResponse.json({ success: true, stats });
      }

      case 'allStats': {
        const templates = promptDb.getAllTemplates();
        const stats = templates.map(t => ({
          id: t.id,
          name: t.name,
          useCount: t.useCount || 0,
          successCount: t.successCount || 0,
          failCount: t.failCount || 0,
          successRate: t.successRate || 0,
          lastUsedAt: t.lastUsedAt,
        }));
        return NextResponse.json({ success: true, stats });
      }

      default:
        return NextResponse.json({ error: '未知操作' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[Prompts API] GET 错误:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: 创建/更新/删除提示词，记录日志
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'create': {
        const { name, description, content, variables, categories, type, scenario } = body;
        if (!name || !content) {
          return NextResponse.json({ error: '缺少 name 或 content' }, { status: 400 });
        }

        const template = {
          id: uuidv4(),
          name,
          description: description || '',
          content,
          variables: JSON.stringify(variables || []),
          categories: JSON.stringify(categories || []),
          associatedKnowledgeDocs: '[]',
          isActive: 1,
          isDefault: 0,
          type: type || 'general',
          scenario: JSON.stringify(scenario || []),
        };

        promptDb.createTemplate(template);
        
        // 创建初始版本
        promptDb.createVersion({
          id: uuidv4(),
          templateId: template.id,
          content,
          version: '1.0',
        });

        return NextResponse.json({ success: true, template });
      }

      case 'update': {
        const { id, ...updates } = body;
        if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

        const existing = promptDb.getTemplateById(id);
        if (!existing) return NextResponse.json({ error: '模板不存在' }, { status: 404 });

        // 如果内容变更，保存新版本
        if (updates.content && updates.content !== existing.content) {
          const versions = promptDb.getVersionsByTemplateId(id);
          const newVersion = `${versions.length + 1}.0`;
          promptDb.createVersion({
            id: uuidv4(),
            templateId: id,
            content: updates.content,
            version: newVersion,
          });
        }

        promptDb.updateTemplate(id, updates);
        return NextResponse.json({ success: true });
      }

      case 'delete': {
        const { id } = body;
        if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
        promptDb.deleteTemplate(id);
        return NextResponse.json({ success: true });
      }

      case 'setDefault': {
        const { id } = body;
        if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
        
        // 先取消所有默认
        const templates = promptDb.getAllTemplates();
        for (const t of templates) {
          if (t.isDefault) {
            promptDb.updateTemplate(t.id, { isDefault: 0 });
          }
        }
        
        // 设置新的默认
        promptDb.updateTemplate(id, { isDefault: 1 });
        return NextResponse.json({ success: true });
      }

      case 'recordLog': {
        const { templateId, userId, sessionId, callStatus, errorType, errorMsg, variables, responseTime } = body;
        if (!templateId) return NextResponse.json({ error: '缺少 templateId' }, { status: 400 });

        const log = {
          id: uuidv4(),
          templateId,
          userId: userId || null,
          sessionId: sessionId || null,
          callStatus: callStatus ? 1 : 0,
          errorType: errorType || null,
          errorMsg: errorMsg || null,
          variables: variables ? JSON.stringify(variables) : null,
          responseTime: responseTime || null,
        };

        promptDb.createLog(log);
        
        // 更新统计
        promptDb.incrementUseCount(templateId, callStatus);

        return NextResponse.json({ success: true });
      }

      case 'recalculateStats': {
        const { id } = body;
        if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
        promptDb.recalculateStats(id);
        return NextResponse.json({ success: true });
      }

      case 'restoreVersion': {
        const { templateId, versionId } = body;
        if (!templateId || !versionId) {
          return NextResponse.json({ error: '缺少 templateId 或 versionId' }, { status: 400 });
        }

        const versions = promptDb.getVersionsByTemplateId(templateId);
        const version = versions.find(v => v.id === versionId);
        if (!version) return NextResponse.json({ error: '版本不存在' }, { status: 404 });

        // 恢复内容
        promptDb.updateTemplate(templateId, { content: version.content });
        
        // 创建新版本记录
        const newVersions = promptDb.getVersionsByTemplateId(templateId);
        promptDb.createVersion({
          id: uuidv4(),
          templateId,
          content: version.content,
          version: `${newVersions.length + 1}.0`,
        });

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: '未知操作' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[Prompts API] POST 错误:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
