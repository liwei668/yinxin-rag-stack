# Yinxin.AGI.ai - 提词器管理解决方案

## 一、方案概述

本方案为 **Yinxin.AGI.ai** 平台创建完整的提词管理系统，允许您：
- 可视化配置 AI System Prompt
- 管理自定义提词模板
- 保存和加载提词配置
- 在界面中快速切换不同的提词角色

提词管理是 Yinxin.AGI.ai 个性化服务的重要组成部分。

## 二、现有提词系统分析

### 当前系统结构

1. **AI System Prompt**：位于 [app/api/chat/route.ts](app/api/chat/route.ts#L18)
2. **提词建议**：位于 [lib/promptGenerator.ts](lib/promptGenerator.ts)
3. **提词组件**：位于 [components/PromptSuggestions.tsx](components/PromptSuggestions.tsx)

### 当前问题

1. System Prompt硬编码在代码中，修改不方便
2. 没有可视化的配置界面
3. 无法保存多个提词配置
4. 无法快速切换不同的AI角色

## 三、解决方案

### 方案1：快速修改（最简单）

#### 修改步骤

1. 直接编辑 [app/api/chat/route.ts](app/api/chat/route.ts) 文件中的system prompt
2. 重启服务生效

#### 优点
- 实现简单，立即生效
- 不需要额外的代码开发

#### 缺点
- 每次修改都要重启服务
- 没有版本管理
- 容易出错

---

### 方案2：环境变量配置（推荐）

#### 实现步骤

**步骤1：创建环境变量配置**

在 `.env.local` 文件中添加：

```env
# AI System Prompt配置
AI_SYSTEM_ROLE=德财
AI_COMPANY_NAME=引信（中国）技术有限公司
AI_ROLE_DESCRIPTION=财税法一体化 AI 解决方案顾问
AI_SKILLS=兼具私有化 AI 部署专家、财税法合规顾问、系统架构师的综合角色
AI_EXPERTISE=擅长企业本地 AI 部署、财税法一体化 AI 方案落地、数据安全合规配置
AI_PRINCIPLES=坚持原则：合规优先、落地可行、数据可控、权责明确
```

**步骤2：修改 chat API 路由**

更新 [app/api/chat/route.ts](app/api/chat/route.ts)：

```typescript
import { NextRequest, NextResponse } from 'next/server'

const buildSystemPrompt = () => {
  const role = process.env.AI_SYSTEM_ROLE || '德财'
  const company = process.env.AI_COMPANY_NAME || '引信（中国）技术有限公司'
  const roleDesc = process.env.AI_ROLE_DESCRIPTION || '财税法一体化 AI 解决方案顾问'
  const skills = process.env.AI_SKILLS || '兼具私有化 AI 部署专家、财税法合规顾问、系统架构师的综合角色'
  const expertise = process.env.AI_EXPERTISE || '擅长企业本地 AI 部署、财税法一体化 AI 方案落地、数据安全合规配置'
  const principles = process.env.AI_PRINCIPLES || '坚持原则：合规优先、落地可行、数据可控、权责明确'
  
  return `我是「${role}」，${company}${roleDesc}
${skills}
${expertise}
${principles}`
}

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json()
    
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
            content: buildSystemPrompt()
          },
          {
            role: 'user',
            content: message
          }
        ],
        stream: false
      })
    })

    if (!response.ok) {
      throw new Error('API request failed')
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'Request processing failed' },
      { status: 500 }
    )
  }
}
```

**步骤3：重启服务**

```bash
# 修改环境变量后需要重启服务
npm run dev
```

#### 优点
- 配置与代码分离
- 修改环境变量后重启服务即可
- 便于部署到不同环境

#### 缺点
- 仍然需要重启服务
- 没有可视化界面

---

### 方案3：可视化提词管理系统（完整方案）

这是最完整的解决方案，包含可视化管理界面。

#### 实现步骤

**步骤1：创建提词配置管理API**

创建 `app/api/prompt-config/route.ts`：

```typescript
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const configPath = path.join(process.cwd(), 'data', 'prompt-configs.json')

// 确保配置目录存在
const ensureConfigDir = () => {
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// 读取配置
const readConfigs = () => {
  ensureConfigDir()
  if (!fs.existsSync(configPath)) {
    return {
      current: 'default',
      configs: {
        default: {
          id: 'default',
          name: '德财 - 财税法顾问',
          role: '德财',
          company: '引信（中国）技术有限公司',
          description: '财税法一体化 AI 解决方案顾问',
          skills: '兼具私有化 AI 部署专家、财税法合规顾问、系统架构师的综合角色',
          expertise: '擅长企业本地 AI 部署、财税法一体化 AI 方案落地、数据安全合规配置',
          principles: '坚持原则：合规优先、落地可行、数据可控、权责明确',
          isDefault: true
        }
      }
    }
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}

// 保存配置
const saveConfigs = (configs: any) => {
  ensureConfigDir()
  fs.writeFileSync(configPath, JSON.stringify(configs, null, 2))
}

export async function GET() {
  try {
    const configs = readConfigs()
    return NextResponse.json(configs)
  } catch (error) {
    console.error('Error reading configs:', error)
    return NextResponse.json({ error: 'Failed to read configs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, config, configId } = await request.json()
    const configs = readConfigs()

    switch (action) {
      case 'add':
      case 'update':
        configs.configs[config.id] = config
        break
      case 'delete':
        delete configs.configs[configId]
        if (configs.current === configId) {
          configs.current = Object.keys(configs.configs)[0] || 'default'
        }
        break
      case 'setCurrent':
        configs.current = configId
        break
    }

    saveConfigs(configs)
    return NextResponse.json(configs)
  } catch (error) {
    console.error('Error saving configs:', error)
    return NextResponse.json({ error: 'Failed to save configs' }, { status: 500 })
  }
}
```

**步骤2：修改 chat API 以使用动态配置**

更新 [app/api/chat/route.ts](app/api/chat/route.ts)：

```typescript
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const configPath = path.join(process.cwd(), 'data', 'prompt-configs.json')

const getCurrentConfig = () => {
  if (fs.existsSync(configPath)) {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return data.configs[data.current] || null
  }
  return null
}

const buildSystemPrompt = () => {
  const config = getCurrentConfig()
  
  if (config) {
    return `我是「${config.role}」，${config.company}${config.description}
${config.skills}
${config.expertise}
${config.principles}`
  }
  
  // 默认配置
  return '我是「德财」，引信（中国）技术有限公司财税法一体化 AI 解决方案顾问\n兼具私有化 AI 部署专家、财税法合规顾问、系统架构师的综合角色\n擅长企业本地 AI 部署、财税法一体化 AI 方案落地、数据安全合规配置\n坚持原则：合规优先、落地可行、数据可控、权责明确'
}

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json()
    
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
            content: buildSystemPrompt()
          },
          {
            role: 'user',
            content: message
          }
        ],
        stream: false
      })
    })

    if (!response.ok) {
      throw new Error('API request failed')
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'Request processing failed' },
      { status: 500 }
    )
  }
}
```

**步骤3：创建提词管理组件**

创建 `components/PromptManager.tsx`：

```typescript
'use client'
import React, { useState, useEffect } from 'react'
import { Settings, Save, Plus, Trash2, Check, Edit2 } from 'lucide-react'

interface PromptConfig {
  id: string
  name: string
  role: string
  company: string
  description: string
  skills: string
  expertise: string
  principles: string
  isDefault?: boolean
}

interface PromptConfigs {
  current: string
  configs: Record<string, PromptConfig>
}

const PromptManager: React.FC = () => {
  const [configs, setConfigs] = useState<PromptConfigs | null>(null)
  const [showManager, setShowManager] = useState(false)
  const [editingConfig, setEditingConfig] = useState<PromptConfig | null>(null)
  const [isNew, setIsNew] = useState(false)

  useEffect(() => {
    fetchConfigs()
  }, [])

  const fetchConfigs = async () => {
    try {
      const response = await fetch('/api/prompt-config')
      if (response.ok) {
        const data = await response.json()
        setConfigs(data)
      }
    } catch (error) {
      console.error('Error fetching configs:', error)
    }
  }

  const saveConfig = async () => {
    if (!editingConfig) return
    
    try {
      const response = await fetch('/api/prompt-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isNew ? 'add' : 'update',
          config: editingConfig
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setConfigs(data)
        setEditingConfig(null)
        setIsNew(false)
      }
    } catch (error) {
      console.error('Error saving config:', error)
    }
  }

  const deleteConfig = async (configId: string) => {
    if (!confirm('确定要删除这个提词配置吗？')) return
    
    try {
      const response = await fetch('/api/prompt-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          configId
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setConfigs(data)
      }
    } catch (error) {
      console.error('Error deleting config:', error)
    }
  }

  const setCurrentConfig = async (configId: string) => {
    try {
      const response = await fetch('/api/prompt-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setCurrent',
          configId
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setConfigs(data)
      }
    } catch (error) {
      console.error('Error setting current config:', error)
    }
  }

  const createNewConfig = () => {
    setEditingConfig({
      id: Date.now().toString(),
      name: '新提词配置',
      role: 'AI助手',
      company: '我的公司',
      description: 'AI解决方案顾问',
      skills: '专业的AI助手',
      expertise: '擅长提供专业建议',
      principles: '专业、友好、高效'
    })
    setIsNew(true)
  }

  return (
    <div className="relative">
      {/* 提词切换按钮 */}
      <button
        onClick={() => setShowManager(!showManager)}
        className="p-2 hover:bg-gray-100 rounded-lg flex items-center gap-2"
        title="提词管理"
      >
        <Settings size={20} className="text-gray-600" />
        {configs && configs.configs[configs.current] && (
          <span className="text-sm text-gray-600 hidden md:inline">
            {configs.configs[configs.current].name}
          </span>
        )}
      </button>

      {/* 提词管理面板 */}
      {showManager && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">提词配置管理</h3>
            <button
              onClick={createNewConfig}
              className="p-2 hover:bg-emerald-50 rounded-lg text-emerald-600"
              title="新建配置"
            >
              <Plus size={18} />
            </button>
          </div>

          {editingConfig ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">配置名称</label>
                <input
                  type="text"
                  value={editingConfig.name}
                  onChange={(e) => setEditingConfig({...editingConfig, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">角色名称</label>
                <input
                  type="text"
                  value={editingConfig.role}
                  onChange={(e) => setEditingConfig({...editingConfig, role: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">公司名称</label>
                <input
                  type="text"
                  value={editingConfig.company}
                  onChange={(e) => setEditingConfig({...editingConfig, company: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">角色描述</label>
                <input
                  type="text"
                  value={editingConfig.description}
                  onChange={(e) => setEditingConfig({...editingConfig, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">技能描述</label>
                <textarea
                  value={editingConfig.skills}
                  onChange={(e) => setEditingConfig({...editingConfig, skills: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">专业领域</label>
                <textarea
                  value={editingConfig.expertise}
                  onChange={(e) => setEditingConfig({...editingConfig, expertise: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">原则</label>
                <textarea
                  value={editingConfig.principles}
                  onChange={(e) => setEditingConfig({...editingConfig, principles: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveConfig}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center justify-center gap-2"
                >
                  <Save size={16} />
                  保存
                </button>
                <button
                  onClick={() => {
                    setEditingConfig(null)
                    setIsNew(false)
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {configs && Object.values(configs.configs).map((config) => (
                <div
                  key={config.id}
                  className={`p-3 rounded-lg border ${
                    configs.current === config.id
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-800">{config.name}</span>
                    <div className="flex items-center gap-1">
                      {configs.current === config.id && (
                        <Check size={16} className="text-emerald-600" />
                      )}
                      <button
                        onClick={() => setEditingConfig({...config})}
                        className="p-1 hover:bg-gray-200 rounded"
                        title="编辑"
                      >
                        <Edit2 size={14} className="text-gray-500" />
                      </button>
                      {!config.isDefault && (
                        <button
                          onClick={() => deleteConfig(config.id)}
                          className="p-1 hover:bg-red-100 rounded"
                          title="删除"
                        >
                          <Trash2 size={14} className="text-red-500" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {config.role} - {config.description}
                  </p>
                  {configs.current !== config.id && (
                    <button
                      onClick={() => setCurrentConfig(config.id)}
                      className="text-sm text-emerald-600 hover:text-emerald-700"
                    >
                      设为当前使用
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default PromptManager
```

**步骤4：集成到顶部栏**

修改 [components/TopBar.tsx](components/TopBar.tsx)，添加提词管理按钮：

```typescript
import PromptManager from './PromptManager'

// 在适当的位置添加
<PromptManager />
```

#### 优点
- 可视化界面，操作简单
- 可以保存多个提词配置
- 快速切换不同的AI角色
- 修改立即生效，不需要重启服务
- 配置持久化保存

#### 缺点
- 需要开发较多的代码
- 实现时间较长

## 四、推荐实施路径

### 阶段1：快速修改（立即生效）
如果您现在就需要修改，直接使用**方案1**或**方案2**。

### 阶段2：完整系统（长期使用）
如果您需要长期管理多个提词配置，建议实施**方案3**。

## 五、实施建议

**建议先使用方案2（环境变量配置）**，因为：
1. 实现简单，只需要修改一个文件
2. 配置与代码分离，便于管理
3. 为后续升级到方案3打下基础

然后根据需求，再决定是否需要实现完整的可视化管理系统（方案3）。

---

*文档版本：v1.0 | 更新日期：2026年5月*  
*© 2026 引信（中国）技术有限公司 版权所有*