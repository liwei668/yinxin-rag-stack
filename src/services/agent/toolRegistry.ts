// 工具注册表 - 真实浏览器操作工具（Playwright 驱动）
import { ToolDefinition, ToolResult } from './types';
import { browserManagerFactory } from './browserManagerFactory';
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
        riskLevel: tool.riskLevel,
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

// ========== 注册浏览器操作工具（Playwright 驱动） ==========

// 1. 浏览器导航 - 真实打开网页
toolRegistry.register({
  name: 'browser_navigate',
  description: '打开指定网页，等待页面加载完成，返回页面标题和内容摘要',
  category: '浏览器',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'url', type: 'string', description: '要打开的网址（如 https://www.baidu.com）', required: true },
    { name: 'wait_for', type: 'string', description: '等待特定元素出现（CSS选择器）', required: false },
  ],
  executor: async (params, userId) => {
    const { url, wait_for } = params;
    if (!url) return { success: false, error: '缺少 url 参数' };

    try {
      const bm = await browserManagerFactory.getManager(userId || 'default');
      const fullUrl = url.startsWith('http') ? url : `https://${url}`;
      
      // 检查 URL 是否在白名单中
      const { allowed, reason } = permissionController.isUrlAllowed(fullUrl);
      if (!allowed) {
        return { success: false, error: `URL 访问被拒绝: ${reason}` };
      }
      
      const { url: finalUrl, title } = await bm.navigate(fullUrl);

      // 如果指定了等待元素
      if (wait_for) {
        await bm.waitForSelector(wait_for, 10000);
      } else {
        // 默认等待页面基本渲染完成（body 可见 + 主要内容出现）
        await bm.waitForSelector('body', 5000);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      // 获取页面内容摘要
      const content = await bm.getPageContent();
      const contentSummary = content.substring(0, 3000);

      // 截图
      const screenshot = await bm.screenshot();

      return {
        success: true,
        message: `已打开: ${title}`,
        screenshot: `data:image/png;base64,${screenshot}`,
        data: {
          url: finalUrl,
          title,
          content: contentSummary,
        },
      };
    } catch (error: any) {
      return { success: false, error: `打开网页失败: ${error.message}` };
    }
  },
});

// 2. 浏览器点击 - 真实点击页面元素
toolRegistry.register({
  name: 'browser_click',
  description: '点击页面上的元素（按钮、链接等），支持CSS选择器或文本内容匹配',
  category: '浏览器',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'selector', type: 'string', description: 'CSS选择器（如 #login-btn, .submit-button）或元素文本内容（如 "登录", "搜索"）', required: true },
    { name: 'description', type: 'string', description: '要点击的元素描述（用于日志）', required: false },
  ],
  executor: async (params, userId) => {
    const { selector, description } = params;
    if (!selector) return { success: false, error: '缺少 selector 参数' };

    try {
      const bm = await browserManagerFactory.getManager(userId || 'default');
      const result = await bm.click(selector);

      if (!result.success) {
        return { success: false, error: result.message };
      }

      // 等待页面响应
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 截图
      const screenshot = await bm.screenshot();

      // 获取更新后的页面信息
      const info = await bm.getBrowserInfo();

      return {
        success: true,
        message: result.message,
        screenshot: `data:image/png;base64,${screenshot}`,
        data: {
          currentUrl: info.url,
          currentTitle: info.title,
        },
      };
    } catch (error: any) {
      return { success: false, error: `点击失败: ${error.message}` };
    }
  },
});

// 3. 浏览器输入 - 在输入框中输入文字
toolRegistry.register({
  name: 'browser_type',
  description: '在页面输入框中输入文字，支持CSS选择器或placeholder匹配',
  category: '浏览器',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'selector', type: 'string', description: '输入框的CSS选择器（如 #username, input[name="phone"]）或placeholder文本', required: true },
    { name: 'text', type: 'string', description: '要输入的文字', required: true },
    { name: 'press_enter', type: 'boolean', description: '输入后是否按回车键', required: false, default: false },
    { name: 'clear_first', type: 'boolean', description: '输入前是否先清空输入框', required: false, default: true },
  ],
  executor: async (params, userId) => {
    const { selector, text, press_enter, clear_first } = params;
    if (!selector || text === undefined) return { success: false, error: '缺少 selector 或 text 参数' };

    try {
      const bm = await browserManagerFactory.getManager(userId || 'default');
      const result = await bm.type(selector, text);

      if (!result.success) {
        return { success: false, error: result.message };
      }

      // 如果需要按回车
      if (press_enter) {
        await bm.press('Enter');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 截图
      const screenshot = await bm.screenshot();

      return {
        success: true,
        message: `已输入 "${text}"${press_enter ? ' 并按回车' : ''}`,
        screenshot: `data:image/png;base64,${screenshot}`,
        data: { selector, text },
      };
    } catch (error: any) {
      return { success: false, error: `输入失败: ${error.message}` };
    }
  },
});

