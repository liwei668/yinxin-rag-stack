# Yinxin.AGI.ai - 联网功能实现方案

## 一、方案概述

本方案为 **Yinxin.AGI.ai** 平台添加联网搜索功能，让 AI 能够访问互联网获取实时信息，提供更准确、更及时的回答。

联网搜索是 Yinxin.AGI.ai 智能对话系统的核心增强功能之一。

## 二、功能特性

- **实时联网搜索**：AI可以搜索最新的网络信息
- **多搜索引擎支持**：支持Google、Bing等多种搜索引擎
- **搜索结果整合**：自动分析和整合搜索结果
- **智能决策**：AI根据问题自动判断是否需要联网
- **用户可控**：用户可以选择是否启用联网功能

## 三、技术实现方案

### 方案1：使用Serper API（推荐）

**优势**：
- 专业的搜索API，支持Google搜索
- 响应速度快，结果质量高
- 易于集成，文档完善
- 有免费额度

**实现步骤**：

1. **注册Serper API**
   - 访问 https://serper.dev/ 注册账号
   - 获取API密钥

2. **创建搜索API路由**
   - 创建 `app/api/search/route.ts` 文件

3. **修改前端组件**
   - 在TaskInput组件中添加联网搜索开关
   - 实现搜索结果展示

4. **修改聊天API**
   - 集成搜索功能到聊天流程

### 方案2：使用Bing Search API

**优势**：
- Microsoft官方API，稳定性高
- 支持多种搜索类型
- 企业级支持

**实现步骤**：
- 注册Azure账号
- 创建Bing Search资源
- 获取API密钥
- 实现类似的集成方案

### 方案3：使用自定义爬虫（不推荐）

**优势**：
- 完全免费
- 可以定制搜索逻辑

**劣势**：
- 开发复杂度高
- 可能违反网站爬虫规则
- 稳定性差
- 响应速度慢

## 四、具体实现

### 1. 后端API实现

**创建 `app/api/search/route.ts`**：

```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { query, type = 'web' } = await request.json()
    
    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 })
    }
    
    // Serper API配置
    const apiKey = process.env.SERPER_API_KEY || 'your-api-key'
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      },
      body: JSON.stringify({
        q: query,
        type: type,
        num: 5
      })
    })
    
    if (!response.ok) {
      throw new Error('Search API request failed')
    }
    
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    )
  }
}
```

### 2. 前端组件修改

**修改 `components/TaskInput.tsx`**：

```typescript
// 添加联网搜索开关
const [enableSearch, setEnableSearch] = useState(false)

// 添加搜索结果状态
const [searchResults, setSearchResults] = useState<any[]>([])
const [searchLoading, setSearchLoading] = useState(false)

// 联网搜索函数
const performSearch = async (query: string) => {
  setSearchLoading(true)
  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    })
    
    if (response.ok) {
      const data = await response.json()
      setSearchResults(data.organic || [])
    }
  } catch (error) {
    console.error('Search error:', error)
  } finally {
    setSearchLoading(false)
  }
}

// 在UI中添加搜索开关和结果展示
<div className="flex items-center gap-2 mb-2">
  <label className="flex items-center gap-2 cursor-pointer">
    <input
      type="checkbox"
      checked={enableSearch}
      onChange={(e) => setEnableSearch(e.target.checked)}
      className="rounded text-emerald-600"
    />
    <span className="text-sm text-gray-600">启用联网搜索</span>
  </label>
</div>

{searchLoading && (
  <div className="text-sm text-gray-500 mb-2">搜索中...</div>
)}

{searchResults.length > 0 && (
  <div className="bg-white border border-gray-200 rounded-md p-3 mb-3">
    <h4 className="font-semibold text-sm mb-2">搜索结果</h4>
    {searchResults.slice(0, 3).map((result, index) => (
      <div key={index} className="mb-2 pb-2 border-b border-gray-100 last:border-0">
        <a 
          href={result.link} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline text-sm font-medium"
        >
          {result.title}
        </a>
        <p className="text-xs text-gray-600 mt-1">{result.snippet}</p>
        <p className="text-xs text-gray-400 mt-1">{result.link}</p>
      </div>
    ))}
  </div>
)}
```

### 3. 聊天API集成

**修改 `app/api/chat/route.ts`**：

