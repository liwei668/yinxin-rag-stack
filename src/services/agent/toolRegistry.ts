// 工具注册表 - AI Agent 工具集合
import { ToolDefinition, ToolResult } from './types';
import { permissionController } from './permissionController';

type ToolExecutor = (params: Record<string, any>, userId?: string) => Promise<ToolResult>;

interface RegisteredTool extends ToolDefinition {
  executor: ToolExecutor;
}

class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  register(tool: RegisteredTool) {
    if (this.tools.has(tool.name)) {
      console.warn(`[Agent] 工具 "${tool.name}" 已存在，将被覆盖`);
    }
    this.tools.set(tool.name, tool);
    console.log(`[Agent] 工具已注册: ${tool.name} (${tool.category})`);
  }

  getDefinition(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAllDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      riskLevel: t.riskLevel,
      category: t.category,
      requiresApproval: t.requiresApproval,
    }));
  }

  getToolsByCategory(): Record<string, ToolDefinition[]> {
    const grouped: Record<string, ToolDefinition[]> = {};
    for (const tool of this.tools.values()) {
      if (!grouped[tool.category]) {
        grouped[tool.category] = [];
      }
      grouped[tool.category].push({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        riskLevel: t.riskLevel,
        category: tool.category,
        requiresApproval: tool.requiresApproval,
      });
    }
    return grouped;
  }

  async execute(name: string, params: Record<string, any>, userId?: string): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `工具 "${name}" 未注册` };
    }
    try {
      console.log(`[Agent] 执行工具: ${name}`, params);
      const result = await tool.executor(params, userId);
      console.log(`[Agent] 工具 ${name} 结果:`, result.success ? '成功' : '失败', result.message);
      return result;
    } catch (error: any) {
      console.error(`[Agent] 工具 ${name} 异常:`, error);
      return { success: false, error: error.message || '工具执行失败' };
    }
  }

  getToolDescriptions(): string {
    const lines: string[] = [];
    for (const tool of this.tools.values()) {
      const params = tool.parameters
        .map(p => `    - ${p.name} (${p.type}${p.required ? ', 必填' : ''}): ${p.description}`)
        .join('\n');
      lines.push(`- ${tool.name}: ${tool.description} [风险等级: ${tool.riskLevel}]\n  参数:\n${params}`);
    }
    return lines.join('\n\n');
  }
}

export const toolRegistry = new ToolRegistry();

// ========== 注册基础工具 ==========

// 1. 网络搜索工具
toolRegistry.register({
  name: 'web_search',
  description: '使用百度搜索指定关键词，返回搜索结果摘要',
  category: '搜索',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'query', type: 'string', description: '搜索关键词', required: true },
    { name: 'num_results', type: 'number', description: '返回结果数量（默认5条）', required: false },
  ],
  executor: async (params) => {
    const { query, num_results = 5 } = params;
    if (!query) return { success: false, error: '缺少 query 参数' };

    try {
      // 使用 fetch 调用百度搜索API或爬虫服务
      const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;
      
      return {
        success: true,
        message: `搜索 "${query}" 完成`,
        data: {
          query,
          searchUrl,
          results: [],
          note: '浏览器自动化已移除，搜索功能需要接入搜索API',
        },
      };
    } catch (error: any) {
      return { success: false, error: `搜索失败: ${error.message}` };
    }
  },
});

// 2. 计算器工具
toolRegistry.register({
  name: 'calculator',
  description: '执行数学计算',
  category: '计算',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'expression', type: 'string', description: '数学表达式（如 "1 + 2 * 3"）', required: true },
  ],
  executor: async (params) => {
    const { expression } = params;
    if (!expression) return { success: false, error: '缺少 expression 参数' };

    try {
      // 安全计算 - 只允许数字和基本运算符
      const sanitized = expression.replace(/[^0-9+\-*/.()\s]/g, '');
      const result = Function(`"use strict"; return (${sanitized})`)();
      
      return {
        success: true,
        message: `${expression} = ${result}`,
        data: { expression, result },
      };
    } catch (error: any) {
      return { success: false, error: `计算失败: ${error.message}` };
    }
  },
});

// 3. 当前时间工具
toolRegistry.register({
  name: 'get_current_time',
  description: '获取当前日期和时间',
  category: '工具',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [],
  executor: async () => {
    const now = new Date();
    return {
      success: true,
      message: `当前时间: ${now.toLocaleString('zh-CN')}`,
      data: {
        datetime: now.toISOString(),
        formatted: now.toLocaleString('zh-CN'),
        date: now.toLocaleDateString('zh-CN'),
        time: now.toLocaleTimeString('zh-CN'),
      },
    };
  },
});