// 4. 浏览器截图 - 获取当前页面截图
toolRegistry.register({
  name: 'browser_screenshot',
  description: '截取当前浏览器页面的截图',
  category: '浏览器',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'full_page', type: 'boolean', description: '是否截取整个页面（包括滚动区域）', required: false, default: false },
  ],
  executor: async (params, userId) => {
    try {
      const bm = await browserManagerFactory.getManager(userId || 'default');
      const screenshot = await bm.screenshot();
      const info = await bm.getBrowserInfo();

      return {
        success: true,
        message: `截图完成: ${info.title || '无标题'}`,
        screenshot: `data:image/png;base64,${screenshot}`,
        data: {
          url: info.url,
          title: info.title,
        },
      };
    } catch (error: any) {
      return { success: false, error: `截图失败: ${error.message}` };
    }
  },
});

// 5. 浏览器读取 - 读取页面内容
toolRegistry.register({
  name: 'browser_read',
  description: '读取当前浏览器页面的文本内容或结构化快照',
  category: '浏览器',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'mode', type: 'string', description: '读取模式: "text" 获取文本内容, "snapshot" 获取结构化快照（表单、链接、按钮等）', required: false, default: 'text' },
  ],
  executor: async (params, userId) => {
    const { mode } = params;

    try {
      const bm = await browserManagerFactory.getManager(userId || 'default');
      if (mode === 'snapshot') {
        const snapshot = await bm.getPageSnapshot();
        const screenshot = await bm.screenshot();

        return {
          success: true,
          message: `页面快照: ${snapshot.title} (${snapshot.links.length} 链接, ${snapshot.buttons.length} 按钮, ${snapshot.inputs.length} 输入框)`,
          screenshot: `data:image/png;base64,${screenshot}`,
          data: snapshot,
        };
      }

      // 默认读取文本内容
      const content = await bm.getPageContent();
      const info = await bm.getBrowserInfo();
      const screenshot = await bm.screenshot();

      return {
        success: true,
        message: `已读取页面内容 (${content.length} 字符)`,
        screenshot: `data:image/png;base64,${screenshot}`,
        data: {
          url: info.url,
          title: info.title,
          text: content.substring(0, 8000),
        },
      };
    } catch (error: any) {
      return { success: false, error: `读取失败: ${error.message}` };
    }
  },
});

// 6. 浏览器滚动 - 滚动页面
toolRegistry.register({
  name: 'browser_scroll',
  description: '向上或向下滚动页面',
  category: '浏览器',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'direction', type: 'string', description: '滚动方向: "up" 或 "down"', required: true },
    { name: 'amount', type: 'number', description: '滚动像素数（默认500）', required: false, default: 500 },
  ],
  executor: async (params, userId) => {
    const { direction, amount } = params;
    if (!direction) return { success: false, error: '缺少 direction 参数' };

    try {
      const bm = await browserManagerFactory.getManager(userId || 'default');
      const result = await bm.scroll(direction, amount);
      const screenshot = await bm.screenshot();

      return {
        success: true,
        message: `已${direction === 'down' ? '向下' : '向上'}滚动 ${amount || 500}px`,
        screenshot: `data:image/png;base64,${screenshot}`,
        data: { direction, amount: amount || 500 },
      };
    } catch (error: any) {
      return { success: false, error: `滚动失败: ${error.message}` };
    }
  },
});

