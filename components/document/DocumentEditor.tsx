'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import { useCallback, useEffect, useRef, useState } from 'react'
import { prepareMarkdownForTipTap } from '../../utils/markdownToHtml'

// 创建 lowlight 实例，用于代码高亮
const lowlight = createLowlight(common)

// localStorage 存储键名
const STORAGE_KEY = 'doc-editor-content'

// 自动保存防抖时间（毫秒）
const AUTO_SAVE_DELAY = 2000

// AI 润色选项类型
interface PolishOption {
  label: string
  prompt: string
}

// AI 润色选项配置
const POLISH_OPTIONS: PolishOption[] = [
  {
    label: '正式书面语',
    prompt: '请将以下内容改写为正式书面语风格，保持原意不变，使用规范的书面表达方式，去除口语化表述：\n\n',
  },
  {
    label: '精简表述',
    prompt: '请精简以下内容的表述，去除冗余信息，保留核心要点，使表达更加简洁明了：\n\n',
  },
  {
    label: '专业财税术语',
    prompt: '请将以下内容中的表述替换为专业的财税术语，确保用词准确规范，符合财税领域的专业表达习惯：\n\n',
  },
]

// 组件 Props 接口
interface DocumentEditorProps {
  content: string // Markdown 内容
  onClose: () => void // 关闭回调
}

