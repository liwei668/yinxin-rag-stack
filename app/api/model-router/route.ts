import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '../../../src/lib/auth';
import { userStore } from '../../../src/lib/userStore';
import { modelRouterStore } from '../../../lib/modelRouterStore';
import { modelRouter } from '../../../src/services/model-router/routerEngine';

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
    const rules = modelRouterStore.getAll();
    return NextResponse.json({ success: true, rules });
  }

  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  const { valid, error } = verifyAdmin(request);
  if (!valid) return NextResponse.json({ error }, { status: 401 });

  const body = await request.json();
  const { action, ruleData } = body;

  if (action === 'create') {
    const id = modelRouterStore.create(ruleData);
    return NextResponse.json({ success: true, id });
  }

  if (action === 'update') {
    modelRouterStore.update(ruleData.id, ruleData);
    return NextResponse.json({ success: true });
  }

  if (action === 'delete') {
    modelRouterStore.delete(ruleData.id);
    return NextResponse.json({ success: true });
  }

  if (action === 'test') {
    const result = await modelRouter.selectModel({
      text: ruleData.testText,
      intent: ruleData.testIntent,
      fileTypes: ruleData.testFileTypes,
    });
    return NextResponse.json({ success: true, result });
  }

  return NextResponse.json({ success: false, error: '无效操作' });
}
