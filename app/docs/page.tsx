'use client';
import { useState } from 'react';
import { ArrowLeft, MessageSquare, Image, FileText, Settings, Cpu, BookOpen, HelpCircle, ChevronRight } from 'lucide-react';
import Link from 'next/link';

// 文档目录结构
const DOC_SECTIONS = [
  {
    title: '快速入门',
    icon: BookOpen,
    items: [
      { id: 'intro', title: '产品简介' },
      { id: 'quickstart', title: '开始使用' },
      { id: 'models', title: '模型选择与切换' },
    ],
  },
  {
    title: '核心功能',
    icon: MessageSquare,
    items: [
      { id: 'chat', title: '智能对话' },
      { id: 'image', title: '图片识别' },
      { id: 'doc-edit', title: '文档编辑' },
      { id: 'tts', title: '语音合成' },
    ],
  },
  {
    title: '知识库',
    icon: FileText,
    items: [
      { id: 'knowledge', title: '知识库管理' },
      { id: 'upload', title: '文档上传与解析' },
    ],
  },
  {
    title: '系统管理',
    icon: Settings,
    items: [
      { id: 'admin', title: '系统设置' },
      { id: 'model-mgmt', title: '模型管理' },
      { id: 'user-mgmt', title: '用户管理' },
    ],
  },
  {
    title: '常见问题',
    icon: HelpCircle,
    items: [
      { id: 'faq', title: 'FAQ' },
      { id: 'troubleshoot', title: '问题排查' },
    ],
  },
];

