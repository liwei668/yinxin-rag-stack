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
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all';

    // 获取所有客户
    let customers = customerArchiveStore.getAll();

    // 状态筛选
    if (status !== 'all') {
      customers = customers.filter((c: any) => c.status === status);
    }

    // 搜索筛选
    if (search) {
      const searchLower = search.toLowerCase();
      customers = customers.filter((c: any) =>
        c.companyName?.toLowerCase().includes(searchLower) ||
        c.contactName?.toLowerCase().includes(searchLower) ||
        c.contactEmail?.toLowerCase().includes(searchLower) ||
        c.customerId?.toLowerCase().includes(searchLower)
      );
    }

    // 计算总数
    const total = customers.length;

    // 分页
    const start = (page - 1) * pageSize;
    const pagedCustomers = customers.slice(start, start + pageSize);

    return NextResponse.json({ 
      success: true, 
      customers: pagedCustomers,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    });
  }

  if (action === 'loadFile') {
    const customerId = searchParams.get('customerId');
    if (!customerId) return NextResponse.json({ success: false, error: '缺少客户ID' });
    const content = readCustomerFile(customerId);
    return NextResponse.json({ success: true, content });
  }

  // 导出 CSV
  if (action === 'export') {
    const customers = customerArchiveStore.getAll();
    
    // CSV 表头
    const headers = ['客户ID', '公司名称', '联系人', '联系电话', '邮箱', '行业', '状态', '标签', '创建时间', '更新时间'];
    
    // CSV 内容
    const rows = customers.map((c: any) => [
      c.customerId || '',
      c.companyName || '',
      c.contactName || '',
      c.contactPhone || '',
      c.contactEmail || '',
      c.industry || '',
      c.status === 'active' ? '活跃' : '非活跃',
      (c.tags || []).join('; '),
      c.createdAt || '',
      c.updatedAt || ''
    ]);

    // 组装 CSV（使用 BOM 支持中文）
    const BOM = '\uFEFF';
    const csv = BOM + headers.join(',') + '\n' + rows.map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="customers-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
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
