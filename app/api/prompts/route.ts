import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { modelStore } from '../../../src/lib/modelStore';
import { logger } from '../../../src/lib/logger';

const PROMPTS_JSON_PATH = path.join(process.cwd(), 'data', 'prompts.json');

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  variables: string[];
  categories: string[];
  associatedKnowledgeDocs: string[];
  isActive: boolean;
  isDefault?: boolean;
  type?: string;
  scenario?: string[];
  useCount?: number;
  successCount?: number;
  failCount?: number;
  successRate?: number | null;
  lastUsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  callCount?: number;
}

function readPrompts(): PromptTemplate[] {
  try {
    if (fs.existsSync(PROMPTS_JSON_PATH)) {
      const data = fs.readFileSync(PROMPTS_JSON_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    logger.error('SYSTEM', 'Error reading prompts', { extra: { error: String(e) } });
  }
  return [];
}

function writePrompts(templates: PromptTemplate[]): void {
  const dir = path.dirname(PROMPTS_JSON_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(PROMPTS_JSON_PATH, JSON.stringify(templates, null, 2));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    const templates = readPrompts();

    if (action === 'list') {
      return NextResponse.json({ success: true, templates });
    }

    return NextResponse.json({ prompts: templates });
  } catch (error) {
    logger.error('SYSTEM', '加载提词器列表失败', { extra: { error: String(error) } });
    return NextResponse.json({ error: 'Failed to load prompts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, templateData, ...data } = body;
    const payload = templateData || data;

    if (action === 'create') {
      const templates = readPrompts();
      const newTemplate: PromptTemplate = {
        id: uuidv4(),
        name: payload.name,
        description: payload.description,
        content: payload.content,
        variables: payload.variables || [],
        categories: payload.categories || [],
        associatedKnowledgeDocs: payload.associatedKnowledgeDocs || [],
        isActive: payload.isActive !== false,
        isDefault: payload.isDefault || false,
        type: payload.type || 'general',
        scenario: payload.scenario || [],
        useCount: 0,
        successCount: 0,
        failCount: 0,
        successRate: null,
        lastUsedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      templates.push(newTemplate);
      writePrompts(templates);
      return NextResponse.json({ success: true, id: newTemplate.id });
    }

    if (action === 'update') {
      const templates = readPrompts();
      const idx = templates.findIndex(t => t.id === data.id);
      if (idx === -1) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }
      templates[idx] = {
        ...templates[idx],
        name: payload.name ?? templates[idx].name,
        description: payload.description ?? templates[idx].description,
        content: payload.content ?? templates[idx].content,
        variables: payload.variables ?? templates[idx].variables,
        categories: payload.categories ?? templates[idx].categories,
        associatedKnowledgeDocs: payload.associatedKnowledgeDocs ?? templates[idx].associatedKnowledgeDocs,
        isActive: payload.isActive ?? templates[idx].isActive,
        isDefault: payload.isDefault ?? templates[idx].isDefault,
        scenario: payload.scenario ?? templates[idx].scenario,
        updatedAt: new Date().toISOString(),
      };
      writePrompts(templates);
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      let templates = readPrompts();
      templates = templates.filter(t => t.id !== data.id);
      writePrompts(templates);
      return NextResponse.json({ success: true });
    }

    if (action === 'setDefault') {
      const templates = readPrompts();
      templates.forEach(t => {
        t.isDefault = t.id === data.id;
      });
      writePrompts(templates);
      return NextResponse.json({ success: true });
    }

    if (action === 'log') {
      // 简化日志：直接更新 JSON 中的统计
      const templates = readPrompts();
      const idx = templates.findIndex(t => t.id === data.templateId);
      if (idx !== -1) {
        templates[idx].useCount = (templates[idx].useCount || 0) + 1;
        if (data.success) {
          templates[idx].successCount = (templates[idx].successCount || 0) + 1;
        } else {
          templates[idx].failCount = (templates[idx].failCount || 0) + 1;
        }
        const total = templates[idx].useCount;
        const success = templates[idx].successCount || 0;
        templates[idx].successRate = total > 0 ? (success / total) * 100 : 0;
        templates[idx].lastUsedAt = new Date().toISOString();
        templates[idx].updatedAt = new Date().toISOString();
        writePrompts(templates);
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'test') {
      const templates = readPrompts();
      const template = templates.find(t => t.id === data.id);
      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      // 替换变量
      let content = template.content;
      const variables = data.variables || {};
      for (const [key, value] of Object.entries(variables)) {
        content = content.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }

      // 调用AI进行测试
      try {
        const defaultModel = modelStore.getDefault('llm');
        const model = defaultModel?.modelId || 'deepseek-v4-flash';
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY || ''}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content }],
            stream: false
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error('AI_API', '提词器测试AI调用失败', { extra: { status: response.status, error: errorText } });
          return NextResponse.json({ 
            success: false, 
            error: `AI API调用失败: ${response.status} ${errorText}` 
          });
        }

        const result = await response.json();
        const aiResponse = result.choices?.[0]?.message?.content || '无响应';
        
        return NextResponse.json({ 
          success: true, 
          result: aiResponse,
          renderedPrompt: content
        });
      } catch (error) {
        logger.error('AI_API', '提词器测试失败', { extra: { error: error instanceof Error ? error.message : String(error) } });
        return NextResponse.json({ 
          success: false, 
          error: 'AI调用失败: ' + (error instanceof Error ? error.message : String(error))
        });
      }
    }

    logger.warn('SYSTEM', '未知的提词器操作', { extra: { action } });
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    logger.error('SYSTEM', '处理提词器操作失败', { extra: { error: String(error) } });
    return NextResponse.json({ error: 'Failed to handle prompt action' }, { status: 500 });
  }
}