// 7. 浏览器按键 - 按下键盘按键
toolRegistry.register({
  name: 'browser_press',
  description: '按下键盘按键（如 Enter, Tab, Escape, Backspace 等）',
  category: '浏览器',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'key', type: 'string', description: '按键名称（如 Enter, Tab, Escape, Backspace, ArrowDown 等）', required: true },
  ],
  executor: async (params, userId) => {
    const { key } = params;
    if (!key) return { success: false, error: '缺少 key 参数' };

    try {
      const bm = await browserManagerFactory.getManager(userId || 'default');
      await bm.press(key);
      await new Promise(resolve => setTimeout(resolve, 500));
      const screenshot = await bm.screenshot();

      return {
        success: true,
        message: `已按下按键: ${key}`,
        screenshot: `data:image/png;base64,${screenshot}`,
        data: { key },
      };
    } catch (error: any) {
      return { success: false, error: `按键失败: ${error.message}` };
    }
  },
});

// 8. 等待元素
toolRegistry.register({
  name: 'browser_wait',
  description: '等待页面上的元素出现，或等待指定时间',
  category: '浏览器',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'selector', type: 'string', description: '要等待的元素CSS选择器', required: false },
    { name: 'timeout', type: 'number', description: '等待超时时间（毫秒，默认10000）', required: false, default: 10000 },
    { name: 'time', type: 'number', description: '固定等待时间（毫秒），与 selector 二选一', required: false },
  ],
  executor: async (params, userId) => {
    const { selector, timeout, time } = params;

    try {
      const bm = await browserManagerFactory.getManager(userId || 'default');
      if (time) {
        // 固定等待
        await new Promise(resolve => setTimeout(resolve, time));
        const screenshot = await bm.screenshot();
        return {
          success: true,
          message: `已等待 ${time}ms`,
          screenshot: `data:image/png;base64,${screenshot}`,
        };
      }

      if (selector) {
        const found = await bm.waitForSelector(selector, timeout || 10000);
        const screenshot = await bm.screenshot();
        if (found) {
          return {
            success: true,
            message: `元素 ${selector} 已出现`,
            screenshot: `data:image/png;base64,${screenshot}`,
          };
        }
        return {
          success: false,
          error: `等待元素 ${selector} 超时 (${timeout || 10000}ms)`,
          screenshot: `data:image/png;base64,${screenshot}`,
        };
      }

      return { success: false, error: '缺少 selector 或 time 参数' };
    } catch (error: any) {
      return { success: false, error: `等待失败: ${error.message}` };
    }
  },
});

// 9. 联网搜索 - 通过浏览器在百度搜索
toolRegistry.register({
  name: 'web_search',
  description: '通过百度搜索引擎搜索信息，返回搜索结果',
  category: '搜索',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'query', type: 'string', description: '搜索关键词', required: true },
  ],
  executor: async (params, userId) => {
    const { query } = params;
    if (!query) return { success: false, error: '缺少 query 参数' };

    try {
      const bm = await browserManagerFactory.getManager(userId || 'default');
      // 导航到百度搜索
      const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;
      const { url, title } = await bm.navigate(searchUrl);

      // 等待搜索结果加载
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 获取页面内容
      const content = await bm.getPageContent();
      const screenshot = await bm.screenshot();

      return {
        success: true,
        message: `搜索 "${query}" 完成`,
        screenshot: `data:image/png;base64,${screenshot}`,
        data: {
          url,
          title,
          content: content.substring(0, 5000),
        },
      };
    } catch (error: any) {
      return { success: false, error: `搜索失败: ${error.message}` };
    }
  },
});

// 10. 知识库查询（保留）
toolRegistry.register({
  name: 'knowledge_query',
  description: '查询企业知识库中的信息',
  category: '知识库',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'query', type: 'string', description: '查询内容', required: true },
    { name: 'top_k', type: 'number', description: '返回结果数量', required: false, default: 3 },
  ],
  executor: async (params) => {
    return { success: true, message: `已查询知识库: ${params.query}`, data: [] };
  },
});