// 4. 文件读取工具（文本文件）
toolRegistry.register({
  name: 'read_text_file',
  description: '读取文本文件内容（支持 .txt, .md, .json 等）',
  category: '文件',
  riskLevel: 'safe',
  requiresApproval: true,
  parameters: [
    { name: 'file_path', type: 'string', description: '文件路径（相对项目根目录）', required: true },
  ],
  executor: async (params) => {
    const { file_path } = params;
    if (!file_path) return { success: false, error: '缺少 file_path 参数' };

    try {
      const fs = await import('fs');
      const path = await import('path');
      const fullPath = path.join(process.cwd(), file_path);
      
      // 安全检查：确保在项目目录内
      if (!fullPath.startsWith(process.cwd())) {
        return { success: false, error: '文件路径超出项目目录' };
      }
      
      const content = fs.readFileSync(fullPath, 'utf-8');
      
      return {
        success: true,
        message: `已读取文件: ${file_path}`,
        data: { file_path, content: content.substring(0, 10000) },
      };
    } catch (error: any) {
      return { success: false, error: `读取失败: ${error.message}` };
    }
  },
});

// 5. 知识库检索工具
toolRegistry.register({
  name: 'knowledge_search',
  description: '从知识库中检索相关信息',
  category: '知识库',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'query', type: 'string', description: '检索查询', required: true },
    { name: 'top_k', type: 'number', description: '返回结果数量（默认3条）', required: false },
  ],
  executor: async (params) => {
    const { query, top_k = 3 } = params;
    if (!query) return { success: false, error: '缺少 query 参数' };

    try {
      // 调用 RAG 服务
      const { searchKnowledge } = await import('../../api/rag');
      const results = await searchKnowledge(query, top_k);
      
      return {
        success: true,
        message: `检索到 ${results.length} 条相关知识`,
        data: { query, results },
      };
    } catch (error: any) {
      return { success: false, error: `检索失败: ${error.message}` };
    }
  },
});

// 6. 发送邮件工具
toolRegistry.register({
  name: 'send_email',
  description: '发送邮件（需要配置邮箱）',
  category: '邮件',
  riskLevel: 'high',
  requiresApproval: true,
  parameters: [
    { name: 'to', type: 'string', description: '收件人邮箱', required: true },
    { name: 'subject', type: 'string', description: '邮件主题', required: true },
    { name: 'body', type: 'string', description: '邮件正文', required: true },
    { name: 'cc', type: 'string', description: '抄送（多个用逗号分隔）', required: false },
  ],
  executor: async (params) => {
    const { to, subject, body, cc } = params;
    if (!to || !subject || !body) {
      return { success: false, error: '缺少必要参数（to, subject, body）' };
    }

    try {
      // 调用邮件服务
      const { sendEmail } = await import('../email-marketing/emailService');
      await sendEmail({ to, subject, body, cc: cc?.split(',').map((e: string) => e.trim()) });
      
      return {
        success: true,
        message: `邮件已发送至 ${to}`,
        data: { to, subject },
      };
    } catch (error: any) {
      return { success: false, error: `发送失败: ${error.message}` };
    }
  },
});

// 7. 创建记账凭证工具
toolRegistry.register({
  name: 'create_voucher',
  description: '创建会计记账凭证',
  category: '记账',
  riskLevel: 'high',
  requiresApproval: true,
  parameters: [
    { name: 'date', type: 'string', description: '凭证日期（YYYY-MM-DD）', required: true },
    { name: 'summary', type: 'string', description: '凭证摘要', required: true },
    { name: 'entries', type: 'array', description: '分录数组（包含 account_code, debit_amount, credit_amount）', required: true },
  ],
  executor: async (params) => {
    const { date, summary, entries } = params;
    if (!date || !summary || !entries) {
      return { success: false, error: '缺少必要参数' };
    }

    try {
      // 调用记账服务
      const { createVoucher } = await import('../accounting/voucherService');
      const voucher = await createVoucher({ date, summary, entries });
      
      return {
        success: true,
        message: `凭证创建成功: ${voucher.number}`,
        data: voucher,
      };
    } catch (error: any) {
      return { success: false, error: `创建失败: ${error.message}` };
    }
  },
});

// 8. 查询科目余额工具
toolRegistry.register({
  name: 'query_account_balance',
  description: '查询会计科目余额',
  category: '记账',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'account_code', type: 'string', description: '科目代码（如 1001）', required: false },
    { name: 'period', type: 'string', description: '会计期间（如 2024-01）', required: false },
  ],
  executor: async (params) => {
    const { account_code, period } = params;

    try {
      const { getBalance } = await import('../accounting/accountService');
      const balance = await getBalance({ account_code, period });
      
      return {
        success: true,
        message: `科目余额查询完成`,
        data: balance,
      };
    } catch (error: any) {
      return { success: false, error: `查询失败: ${error.message}` };
    }
  },
});