export default function DocumentEditor({ content, onClose }: DocumentEditorProps) {
  // 润色加载状态
  const [isPolishing, setIsPolishing] = useState(false)
  // 防抖定时器引用
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 编辑器实例引用
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null)

  // 初始化 TipTap 编辑器
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      CodeBlockLowlight.configure({
        lowlight,
      }),
    ],
    // 编辑器内容：将 Markdown 转为 TipTap 兼容的 HTML
    content: content ? prepareMarkdownForTipTap(content) : (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) || '' : ''),
    // 编辑器更新回调：防抖自动保存
    onUpdate: ({ editor }) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        const html = editor.getHTML()
        localStorage.setItem(STORAGE_KEY, html)
      }, AUTO_SAVE_DELAY)
    },
    // 编辑器就绪后保存引用
    onBeforeCreate: ({ editor }) => {
      editorRef.current = editor
    },
    // 编辑器属性配置
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl focus:outline-none max-w-none min-h-[60vh] p-6',
      },
    },
  })

  // 当 props.content 变化时，更新编辑器内容并保存
  useEffect(() => {
    if (editor && content) {
      editor.commands.setContent(content)
      localStorage.setItem(STORAGE_KEY, content)
    }
  }, [editor, content])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // 导出 Markdown 文件
  const handleExportMarkdown = useCallback(() => {
    if (!editor) return
    // 从编辑器存储中获取 Markdown 文本
    const markdown = editor.storage.markdown?.getMarkdown?.() || editor.getHTML()
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `document-${new Date().toISOString().slice(0, 10)}.md`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [editor])

  // 导出 PDF（使用浏览器打印功能）
  const handleExportPDF = useCallback(() => {
    window.print()
  }, [])

  // AI 润色处理函数
  const handlePolish = useCallback(
    async (option: PolishOption) => {
      if (!editor || isPolishing) return

      setIsPolishing(true)

      try {
        // 提取编辑器纯文本内容
        const text = editor.getText()

        if (!text.trim()) {
          alert('编辑器内容为空，无法润色')
          setIsPolishing(false)
          return
        }

        // 构造润色请求消息
        const message = option.prompt + text

        // 发送请求到 AI 接口
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        })

        if (!response.ok) {
          throw new Error(`请求失败：${response.status}`)
        }

        const data = await response.json()

        // 用 AI 返回的内容替换编辑器内容
        if (data?.content || data?.message) {
          const newContent = data.content || data.message
          editor.commands.setContent(newContent)
          // 保存润色后的内容
          localStorage.setItem(STORAGE_KEY, newContent)
        }
      } catch (error) {
        console.error('AI 润色失败：', error)
        alert('AI 润色失败，请稍后重试')
      } finally {
        setIsPolishing(false)
      }
    },
    [editor, isPolishing]
  )

  // 如果编辑器未初始化，显示加载状态
  if (!editor) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500 text-lg">编辑器加载中...</div>
      </div>
    )
  }

  return (
    <div className="doc-editor-wrapper flex flex-col h-screen bg-white">
      {/* 打印样式：隐藏工具栏和非文档元素 */}
      <style jsx global>{`
        @media print {
          .doc-editor-toolbar,
          .doc-editor-close {
            display: none !important;
          }
          .doc-editor-wrapper {
            height: auto !important;
          }
          .ProseMirror {
            min-height: auto !important;
            padding: 0 !important;
            border: none !important;
          }
        }
      `}</style>

      {/* 工具栏 */}
      <div className="doc-editor-toolbar sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-1 flex-wrap shadow-sm">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="doc-editor-close mr-2 p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
          title="关闭编辑器"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* 撤销 / 重做 */}
        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="撤销"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="重做"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M12.293 3.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H9a5 5 0 00-5 5v2a1 1 0 11-2 0v-2a7 7 0 017-7h5.586l-2.293-2.293a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* 标题按钮组 */}
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`p-1.5 rounded hover:bg-gray-100 transition-colors font-bold text-sm ${
            editor.isActive('heading', { level: 1 }) ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
          title="标题 1"
        >
          H1
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-1.5 rounded hover:bg-gray-100 transition-colors font-bold text-sm ${
            editor.isActive('heading', { level: 2 }) ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
          title="标题 2"
        >
          H2
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`p-1.5 rounded hover:bg-gray-100 transition-colors font-bold text-sm ${
            editor.isActive('heading', { level: 3 }) ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
          title="标题 3"
        >
          H3
        </button>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* 加粗 */}
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
            editor.isActive('bold') ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
          title="加粗"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M8.293 4.293a1 1 0 011.414 0L12 6.586l2.293-2.293a1 1 0 111.414 1.414L13.414 8l2.293 2.293a1 1 0 01-1.414 1.414L12 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L10.586 8 8.293 5.707a1 1 0 010-1.414z" />
          </svg>
          <span className="font-bold text-sm">B</span>
        </button>

        {/* 斜体 */}
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
            editor.isActive('italic') ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
          title="斜体"
        >
          <span className="italic text-sm font-serif">I</span>
        </button>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* 引用 */}
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
            editor.isActive('blockquote') ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
          title="引用"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* 无序列表 */}
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
            editor.isActive('bulletList') ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
          title="无序列表"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M5 5a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7a2 2 0 00-2 2v1zm0 6a2 2 0 002 2h6a2 2 0 002-2v-1a2 2 0 00-2-2H7a2 2 0 00-2 2v1zm0 6a2 2 0 002 2h6a2 2 0 002-2v-1a2 2 0 00-2-2H7a2 2 0 00-2 2v1zM1 6a1 1 0 011-1h.01a1 1 0 110 2H2a1 1 0 01-1-1zm1 5a1 1 0 100 2h.01a1 1 0 100-2H2zm1 6a1 1 0 100 2h.01a1 1 0 100-2H3z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* 有序列表 */}
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
            editor.isActive('orderedList') ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
          title="有序列表"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M5 5a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7a2 2 0 00-2 2v1zm0 6a2 2 0 002 2h6a2 2 0 002-2v-1a2 2 0 00-2-2H7a2 2 0 00-2 2v1zm0 6a2 2 0 002 2h6a2 2 0 002-2v-1a2 2 0 00-2-2H7a2 2 0 00-2 2v1zM1 6a1 1 0 011-1h.01a1 1 0 110 2H2a1 1 0 01-1-1zm1 5a1 1 0 100 2h.01a1 1 0 100-2H2zm1 6a1 1 0 100 2h.01a1 1 0 100-2H3z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* 代码块 */}
        <button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
            editor.isActive('codeBlock') ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
          title="代码块"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* 表格 */}
        <button
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
          title="插入表格"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* 导出 Markdown */}
        <button
          onClick={handleExportMarkdown}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
          title="导出 Markdown"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-xs ml-0.5">MD</span>
        </button>

        {/* 导出 PDF */}
        <button
          onClick={handleExportPDF}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
          title="导出 PDF"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-xs ml-0.5">PDF</span>
        </button>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* AI 润色按钮组 */}
        <div className="flex items-center gap-1">
          {POLISH_OPTIONS.map((option) => (
            <button
              key={option.label}
              onClick={() => handlePolish(option)}
              disabled={isPolishing}
              className="px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-50 text-blue-700 hover:bg-blue-100"
              title={`AI 润色：${option.label}`}
            >
              {isPolishing ? (
                <span className="flex items-center gap-1">
                  <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  处理中...
                </span>
              ) : (
                option.label
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 编辑器内容区域 */}
      <div className="flex-1 overflow-auto">
        <EditorContent editor={editor} />
      </div>

      {/* 编辑器内容样式（表格边框等） */}
      <style jsx global>{`
        /* 编辑器内容区域基础样式 */
        .ProseMirror {
          min-height: 60vh;
          padding: 1.5rem;
          font-size: 15px;
          line-height: 1.75;
          outline: none;
        }

        /* 表格边框样式 */
        .ProseMirror table {
          border-collapse: collapse;
          width: 100%;
          margin: 1rem 0;
          overflow: hidden;
          border-radius: 4px;
        }

        .ProseMirror table td,
        .ProseMirror table th {
          border: 1px solid #d1d5db;
          padding: 8px 12px;
          min-width: 80px;
          vertical-align: top;
          position: relative;
        }

        .ProseMirror table th {
          background-color: #f3f4f6;
          font-weight: 600;
          text-align: left;
        }

        .ProseMirror table .selectedCell::after {
          background-color: rgba(59, 130, 246, 0.15);
          content: '';
          left: 0;
          right: 0;
          top: 0;
          bottom: 0;
          pointer-events: none;
          position: absolute;
          z-index: 2;
        }

        /* 代码块样式 */
        .ProseMirror pre {
          background-color: #1e1e1e;
          color: #d4d4d4;
          border-radius: 6px;
          padding: 1rem;
          overflow-x: auto;
          font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
          font-size: 13px;
          line-height: 1.5;
        }

        .ProseMirror pre code {
          background: none;
          color: inherit;
          padding: 0;
          font-size: inherit;
          border-radius: 0;
        }

        /* 引用块样式 */
        .ProseMirror blockquote {
          border-left: 3px solid #6b7280;
          padding-left: 1rem;
          margin-left: 0;
          color: #4b5563;
          font-style: italic;
        }

        /* 列表样式 */
        .ProseMirror ul {
          list-style-type: disc;
          padding-left: 1.5rem;
        }

        .ProseMirror ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
        }

        .ProseMirror li {
          margin: 0.25rem 0;
        }

        /* 标题样式 */
        .ProseMirror h1 {
          font-size: 2em;
          font-weight: 700;
          margin: 1rem 0 0.5rem;
          line-height: 1.3;
        }

        .ProseMirror h2 {
          font-size: 1.5em;
          font-weight: 600;
          margin: 0.875rem 0 0.5rem;
          line-height: 1.35;
        }

        .ProseMirror h3 {
          font-size: 1.25em;
          font-weight: 600;
          margin: 0.75rem 0 0.5rem;
          line-height: 1.4;
        }

        /* 段落间距 */
        .ProseMirror p {
          margin: 0.5rem 0;
        }

        /* 分隔线样式 */
        .ProseMirror hr {
          border: none;
          border-top: 2px solid #e5e7eb;
          margin: 1.5rem 0;
        }

        /* 选中列的样式 */
        .column-resize-handle {
          position: absolute;
          right: -2px;
          top: 0;
          bottom: -2px;
          width: 4px;
          background-color: #3b82f6;
          pointer-events: none;
        }

        .tableWrapper {
          overflow-x: auto;
          margin: 1rem 0;
        }

        .resize-cursor {
          cursor: col-resize;
        }
      `}</style>
    </div>
  )
}