// 10.5 天眼查企业信息查询
toolRegistry.register({
  name: 'tianyancha_search',
  description: '通过天眼查API查询企业信息，支持公司名称搜索和企业详情查询，并可自动保存到客户档案',
  category: '搜索',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'company_name', type: 'string', description: '公司名称（如：阿里巴巴）', required: false },
    { name: 'keyword', type: 'string', description: '搜索关键词（与company_name二选一）', required: false },
    { name: 'company_id', type: 'string', description: '公司ID（用于获取详细信息，与前两个参数互斥）', required: false },
    { name: 'page_size', type: 'number', description: '每页返回数量（默认10）', required: false, default: 10 },
    { name: 'page_num', type: 'number', description: '页码（默认1）', required: false, default: 1 },
    { name: 'save_to_archive', type: 'boolean', description: '是否自动保存到客户档案（默认true）', required: false, default: true },
  ],
  executor: async (params) => {
    const { company_name, keyword, company_id, page_size, page_num, save_to_archive } = params;
    
    try {
      const { callAPI } = await import('../../api/apiManager');
      
      if (company_id) {
        // 获取公司详情
        const result = await callAPI('tianyancha-company-api', 'getCompanyDetail', {
          companyId: company_id
        });
        
        if (!result) {
          return { success: false, error: '未找到该公司信息' };
        }
        
        // 如果需要保存到客户档案
        if (save_to_archive !== false) {
          const { customerArchiveStore, writeCustomerFile } = await import('../../../lib/customerArchiveStore');
          
          // 创建或更新客户档案
          const existing = customerArchiveStore.findByCustomerId(company_id);
          let archiveId: string;
          
          if (existing) {
            customerArchiveStore.update(existing.id, {
              companyName: result.name || company_name || '未知公司',
              industry: result.industry || result.type || '',
              notes: JSON.stringify(result, null, 2),
              updatedAt: new Date().toISOString(),
            });
            archiveId = existing.id;
          } else {
            archiveId = customerArchiveStore.create({
              customerId: company_id,
              companyName: result.name || company_name || '未知公司',
              contactName: '',
              contactEmail: '',
              industry: result.industry || result.type || '',
              notes: JSON.stringify(result, null, 2),
              tags: ['天眼查', '企业信息'],
              status: 'active',
            });
          }
          
          // 保存详细档案文件
          const fileContent = `[客户画像]
公司名称：${result.name || '未知公司'}
行业：${result.industry || result.type || '未知'}
公司ID：${company_id}
注册资本：${result.regCapital || '未知'}
成立时间：${result.establishTime || '未知'}
注册地址：${result.address || '未知'}
经营范围：${result.businessScope || '未知'}

[公司详情]
${JSON.stringify(result, null, 2)}

[对话记录]

[待办事项]
`;
          writeCustomerFile(company_id, fileContent);
          
          return {
            success: true,
            message: `已获取公司详情: ${result.name || '未知公司'}，并已保存到客户档案`,
            data: { ...result, archiveId },
          };
        }
        
        return {
          success: true,
          message: `已获取公司详情: ${result.name || '未知公司'}`,
          data: result,
        };
      } else if (company_name || keyword) {
        // 搜索公司
        const result = await callAPI('tianyancha-company-api', 'searchCompany', {
          name: company_name,
          keyword,
          pageSize: page_size,
          pageNum: page_num
        });
        
        const count = result.data?.length || 0;
        
        // 如果只找到一个公司，自动保存到档案
        if (count === 1 && save_to_archive !== false && result.data?.[0]) {
          const company = result.data[0];
          const { customerArchiveStore, writeCustomerFile } = await import('../../../lib/customerArchiveStore');
          
          const existing = customerArchiveStore.findByCustomerId(company.id || company.companyId || company_name || '');
          
          if (!existing) {
            const archiveId = customerArchiveStore.create({
              customerId: company.id || company.companyId || company_name || '',
              companyName: company.name || company.companyName || company_name || '未知公司',
              contactName: '',
              contactEmail: '',
              industry: company.industry || company.type || '',
              notes: JSON.stringify(company, null, 2),
              tags: ['天眼查', '企业信息'],
              status: 'active',
            });
            
            const fileContent = `[客户画像]
公司名称：${company.name || company.companyName || '未知公司'}
行业：${company.industry || company.type || '未知'}
公司ID：${company.id || company.companyId || '未知'}

[公司信息]
${JSON.stringify(company, null, 2)}

[对话记录]

[待办事项]
`;
            writeCustomerFile(company.id || company.companyId || company_name || '', fileContent);
            
            return {
              success: true,
              message: `搜索完成，找到 ${count} 家公司，已自动保存到客户档案`,
              data: { ...result, archiveId },
            };
          }
        }
        
        return {
          success: true,
          message: `搜索完成，找到 ${count} 家公司`,
          data: result,
        };
      } else {
        return { success: false, error: '请提供公司名称、关键词或公司ID' };
      }
    } catch (error: any) {
      return { success: false, error: `天眼查查询失败: ${error.message}` };
    }
  },
});