// 9. HTTP请求工具
toolRegistry.register({
  name: 'http_request',
  description: '发送HTTP请求（GET/POST/PUT/DELETE）',
  category: '网络',
  riskLevel: 'medium',
  requiresApproval: true,
  parameters: [
    { name: 'url', type: 'string', description: '请求URL', required: true },
    { name: 'method', type: 'string', description: '请求方法（GET/POST/PUT/DELETE）', required: false, default: 'GET' },
    { name: 'headers', type: 'object', description: '请求头', required: false },
    { name: 'body', type: 'object', description: '请求体（JSON对象）', required: false },
  ],
  executor: async (params) => {
    const { url, method = 'GET', headers = {}, body } = params;
    if (!url) return { success: false, error: '缺少 url 参数' };

    // URL白名单检查
    const { allowed, reason } = permissionController.isUrlAllowed(url);
    if (!allowed) {
      return { success: false, error: `URL 访问被拒绝: ${reason}` };
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      
      const data = await response.json().catch(() => null);
      
      return {
        success: response.ok,
        message: `HTTP ${method} ${url} - ${response.status}`,
        data: { status: response.status, statusText: response.statusText, body: data },
      };
    } catch (error: any) {
      return { success: false, error: `请求失败: ${error.message}` };
    }
  },
});

