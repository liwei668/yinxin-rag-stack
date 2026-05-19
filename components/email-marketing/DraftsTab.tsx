// 待审核邮件Tab组件
'use client'

import { useState, useEffect } from 'react'

interface DraftEmail {
  id: string
  config_id: string
  to_address: string
  to_name: string
  subject: string
  content: string
  status: 'draft' | 'pending'
  intent: string
  confidence: number
  original_email_id?: string
  original_email?: {
    from_address: string
    from_name?: string
    subject: string
    content: string
  }
  error_message?: string
  created_at: string
}

const intentLabels: Record<string, { label: string; color: string }> = {
  greeting: { label: '👋 问候', color: 'bg-cyan-100 text-cyan-700' },
  inquiry: { label: '📋 咨询', color: 'bg-blue-100 text-blue-700' },
  support: { label: '🔧 技术支持', color: 'bg-purple-100 text-purple-700' },
  quotation: { label: '💰 询价', color: 'bg-green-100 text-green-700' },
  complaint: { label: '⚠️ 投诉', color: 'bg-red-100 text-red-700' },
  cooperation: { label: '🤝 商务合作', color: 'bg-orange-100 text-orange-700' },
  payment: { label: '💵 付款相关', color: 'bg-yellow-100 text-yellow-700' },
  general: { label: '📝 一般', color: 'bg-gray-100 text-gray-700' }
}

const reviewReasons: Record<string, string> = {
  quotation: '报价需要人工确认价格信息',
  cooperation: '商务合作需要人工跟进洽谈',
  complaint: '投诉需要人工核实并处理',
  payment: '付款相关需要财务确认',
  general: '未能明确识别意图'
}