// 10.6 天眼查批量搜索+社保筛选+自动归档
toolRegistry.register({
  name: 'tianyancha_batch_search',
  description: '批量搜索企业并按社保人数筛选，支持按城市、行业、关键词搜索，自动获取社保人数并筛选符合条件的公司，可自动归档到客户档案。例如：搜索成都社保人数超过20人的科技企业，找5家。',
  category: '搜索',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'city', type: 'string', description: '城市名称（如：成都、北京、上海）', required: true },
    { name: 'keyword', type: 'string', description: '搜索关键词（如：科技、餐饮、教育）', required: false },
    { name: 'industry', type: 'string', description: '行业名称（如：科技推广和应用服务业）', required: false },
    { name: 'min_social_staff_num', type: 'number', description: '最小社保人数（默认20）', required: false, default: 20 },
    { name: 'max_results', type: 'number', description: '最多返回多少家符合条件的企业（默认5）', required: false, default: 5 },
    { name: 'save_to_archive', type: 'boolean', description: '是否自动保存到客户档案（默认true）', required: false, default: true },
  ],
  executor: async (params) => {
    const {
      city,
      keyword,
      industry,
      min_social_staff_num = 20,
      max_results = 5,
      save_to_archive = true,
    } = params;

    try {
      const { batchSearchAndArchive } = await import('../../lib/tianyanchaMCPClient');

      const result = await batchSearchAndArchive({
        city,
        keyword,
        industry,
        minSocialStaffNum: min_social_staff_num,
        maxResults: max_results,
        saveToArchive: save_to_archive,
      });

      if (!result.success) {
        return { success: false, error: result.message };
      }

      // 格式化输出
      const companyList = result.companies.map(c => ({
        name: c.company.name,
        creditCode: c.company.creditCode,
        legalPerson: c.company.legalPersonName,
        socialStaffNum: c.company.socialStaffNum,
        staffNumRange: c.company.staffNumRange,
        regCapital: c.company.regCapital,
        industry: c.company.industry,
        regStatus: c.company.regStatus,
        address: c.company.regLocation || c.company.city,
        phone: c.company.phoneNumber,
        archived: c.archived,
      }));

      return {
        success: true,
        message: result.message,
        data: {
          totalSearched: result.totalSearched,
          qualifiedCount: result.qualifiedCount,
          archivedCount: result.archivedCount,
          companies: companyList,
          errors: result.errors?.length > 0 ? result.errors : undefined,
        },
      };
    } catch (error: any) {
      return { success: false, error: `批量搜索失败: ${error.message}` };
    }
  },
});

// 11. 生成文档（保留）
toolRegistry.register({
  name: 'generate_document',
  description: '生成文档内容',
  category: '文档',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'title', type: 'string', description: '文档标题', required: true },
    { name: 'content', type: 'string', description: '文档内容', required: true },
    { name: 'format', type: 'string', description: '文档格式', required: false, default: 'docx' },
  ],
  executor: async (params) => {
    return {
      success: true,
      message: `已生成${params.format}文档: ${params.title}`,
      data: { title: params.title, content: params.content },
    };
  },
});

// 12. 等待人工操作 - 暂停执行等待用户确认
toolRegistry.register({
  name: 'wait_human',
  description: '暂停执行，等待用户手动操作（如输入验证码、处理CAPTCHA等）',
  category: '系统',
  riskLevel: 'manual',
  requiresApproval: true,
  parameters: [
    { name: 'reason', type: 'string', description: '需要人工操作的原因', required: true },
    { name: 'instruction', type: 'string', description: '给用户的操作指引', required: true },
  ],
  executor: async (params, userId) => {
    // 截图当前页面状态供用户参考
    let screenshot: string | undefined;
    try {
      const bm = await browserManagerFactory.getManager(userId || 'default');
      const base64 = await bm.screenshot();
      screenshot = `data:image/png;base64,${base64}`;
    } catch {}

    return {
      success: true,
      message: `等待用户操作: ${params.reason}`,
      screenshot,
      data: { waiting: true, instruction: params.instruction },
    };
  },
});