// 10. 生成文本报告工具
toolRegistry.register({
  name: 'generate_report',
  description: '生成并保存文本报告',
  category: '文件',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'title', type: 'string', description: '报告标题', required: true },
    { name: 'content', type: 'string', description: '报告内容', required: true },
    { name: 'format', type: 'string', description: '格式（txt/md/html）', required: false, default: 'md' },
  ],
  executor: async (params) => {
    const { title, content, format = 'md' } = params;
    if (!title || !content) return { success: false, error: '缺少必要参数' };

    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const reportsDir = path.join(process.cwd(), 'data', 'reports');
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }
      
      const filename = `${title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${Date.now()}.${format}`;
      const filePath = path.join(reportsDir, filename);
      
      let finalContent = content;
      if (format === 'md') {
        finalContent = `# ${title}\n\n${content}\n\n---\n生成时间: ${new Date().toLocaleString('zh-CN')}`;
      } else if (format === 'html') {
        finalContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head><body><h1>${title}</h1>${content}<hr><p>生成时间: ${new Date().toLocaleString('zh-CN')}</p></body></html>`;
      }
      
      fs.writeFileSync(filePath, finalContent, 'utf-8');
      
      return {
        success: true,
        message: `报告已保存: ${filename}`,
        data: { filename, filePath, format },
      };
    } catch (error: any) {
      return { success: false, error: `保存失败: ${error.message}` };
    }
  },
});

// 11. 天眼查企业搜索工具
toolRegistry.register({
  name: 'tianyancha_search',
  description: '通过天眼查API搜索企业信息，可获取公司名称、联系方式、注册资本、法人等详细信息',
  category: '企业查询',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'keyword', type: 'string', description: '搜索关键词（公司名、行业、地区等）', required: true },
    { name: 'city', type: 'string', description: '城市筛选（如：成都）', required: false },
    { name: 'industry', type: 'string', description: '行业筛选（如：科技、金融）', required: false },
    { name: 'page_size', type: 'number', description: '返回数量（默认10条，最多20条）', required: false },
  ],
  executor: async (params) => {
    const { keyword, city, industry, page_size = 10 } = params;
    
    try {
      const { searchCompanies, searchByRegion } = await import('../tianyanchaAPI');
      
      let result;
      if (city || industry) {
        // 按地区和行业搜索
        result = await searchByRegion(city || '', industry, Math.min(page_size, 20));
      } else if (keyword) {
        // 按关键词搜索
        result = await searchCompanies(keyword, Math.min(page_size, 20));
      } else {
        return { success: false, error: '请提供搜索关键词或城市/行业' };
      }
      
      if (!result.success) {
        return { success: false, error: result.error };
      }
      
      // 过滤有联系方式的公司
      const withContact = result.companies.filter(c => c.phoneNumber || c.email);
      const withoutContact = result.companies.filter(c => !c.phoneNumber && !c.email);
      
      return {
        success: true,
        message: `搜索到 ${result.total} 家企业，其中 ${withContact.length} 家有联系方式`,
        data: {
          total: result.total,
          withContact,
          withoutContact,
          all: result.companies,
        },
      };
    } catch (error: any) {
      return { success: false, error: `搜索失败: ${error.message}` };
    }
  },
});

// 12. 创建客户档案工具
toolRegistry.register({
  name: 'create_customer_archive',
  description: '创建客户档案并归档，支持从天眼查数据自动填充',
  category: '客户管理',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'company_name', type: 'string', description: '公司名称', required: true },
    { name: 'contact_name', type: 'string', description: '联系人姓名', required: false },
    { name: 'phone', type: 'string', description: '联系电话', required: false },
    { name: 'email', type: 'string', description: '联系邮箱', required: false },
    { name: 'industry', type: 'string', description: '行业', required: false },
    { name: 'tianyancha_data', type: 'object', description: '天眼查完整数据（自动填充其他字段）', required: false },
  ],
  executor: async (params) => {
    const { company_name, contact_name, phone, email, industry, tianyancha_data } = params;
    if (!company_name) {
      return { success: false, error: '缺少公司名称' };
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      
      // 生成客户ID
      const customerId = `C${Date.now().toString(36).toUpperCase()}`;
      
      // 构建客户数据
      const customerData: Record<string, any> = {
        customerId,
        companyName: company_name,
        contactName: contact_name || '',
        contactPhone: phone || '',
        contactEmail: email || '',
        industry: industry || '',
        notes: '',
        tags: [],
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      // 如果有天眼查数据，补充更多信息
      if (tianyancha_data) {
        customerData.contactName = contact_name || tianyancha_data.legalPersonName || '';
        customerData.contactPhone = phone || tianyancha_data.phoneNumber || '';
        customerData.contactEmail = email || tianyancha_data.email || '';
        customerData.industry = industry || tianyancha_data.industry || '';
        
        // 保存天眼查原始数据到 notes
        customerData.notes = JSON.stringify({
          tianyancha: {
            id: tianyancha_data.id,
            creditCode: tianyancha_data.creditCode,
            regCapital: tianyancha_data.regCapital,
            establishTime: tianyancha_data.establishTime,
            address: tianyancha_data.address,
            businessScope: tianyancha_data.businessScope,
            legalPersonName: tianyancha_data.legalPersonName,
            socialStaffNum: tianyancha_data.socialStaffNum,
            staffNumRange: tianyancha_data.staffNumRange,
            regStatus: tianyancha_data.regStatus,
            companyOrgType: tianyancha_data.companyOrgType,
            phoneNumber: tianyancha_data.phoneNumber,
            email: tianyancha_data.email,
            dataSource: '天眼查',
            updatedAt: new Date().toISOString(),
          }
        });
      }
      
      // 保存到客户档案存储
      const { customerArchiveStore } = await import('../../../lib/customerArchiveStore');
      const id = customerArchiveStore.create(customerData);
      
      // 同时创建档案文件
      const customersDir = path.join(process.cwd(), 'data', 'customers');
      if (!fs.existsSync(customersDir)) {
        fs.mkdirSync(customersDir, { recursive: true });
      }
      
      const archiveContent = `[公司信息]
${JSON.stringify(tianyancha_data || customerData, null, 2)}

[对话记录]

[待办事项]
`;
      const archivePath = path.join(customersDir, `${customerId}.txt`);
      fs.writeFileSync(archivePath, archiveContent, 'utf-8');
      
      return {
        success: true,
        message: `客户档案已创建: ${company_name} (${customerId})`,
        data: { id, customerId, companyName: company_name, hasPhone: !!customerData.contactPhone, hasEmail: !!customerData.contactEmail },
      };
    } catch (error: any) {
      return { success: false, error: `创建失败: ${error.message}` };
    }
  },
});

// 13. 批量创建客户档案工具
toolRegistry.register({
  name: 'batch_create_customer_archives',
  description: '批量创建客户档案，接收天眼查搜索结果数组',
  category: '客户管理',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'companies', type: 'array', description: '公司数据数组（来自天眼查搜索）', required: true },
  ],
  executor: async (params) => {
    const { companies } = params;
    if (!companies || !Array.isArray(companies) || companies.length === 0) {
      return { success: false, error: '请提供公司数据数组' };
    }

    try {
      const results = [];
      
      for (const company of companies) {
        // 调用单个创建工具
        const result = await toolRegistry.execute('create_customer_archive', {
          company_name: company.name,
          tianyancha_data: company,
        });
        
        results.push({
          company: company.name,
          success: result.success,
          message: result.message || result.error,
        });
      }
      
      const successCount = results.filter(r => r.success).length;
      
      return {
        success: true,
        message: `批量创建完成：成功 ${successCount}/${results.length}`,
        data: { results, successCount, totalCount: results.length },
      };
    } catch (error: any) {
      return { success: false, error: `批量创建失败: ${error.message}` };
    }
  },
});

console.log('[Agent] 工具注册表初始化完成，已注册', toolRegistry.getAllDefinitions().length, '个工具');