```typescript
// 添加搜索功能
const performSearchIfNeeded = async (message: string) => {
  // 检测是否需要搜索
  const searchKeywords = [
    '最新', '最近', '现在', '今天', '昨天', '明天',
    '天气', '新闻', '股价', '价格', '时间', '日期',
    '怎么样', '如何', '怎么', '什么', '哪里', '何时'
  ]
  
  const needsSearch = searchKeywords.some(keyword => message.includes(keyword))
  
  if (needsSearch) {
    try {
      const searchResponse = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: message })
      })
      
      if (searchResponse.ok) {
        const searchData = await searchResponse.json()
        const searchResults = searchData.organic || []
        
        if (searchResults.length > 0) {
          return searchResults.slice(0, 3).map((result: any) => {
            return `[搜索结果] ${result.title}: ${result.snippet} (${result.link})`
          }).join('\n\n')
        }
      }
    } catch (error) {
      console.error('Search error in chat:', error)
    }
  }
  
  return ''
}

// 在聊天处理中使用
const searchResults = await performSearchIfNeeded(message)
const enhancedMessage = searchResults ? `${message}\n\n[联网搜索结果]\n${searchResults}` : message

// 使用增强后的消息
const response = await fetch('https://api.deepseek.com/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sk-d80abf6ae5d04f84b60eadb1721a904c'
  },
  body: JSON.stringify({
    model: 'deepseek-reasoner',
    messages: [
      {
        role: 'system',
        content: getSystemPrompt()
      },
      {
        role: 'user',
        content: enhancedMessage
      }
    ],
    stream: false
  })
})
```

### 4. 环境变量配置

**创建 `.env.local` 文件**：

```env
# 搜索API配置
SERPER_API_KEY=your-serper-api-key

# 其他配置...
```

## 五、用户使用流程

1. **启用联网功能**：
   - 在聊天输入框下方找到"启用联网搜索"开关
   - 打开开关以启用联网功能

2. **提问**：
   - 输入需要实时信息的问题，例如：
     - "今天北京的天气怎么样？"
     - "最新的iPhone价格是多少？"
     - "2024年的GDP数据是什么？"

3. **查看结果**：
   - 系统会自动进行联网搜索
   - 搜索结果会显示在输入框上方
   - AI会基于搜索结果提供回答

4. **禁用联网**：
   - 关闭"启用联网搜索"开关
   - 系统将不再进行联网搜索

## 六、安全考虑

1. **API密钥保护**：
   - API密钥存储在环境变量中，不暴露在代码中
   - 服务器端调用搜索API，不暴露给前端

2. **搜索限制**：
   - 限制搜索频率，防止滥用
   - 限制搜索结果数量，提高响应速度

3. **内容过滤**：
   - 过滤不适当的搜索结果
   - 确保搜索内容符合法律法规

4. **隐私保护**：
   - 不存储用户的搜索历史
   - 搜索查询仅用于获取信息，不用于其他目的

## 七、扩展功能

1. **多语言支持**：
   - 支持不同语言的搜索
   - 自动检测用户语言

2. **高级搜索**：
   - 支持图片搜索
   - 支持视频搜索
   - 支持新闻搜索

3. **搜索历史**：
   - 保存用户的搜索历史
   - 提供搜索历史管理

4. **个性化搜索**：
   - 根据用户历史偏好优化搜索结果
   - 学习用户的搜索习惯

## 八、成本分析

### Serper API定价
- **免费计划**：每月1000次搜索
- **基础计划**：$50/月，10,000次搜索
- **专业计划**：$199/月，50,000次搜索

### 其他成本
- 服务器流量：搜索结果传输产生的流量
- 计算资源：处理搜索结果的服务器资源

## 九、实施建议

1. **阶段1**：基础搜索功能
   - 实现基本的联网搜索功能
   - 集成到聊天流程

2. **阶段2**：高级功能
   - 添加搜索结果展示
   - 优化搜索逻辑

3. **阶段3**：个性化和扩展
   - 添加多语言支持
   - 实现高级搜索功能

## 十、技术风险

1. **API依赖**：
   - 依赖第三方搜索API，可能存在服务中断风险
   - 建议实现备用搜索方案

2. **响应时间**：
   - 联网搜索会增加响应时间
   - 建议实现搜索超时机制

3. **结果质量**：
   - 搜索结果可能不准确或过时
   - 建议添加结果验证机制

4. **成本控制**：
   - 搜索API使用可能产生费用
   - 建议实现使用限制和监控

## 十一、总结

本方案通过集成专业的搜索API，为 Yinxin.AGI.ai 平台添加了联网功能，使 AI 能够获取实时信息，提供更准确、更及时的回答。

**优势**：
- 实现简单，集成快速
- 搜索结果质量高
- 用户体验友好
- 成本可控

**建议**：
- 先实施基础搜索功能
- 逐步添加高级特性
- 监控使用情况和成本
- 不断优化搜索逻辑

---

*文档版本：v1.0 | 更新日期：2026年5月*  
*© 2026 引信（中国）技术有限公司 版权所有*