// 13. 鼠标悬停 - 触发下拉菜单、工具提示等
toolRegistry.register({
  name: 'browser_hover',
  description: '将鼠标悬停在指定元素上（触发下拉菜单、工具提示、悬浮效果等）',
  category: '交互',
  riskLevel: 'low',
  parameters: [
    { name: 'selector', type: 'string', description: '要悬停的元素文本或CSS选择器', required: true },
  ],
  executor: async (params, userId) => {
    const bm = await browserManagerFactory.getManager(userId || 'default');
    const result = await bm.hover(params.selector);
    return {
      success: result.success,
      message: result.message,
    };
  },
});

// 14. 选择下拉框选项
toolRegistry.register({
  name: 'browser_select',
  description: '在下拉框中选择指定选项（适用于 select 下拉框、日期选择器等）',
  category: '交互',
  riskLevel: 'low',
  parameters: [
    { name: 'selector', type: 'string', description: '下拉框的 id、name 或 CSS 选择器', required: true },
    { name: 'value', type: 'string', description: '要选择的选项文本', required: true },
  ],
  executor: async (params, userId) => {
    const bm = await browserManagerFactory.getManager(userId || 'default');
    const result = await bm.selectOption(params.selector, params.value);
    return {
      success: result.success,
      message: result.message,
    };
  },
});

// 15. 上传文件
toolRegistry.register({
  name: 'browser_upload',
  description: '上传文件到文件输入框（支持图片、文档等）',
  category: '交互',
  riskLevel: 'medium',
  parameters: [
    { name: 'selector', type: 'string', description: '文件输入框的 CSS 选择器（默认取第一个 input[type=file]）', required: false },
    { name: 'file_path', type: 'string', description: '要上传的文件路径', required: true },
  ],
  executor: async (params, userId) => {
    const bm = await browserManagerFactory.getManager(userId || 'default');
    const result = await bm.uploadFile(params.selector || '', params.file_path);
    return {
      success: result.success,
      message: result.message,
    };
  },
});

// 16. 多标签页管理
toolRegistry.register({
  name: 'browser_tab',
  description: '管理浏览器标签页（新建、切换、关闭、列出）',
  category: '导航',
  riskLevel: 'low',
  parameters: [
    { name: 'action', type: 'string', description: '操作类型: new(新建)、switch(切换)、close(关闭)、list(列出)', required: true },
    { name: 'index', type: 'number', description: '标签页索引（switch/close 时使用）', required: false },
    { name: 'url', type: 'string', description: '新建标签页时打开的 URL', required: false },
  ],
  executor: async (params, userId) => {
    const bm = await browserManagerFactory.getManager(userId || 'default');
    switch (params.action) {
      case 'new': {
        const ok = await bm.newTab(params.url);
        return { success: ok, message: ok ? `已新建标签页: ${params.url || '空白页'}` : '新建标签页失败' };
      }
      case 'switch': {
        const ok = await bm.switchTab(params.index ?? 0);
        return { success: ok, message: ok ? `已切换到标签页 ${params.index}` : '切换失败' };
      }
      case 'close': {
        const ok = await bm.closeTab(params.index);
        return { success: ok, message: ok ? `已关闭标签页 ${params.index ?? '当前'}` : '关闭失败' };
      }
      case 'list': {
        const tabs = await bm.getTabs();
        return { success: true, message: `共 ${tabs.length} 个标签页`, data: tabs };
      }
      default:
        return { success: false, message: `未知操作: ${params.action}，支持: new/switch/close/list` };
    }
  },
});

export default toolRegistry;

// ========== 注册桌面控制工具 ==========

// 17. desktop_click - 点击桌面
toolRegistry.register({
  name: 'desktop_click',
  description: '点击用户本地电脑屏幕上的指定位置（百分比坐标）',
  category: '桌面控制',
  riskLevel: 'medium',
  requiresApproval: true,
  parameters: [
    { name: 'x', type: 'number', description: 'X坐标百分比(0-100)', required: true },
    { name: 'y', type: 'number', description: 'Y坐标百分比(0-100)', required: true },
    { name: 'button', type: 'string', description: '鼠标按键: left/right/double', required: false },
  ],
  executor: async (params, userId) => {
    const { desktopManager } = await import('./desktopManager');
    const uid = userId || params.userId || 'default';
    const result = await desktopManager.sendCommand(
      uid,
      { action: 'click', x: params.x, y: params.y, button: params.button || 'left' }
    );
    const screenshot = await desktopManager.getScreenshot(uid);
    return {
      success: true,
      message: `已点击桌面 (${params.x}%, ${params.y}%)`,
      screenshot: screenshot ? `data:image/png;base64,${screenshot}` : undefined,
      data: result,
    };
  },
});

