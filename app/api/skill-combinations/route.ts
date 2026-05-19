import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '../../../src/lib/auth';
import { userStore } from '../../../src/lib/userStore';
import { promptCombiner } from '../../../src/services/skill-prompts/promptCombiner';

const verifyAdmin = (request: NextRequest) => {
  const authCookie = request.cookies.get('auth_token');
  if (!authCookie) return { valid: false, error: '未登录' };
  const payload = verifyToken(authCookie.value);
  if (!payload) return { valid: false, error: 'Token已过期或无效' };
  const user = userStore.findOne({ id: payload.userId });
  if (!user || user.role !== 'admin') return { valid: false, error: '权限不足' };
  return { valid: true, user };
};

export async function GET(request: NextRequest) {
  const { valid, error } = verifyAdmin(request);
  if (!valid) return NextResponse.json({ error }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'list') {
    const combinations = promptCombiner.getCombinations();
    return NextResponse.json({ success: true, combinations });
  }

  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  const { valid, error } = verifyAdmin(request);
  if (!valid) return NextResponse.json({ error }, { status: 401 });

  const body = await request.json();
  const { action, comboData, id } = body;

  if (action === 'preview') {
    try {
      const combinations = promptCombiner.getCombinations();
      const combo = combinations.find(c => c.id === id);
      
      if (!combo) {
        return NextResponse.json({ success: false, error: '组合不存在' });
      }

      const content = await promptCombiner.combinePrompts(combo);
      return NextResponse.json({ success: true, content });
    } catch (e) {
      console.error('预览组合失败:', e);
      return NextResponse.json({ success: false, error: '预览失败' });
    }
  }

  if (action === 'create') {
    const combinations = promptCombiner.getCombinations();
    const newCombo = {
      id: `combo-${Date.now()}`,
      name: comboData.name,
      description: comboData.description || '',
      skills: comboData.skills || [],
      defaultModelId: comboData.defaultModelId || 'deepseek-v4-flash',
      isActive: comboData.isActive !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    combinations.push(newCombo);
    
    try {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(process.cwd(), 'data', 'skill-combinations.json');
      fs.writeFileSync(configPath, JSON.stringify({ combinations }, null, 2));
      
      return NextResponse.json({ success: true, id: newCombo.id });
    } catch (e) {
      console.error('创建组合失败:', e);
      return NextResponse.json({ success: false, error: '创建失败' });
    }
  }

  if (action === 'update') {
    try {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(process.cwd(), 'data', 'skill-combinations.json');
      
      let combinations = [];
      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        combinations = data.combinations || [];
      }
      
      const index = combinations.findIndex(c => c.id === comboData.id);
      if (index !== -1) {
        combinations[index] = {
          ...combinations[index],
          ...comboData,
          updatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(configPath, JSON.stringify({ combinations }, null, 2));
        return NextResponse.json({ success: true });
      } else {
        return NextResponse.json({ success: false, error: '组合不存在' });
      }
    } catch (e) {
      console.error('更新组合失败:', e);
      return NextResponse.json({ success: false, error: '更新失败' });
    }
  }

  if (action === 'delete') {
    try {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(process.cwd(), 'data', 'skill-combinations.json');
      
      let combinations = [];
      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        combinations = (data.combinations || []).filter(c => c.id !== id);
      }
      
      fs.writeFileSync(configPath, JSON.stringify({ combinations }, null, 2));
      return NextResponse.json({ success: true });
    } catch (e) {
      console.error('删除组合失败:', e);
      return NextResponse.json({ success: false, error: '删除失败' });
    }
  }

  return NextResponse.json({ success: false, error: '无效操作' });
}