// 文档内容
const DOC_CONTENT: Record<string, { title: string; content: string[] }> = {
  intro: {
    title: '产品简介',
    content: [
      'Yinxin.AGI.ai（引信）是一款全栈式私有化AI智能体平台，由引信（中国）技术有限公司开发。',
      '本产品基于 Next.js + React 技术栈构建，支持多种大语言模型（DeepSeek、Qwen、Ollama 本地模型等），提供智能问答、文档识别、数据分析、知识库管理、浏览器自动化等能力。',
      '核心特性：',
      '• 多模型支持：支持云端模型和本地模型，管理员可自由配置',
      '• 私有化部署：数据存储在本地服务器，保障数据安全',
      '• 知识库：支持上传文档构建专属知识库，AI 基于知识库回答问题',
      '• 文档编辑：内置富文本编辑器，支持 AI 润色、导出 Markdown/PDF',
      '• 浏览器自动化：AI 可自动操控浏览器完成网页操作',
      '• 语音合成：支持文字转语音功能',
    ],
  },
  quickstart: {
    title: '开始使用',
    content: [
      '1. 注册与登录',
      '   访问系统首页，点击注册按钮创建账户。填写用户名、密码和邮箱即可完成注册。',
      '',
      '2. 选择模型',
      '   在输入框上方的模型下拉菜单中选择要使用的 AI 模型。系统默认使用快速模型，您也可以手动切换到其他模型。',
      '',
      '3. 开始对话',
      '   在输入框中输入您的问题，按回车或点击发送按钮即可获得 AI 回复。支持多轮连续对话。',
      '',
      '4. 上传图片/文档',
      '   点击输入框左侧的附件按钮，可以上传图片或文档。AI 会自动识别内容并给出回答。',
      '',
      '5. 管理对话',
      '   左侧对话列表可以查看历史对话、创建新对话、搜索对话记录。',
    ],
  },
  models: {
    title: '模型选择与切换',
    content: [
      '本产品支持多种 AI 模型，您可以根据需求灵活选择：',
      '',
      '• DeepSeek 系列：云端模型，适合深度推理和复杂任务',
      '• Qwen 系列：阿里云模型，中文理解能力强',
      '• Ollama 本地模型：完全本地运行，数据不离开您的电脑',
      '',
      '切换方式：在输入框上方的模型下拉菜单中选择目标模型即可。系统会自动根据模型类型选择对应的 API 端点。',
      '',
      '注意：使用 Ollama 本地模型需要先在您的电脑上安装并运行 Ollama 服务。',
    ],
  },
  chat: {
    title: '智能对话',
    content: [
      '智能对话是本产品的核心功能，支持多轮连续对话。',
      '',
      '功能说明：',
      '• 多轮对话：AI 会记住上下文，支持连续追问',
      '• 联网搜索：开启后 AI 会自动搜索互联网获取最新信息',
      '• 知识库问答：开启后 AI 会基于您上传的知识库文档回答问题',
      '• 长文本处理：支持发送长段文字，AI 会进行分析和整理',
      '',
      '对话管理：',
      '• 新建对话：点击左上角「新建对话」按钮',
      '• 搜索对话：在搜索框中输入关键词查找历史对话',
      '• 删除对话：鼠标悬停在对话上，点击删除图标',
    ],
  },
  image: {
    title: '图片识别',
    content: [
      '本产品支持图片识别功能，可以识别图片中的文字、表格、单据等内容。',
      '',
      '使用方式：',
      '1. 点击输入框左侧的附件按钮',
      '2. 选择图片文件（支持 JPG、PNG、GIF、WebP 格式）',
      '3. 添加问题描述（可选）',
      '4. 发送后 AI 会自动识别图片内容并给出回答',
      '',
      '适用场景：',
      '• 识别截图中的文字内容',
      '• 提取单据、发票中的表格数据',
      '• 分析图表、流程图',
      '• 识别手写文字',
    ],
  },
  'doc-edit': {
    title: '文档编辑',
    content: [
      '本产品内置富文本编辑器，支持多种文档编辑和排版功能。',
      '',
      '核心功能：',
      '• 富文本编辑：支持标题、加粗、斜体、列表、表格、代码块等',
      '• AI 润色：选中文字后可使用 AI 进行润色（正式书面语/精简表述/专业术语）',
      '• 导出 Markdown：一键将编辑内容导出为 Markdown 格式',
      '• PDF 打印：通过浏览器打印功能导出为 PDF',
      '',
      '使用方式：',
      '在 AI 回复中点击「转为文档编辑」按钮，即可将回复内容导入编辑器进行二次编辑。',
    ],
  },
  tts: {
    title: '语音合成',
    content: [
      '本产品支持文字转语音功能，将 AI 回复转换为语音播放。',
      '',
      '使用方式：',
      '在 AI 回复下方点击语音播放按钮即可收听。',
      '',
      '注意：语音合成功能需要网络连接，使用阿里云 DashScope TTS 服务。',
    ],
  },
  knowledge: {
    title: '知识库管理',
    content: [
      '知识库功能允许您上传文档，AI 会基于这些文档内容回答问题。',
      '',
      '功能说明：',
      '• 文档上传：支持 TXT、PDF、Word、Excel 等格式',
      '• 自动解析：系统会自动提取文档内容并建立索引',
      '• 智能检索：AI 回答时会自动检索相关知识库内容',
      '• 知识管理：支持查看、删除已上传的文档',
      '',
      '使用场景：',
      '• 上传公司规章制度，AI 基于制度回答合规问题',
      '• 上传产品文档，AI 作为产品知识助手',
      '• 上传合同模板，AI 辅助合同审查',
    ],
  },
  upload: {
    title: '文档上传与解析',
    content: [
      '支持的文件格式：',
      '• 文本文件：TXT、Markdown',
      '• 文档文件：PDF、Word（.docx）、Excel（.xlsx）',
      '• 图片文件：JPG、PNG（会进行 OCR 文字识别）',
      '',
      '上传限制：',
      '• 单个文件大小不超过 50MB',
      '• 文件内容会被自动提取和分块索引',
      '• 上传后可在知识库管理页面查看解析状态',
    ],
  },
  admin: {
    title: '系统设置',
    content: [
      '系统设置是管理员的后台管理界面，提供系统配置和管理功能。',
      '',
      '入口：点击顶部导航栏的设置图标，或点击用户头像 → 选择「系统设置」',
      '',
      '系统设置功能：',
      '• RAG技术：知识库管理、提词器管理、记忆看板',
      '• 数据存储：数据存储模式配置、数据同步',
      '• 用户管理：查看和管理注册用户',
      '• 模型管理：配置 AI 模型、API 密钥、语音设置、运行参数',
      '',
      '注意：系统设置仅限管理员角色访问。',
    ],
  },
  'model-mgmt': {
    title: '模型管理',
    content: [
      '在系统设置的「模型管理」中，管理员可以：',
      '',
      '• 模型接入：查看、添加、编辑 AI 模型（DeepSeek、Qwen、Ollama 等）',
      '• API管理：配置模型 API 密钥和端点地址',
      '• 语音设置：配置文字转语音（TTS）服务参数',
      '• 运行参数：全局系统参数设置（如温度、最大token等）',
      '',
      '模型操作：',
      '• 启用/禁用：控制模型是否在用户端显示',
      '• 设为默认：设置用户默认使用的模型',
      '• 测试连接：验证模型 API 是否可用',
      '',
      '模型数据持久化存储，重启服务不会丢失配置。',
    ],
  },
  'user-mgmt': {
    title: '用户管理',
    content: [
      '在系统设置的「用户管理」中，管理员可以：',
      '',
      '• 查看用户列表：查看所有注册用户的信息',
      '• 角色管理：设置用户角色（普通用户/管理员）',
      '• 账户管理：启用/禁用用户账户',
      '',
      '用户角色说明：',
      '• 普通用户：可以使用 AI 对话、知识库等基本功能',
      '• 管理员：除了普通用户功能外，还可以访问系统设置进行系统配置',
    ],
  },
  faq: {
    title: '常见问题',
    content: [
      'Q：为什么 AI 回复很慢？',
      'A：可能原因：1）网络连接不稳定；2）使用的模型响应较慢（深度模型比快速模型慢）；3）开启了联网搜索。建议切换到快速模型或关闭联网搜索。',
      '',
      'Q：为什么提示「AI 服务暂时不可用」？',
      'A：可能原因：1）API 密钥无效或过期；2）模型 API 服务中断；3）本地 Ollama 服务未运行。请检查模型配置或联系管理员。',
      '',
      'Q：如何使用本地模型？',
      'A：需要先安装 Ollama（https://ollama.com），拉取所需模型，确保 Ollama 服务正在运行。然后在模型下拉菜单中选择 Ollama 模型即可。',
      '',
      'Q：上传的文档安全吗？',
      'A：文档存储在您本地部署的服务器上，不会自动上传到第三方云服务。但使用云端 AI 模型时，对话内容会发送至模型提供商。',
      '',
      'Q：如何备份数据？',
      'A：系统数据存储在 data 目录下（models.json、changelog.json 等），直接备份该目录即可。',
    ],
  },
  troubleshoot: {
    title: '问题排查',
    content: [
      '常见问题及解决方案：',
      '',
      '1. 页面加载失败',
      '   → 检查网络连接，确认服务正在运行',
      '',
      '2. 模型调用失败（400 错误）',
      '   → 检查模型配置是否正确，API 密钥是否有效',
      '',
      '3. Ollama 模型无法连接（500 错误）',
      '   → 确认 Ollama 服务正在运行：在终端执行 ollama list 查看已安装模型',
      '',
      '4. 知识库上传失败',
      '   → 检查文件格式是否支持，文件大小是否超过限制',
      '',
      '5. 页面显示异常',
      '   → 尝试 Ctrl+Shift+R 强制刷新浏览器缓存',
      '',
      '如以上方法无法解决问题，请联系：support@yinxin.ai',
    ],
  },
};

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('intro');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentDoc = DOC_CONTENT[activeSection];

  const handleSectionChange = (id: string) => {
    setActiveSection(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* 顶部导航 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              <ArrowLeft size={16} />
              返回首页
            </Link>
            <span className="text-gray-300">|</span>
            <h1 className="text-lg font-bold text-gray-900">帮助文档</h1>
          </div>
          {/* 移动端菜单按钮 */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Cpu size={20} className="text-gray-600" />
          </button>
        </div>

        <div className="flex gap-6">
          {/* 移动端遮罩 */}
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMobileMenuOpen(false)} />
          )}

          {/* 左侧目录 */}
          <aside className={`
            fixed md:static z-40 top-0 left-0 h-full w-64 bg-white border-r border-gray-200
            md:w-56 md:flex-shrink-0 md:h-auto md:border md:rounded-xl overflow-y-auto
            transition-transform duration-300
            ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            pt-16 md:pt-0
          `}>
            <nav className="p-4 space-y-4">
              {DOC_SECTIONS.map((section) => {
                const Icon = section.icon;
                return (
                  <div key={section.title}>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon size={14} className="text-gray-400" />
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{section.title}</span>
                    </div>
                    <ul className="space-y-0.5">
                      {section.items.map((item) => (
                        <li key={item.id}>
                          <button
                            onClick={() => handleSectionChange(item.id)}
                            className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors ${
                              activeSection === item.id
                                ? 'bg-green-50 text-green-700 font-medium'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                          >
                            {item.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </nav>
          </aside>

          {/* 右侧内容 */}
          <main className="flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-gray-200 p-6 md:p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">{currentDoc?.title}</h2>
              <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
                {currentDoc?.content.map((line, i) => {
                  if (line === '') return <div key={i} className="h-2" />;
                  if (line.startsWith('Q：') || line.startsWith('Q:'))
                    return <p key={i} className="font-medium text-gray-900">{line}</p>;
                  if (line.startsWith('A：') || line.startsWith('A:'))
                    return <p key={i}>{line}</p>;
                  if (/^\d+\./.test(line))
                    return <p key={i} className="font-medium text-gray-800">{line}</p>;
                  if (line.startsWith('•'))
                    return <p key={i} className="pl-4">{line}</p>;
                  if (line.startsWith('→'))
                    return <p key={i} className="pl-4 text-gray-600">{line}</p>;
                  return <p key={i}>{line}</p>;
                })}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