// 18. desktop_type - 桌面输入文字
toolRegistry.register({
  name: 'desktop_type',
  description: '在用户本地电脑上输入文字（先点击目标位置再输入）',
  category: '桌面控制',
  riskLevel: 'medium',
  requiresApproval: true,
  parameters: [
    { name: 'text', type: 'string', description: '要输入的文字', required: true },
    { name: 'x', type: 'number', description: '点击位置的X坐标百分比', required: false },
    { name: 'y', type: 'number', description: '点击位置的Y坐标百分比', required: false },
  ],
  executor: async (params, userId) => {
    const { desktopManager } = await import('./desktopManager');
    const uid = userId || params.userId || 'default';
    if (params.x !== undefined && params.y !== undefined) {
      await desktopManager.sendCommand(uid, { action: 'click', x: params.x, y: params.y });
      await new Promise(r => setTimeout(r, 200));
    }
    const result = await desktopManager.sendCommand(uid, { action: 'type', text: params.text, clearFirst: true });
    const screenshot = await desktopManager.getScreenshot(uid);
    return {
      success: true,
      message: `已在桌面输入: "${params.text.substring(0, 20)}${params.text.length > 20 ? '...' : ''}"`,
      screenshot: screenshot ? `data:image/png;base64,${screenshot}` : undefined,
      data: result,
    };
  },
});

// 19. desktop_screenshot - 桌面截图
toolRegistry.register({
  name: 'desktop_screenshot',
  description: '截取用户本地电脑的屏幕截图',
  category: '桌面控制',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [],
  executor: async (params, userId) => {
    const { desktopManager } = await import('./desktopManager');
    const uid = userId || params.userId || 'default';
    const base64 = await desktopManager.getScreenshot(uid);
    if (!base64) {
      return { success: false, error: '无法获取桌面截图，客户端可能未连接' };
    }
    return {
      success: true,
      message: '已获取桌面截图',
      screenshot: `data:image/png;base64,${base64}`,
    };
  },
});

// 20. desktop_hotkey - 桌面快捷键
toolRegistry.register({
  name: 'desktop_hotkey',
  description: '在用户本地电脑上执行快捷键组合（如 ctrl+c, alt+tab）',
  category: '桌面控制',
  riskLevel: 'medium',
  requiresApproval: true,
  parameters: [
    { name: 'keys', type: 'string', description: '快捷键组合，用+连接（如 ctrl+c, alt+tab）', required: true },
  ],
  executor: async (params, userId) => {
    const { desktopManager } = await import('./desktopManager');
    const uid = userId || params.userId || 'default';
    const keys = params.keys.split('+').map(k => k.trim());
    const result = await desktopManager.sendCommand(
      uid,
      { action: 'hotkey', keys }
    );
    const screenshot = await desktopManager.getScreenshot(uid);
    return {
      success: true,
      message: `已执行快捷键: ${params.keys}`,
      screenshot: screenshot ? `data:image/png;base64,${screenshot}` : undefined,
      data: result,
    };
  },
});

// 21. browser_reload: 刷新当前页面
toolRegistry.register({
  name: 'browser_reload',
  description: '刷新（重新加载）当前页面',
  category: '浏览器',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [],
  executor: async (params, userId) => {
    const bm = await browserManagerFactory.getManager(userId || 'default');
    const { url, title } = await bm.reload();
    const screenshot = await bm.screenshot();
    return {
      success: true,
      message: `已刷新页面: ${title}`,
      screenshot: `data:image/png;base64,${screenshot}`,
      data: { url, title },
    };
  },
});

// 22. browser_download: 下载文件
toolRegistry.register({
  name: 'browser_download',
  description: '下载文件（如导出CSV、下载附件等），保存到服务器 data/downloads 目录',
  category: '浏览器',
  riskLevel: 'low',
  requiresApproval: false,
  parameters: [
    { name: 'url', type: 'string', description: '下载链接URL（如为空则等待页面触发的下载）', required: false },
  ],
  executor: async (params, userId) => {
    const bm = await browserManagerFactory.getManager(userId || 'default');
    const result = await bm.downloadFile(params.url);
    return {
      success: true,
      message: `文件已下载: ${result.fileName} (${(result.size / 1024).toFixed(1)} KB)`,
      data: result,
    };
  },
});