export default function DraftsTab() {
  const [drafts, setDrafts] = useState<DraftEmail[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedDraft, setSelectedDraft] = useState<DraftEmail | null>(null)
  const [editedContent, setEditedContent] = useState('')

  useEffect(() => {
    loadDrafts()
  }, [page])

  const loadDrafts = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/email-marketing/drafts?page=${page}&pageSize=20`)
      const data = await res.json()
      if (data.success) {
        setDrafts(data.emails)
        setTotalPages(data.pagination.totalPages)
      }
    } catch (error) {
      console.error('加载草稿失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async (draft: DraftEmail) => {
    try {
      const res = await fetch('/api/email-marketing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config_id: draft.config_id,
          to_address: draft.to_address,
          to_name: draft.to_name,
          subject: draft.subject,
          content: editedContent || draft.content
        })
      })

      const data = await res.json()
      if (data.success) {
        // 发送成功后删除草稿
        await fetch(`/api/email-marketing/drafts?id=${draft.id}`, { method: 'DELETE' })
        alert('✅ 邮件发送成功！')
        loadDrafts()
        setSelectedDraft(null)
      } else {
        alert('❌ 发送失败: ' + (data.error || '未知错误'))
      }
    } catch (error) {
      console.error('发送邮件失败:', error)
      alert('发送邮件失败')
    }
  }

  const handleDiscard = async (draftId: string) => {
    if (!confirm('确定要放弃这个草稿吗？')) return
    try {
      const res = await fetch(`/api/email-marketing/drafts?id=${draftId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        alert('草稿已放弃')
        loadDrafts()
        setSelectedDraft(null)
      } else {
        alert('操作失败')
      }
    } catch (error) {
      console.error('放弃草稿失败:', error)
      alert('操作失败')
    }
  }

  const openDraft = (draft: DraftEmail) => {
    setSelectedDraft(draft)
    setEditedContent(draft.content)
  }

  const getReviewReason = (intent: string) => {
    return reviewReasons[intent] || '需要人工审核'
  }

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-gray-800">🔍 AI生成待审核邮件</h4>
          <p className="text-xs text-gray-500 mt-1">
            问候、咨询、技术支持自动发送，询价、合作、投诉、付款需要人工审核
          </p>
        </div>
        <button
          onClick={loadDrafts}
          disabled={loading}
          className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200 disabled:opacity-50"
        >
          {loading ? '加载中...' : '🔄 刷新'}
        </button>
      </div>

      {/* 草稿列表 */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">加载中...</div>
      ) : drafts.length === 0 ? (
        <div className="border border-gray-200 rounded-lg p-6 text-center text-gray-400">
          <div className="text-4xl mb-2">📭</div>
          <p className="text-sm">暂无待审核邮件</p>
          <p className="text-xs mt-2">收取新邮件后，AI会自动处理</p>
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft) => (
            <div
              key={draft.id}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => openDraft(draft)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      intentLabels[draft.intent]?.color || intentLabels.general.color
                    }`}>
                      {intentLabels[draft.intent]?.label || '未知'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      draft.status === 'draft' 
                        ? 'bg-yellow-100 text-yellow-700' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {draft.status === 'draft' ? '待审核' : '待发送'}
                    </span>
                    {draft.confidence && (
                      <span className="text-xs text-gray-400">
                        置信度: {Math.round((draft.confidence || 0) * 100)}%
                      </span>
                    )}
                  </div>
                  
                  <div className="text-sm font-medium mb-1">
                    收件人: {draft.to_name || draft.to_address}
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    主题: {draft.subject}
                  </div>
                  <div className="text-xs text-orange-600 mb-2 bg-orange-50 px-2 py-1 rounded">
                    📋 {getReviewReason(draft.intent)}
                  </div>
                  <div className="text-xs text-gray-400 line-clamp-2">
                    {draft.content}
                  </div>
                </div>
                
                <div className="text-xs text-gray-400 ml-4 whitespace-nowrap">
                  {new Date(draft.created_at).toLocaleString('zh-CN', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50"
          >
            上一页
          </button>
          <span className="px-3 py-1 text-sm">
            第 {page} / {totalPages} 页
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}

      {/* 详情弹窗 */}
      {selectedDraft && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedDraft(null)}
        >
          <div 
            className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 sticky top-0 bg-white">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">审核AI生成的回复</h3>
                <button 
                  onClick={() => setSelectedDraft(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* 审核原因 */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <span className="text-orange-600">⚠️</span>
                  <div>
                    <div className="text-sm font-medium text-orange-800">需要人工审核</div>
                    <div className="text-xs text-orange-700 mt-1">{getReviewReason(selectedDraft.intent)}</div>
                  </div>
                </div>
              </div>

              {/* 原始邮件（如果有） */}
              {selectedDraft.original_email && (
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <div className="text-sm font-medium text-blue-800 mb-2">📩 原始邮件</div>
                  <div className="space-y-1 text-sm">
                    <div><span className="text-gray-500">发件人：</span>{selectedDraft.original_email.from_name || selectedDraft.original_email.from_address}</div>
                    <div><span className="text-gray-500">主题：</span>{selectedDraft.original_email.subject}</div>
                    <div className="mt-2 bg-white p-2 rounded border text-xs text-gray-600 whitespace-pre-wrap max-h-32 overflow-auto">
                      {selectedDraft.original_email.content}
                    </div>
                  </div>
                </div>
              )}

              {/* 邮件信息 */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">收件人：</span>
                    <span>{selectedDraft.to_name || selectedDraft.to_address}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">类型：</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      intentLabels[selectedDraft.intent]?.color || intentLabels.general.color
                    }`}>
                      {intentLabels[selectedDraft.intent]?.label || '未知'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">主题：</span>
                    <span>{selectedDraft.subject}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">状态：</span>
                    <span>{selectedDraft.status === 'draft' ? '草稿（需审核）' : '待发送'}</span>
                  </div>
                  {selectedDraft.confidence && (
                    <div>
                      <span className="text-gray-500">置信度：</span>
                      <span>{Math.round((selectedDraft.confidence || 0) * 100)}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 回复内容编辑 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ✏️ 回复内容（可编辑）
                </label>
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  rows={12}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <p className="text-xs text-gray-500 mt-1">
                  AI生成的内容仅供参考，您可以根据实际情况修改后再发送
                </p>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => handleDiscard(selectedDraft.id)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                >
                  🗑️ 放弃
                </button>
                <button
                  onClick={() => {
                    if (confirm('确认发送此邮件吗？')) {
                      handleSend(selectedDraft)
                    }
                  }}
                  className="px-6 py-2 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600"
                >
                  ✅ 确认发送
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
