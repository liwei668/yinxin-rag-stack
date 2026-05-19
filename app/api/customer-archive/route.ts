import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '../../../src/lib/auth';
import { userStore } from '../../../src/lib/userStore';
import { customerArchiveStore, readCustomerFile, writeCustomerFile } from '../../../lib/customerArchiveStore';

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
    const customers = customerArchiveStore.getAll();
    return NextResponse.json({ success: true, customers });
  }

  if (action === 'loadFile') {
    const customerId = searchParams.get('customerId');
    if (!customerId) return NextResponse.json({ success: false, error: '缺少客户ID' });
    const content = readCustomerFile(customerId);
    return NextResponse.json({ success: true, content });
  }

  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  const { valid, error } = verifyAdmin(request);
  if (!valid) return NextResponse.json({ error }, { status: 401 });

  const body = await request.json();
  const { action, customerData } = body;

  if (action === 'create') {
    const id = customerArchiveStore.create(customerData);
    return NextResponse.json({ success: true, id });
  }

  if (action === 'update') {
    customerArchiveStore.update(customerData.id, customerData);
    return NextResponse.json({ success: true });
  }

  if (action === 'delete') {
    customerArchiveStore.delete(customerData.id);
    return NextResponse.json({ success: true });
  }

  if (action === 'saveFile') {
    const { customerId, content } = body;
    if (!customerId) return NextResponse.json({ success: false, error: '缺少客户ID' });
    writeCustomerFile(customerId, content);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: '无效操作' });
}
