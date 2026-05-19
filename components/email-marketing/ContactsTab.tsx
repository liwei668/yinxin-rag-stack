// 联系人管理Tab组件
'use client'

import { useState, useEffect } from 'react'

interface Contact {
  id: string
  email_address: string
  name: string
  company: string
  phone: string
  tags: string
  notes: string
  is_lead: number
  lead_score: number
  lead_status: string
  source: string
  last_contact_at: string
  created_at: string
}

export default function ContactsTab() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'lead'>('all')

  const [formData, setFormData] = useState({
    email_address: '',
    name: '',
    company: '',
    phone: '',
    tags: '',
    notes: '',
    is_lead: false,
    lead_score: 0,
    lead_status: 'new'
  })

  useEffect(() => {
    loadContacts()
  }, [page, filter])

  const loadContacts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '50'
      })
      if (filter === 'lead') params.append('is_lead', 'true')
      if (search) params.append('search', search)

      const res = await fetch(`/api/email-marketing/contacts?${params}`)
      const data = await res.json()
      if (data.success) {
        setContacts(data.contacts)
      }
    } catch (error) {
      console.error('加载联系人失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const url = '/api/email-marketing/contacts'
      const method = editingContact ? 'PUT' : 'POST'
      const body = editingContact 
        ? { ...formData, id: editingContact.id }
        : formData

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await res.json()
      if (data.success) {
        setShowForm(false)
        setEditingContact(null)
        resetForm()
        loadContacts()
      } else {
        alert(data.error || '操作失败')
      }
    } catch (error) {
      console.error('提交失败:', error)
      alert('操作失败')
    }
  }

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact)
    setFormData({
      email_address: contact.email_address,
      name: contact.name || '',
      company: contact.company || '',
      phone: contact.phone || '',
      tags: contact.tags || '',
      notes: contact.notes || '',
      is_lead: !!contact.is_lead,
      lead_score: contact.lead_score || 0,
      lead_status: contact.lead_status || 'new'
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此联系人吗？')) return
    try {
      const res = await fetch(`/api/email-marketing/contacts?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        loadContacts()
      }
    } catch (error) {
      console.error('删除失败:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      email_address: '',
      name: '',
      company: '',
      phone: '',
      tags: '',
      notes: '',
      is_lead: false,
      lead_score: 0,
      lead_status: 'new'
    })
  }

  const getLeadStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      new: '新线索',
      contacted: '已联系',
      qualified: '已筛选',
      proposal: '方案中',
      negotiation: '谈判中',
      won: '成交',
      lost: '流失'
    }
    return labels[status] || status
  }

  const getLeadStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      new: 'bg-blue-100 text-blue-700',
      contacted: 'bg-yellow-100 text-yellow-700',
      qualified: 'bg-green-100 text-green-700',
      proposal: 'bg-emerald-100 text-emerald-700',
      negotiation: 'bg-orange-100 text-orange-700',
      won: 'bg-green-500 text-white',
      lost: 'bg-gray-100 text-gray-700'
    }
    return colors[status] || 'bg-gray-100 text-gray-700'
  }

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setEditingContact(null)
            resetForm()
            setShowForm(!showForm)
          }}
          className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600"
        >
          + 添加联系人
        </button>

        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded text-xs ${filter === 'all' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100'}`}
          >
            全部
          </button>
          <button
            onClick={() => setFilter('lead')}
            className={`px-3 py-1 rounded text-xs ${filter === 'lead' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100'}`}
          >
            拓客线索
          </button>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="relative">
        <input
          type="text"
          placeholder="搜索联系人..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadContacts()}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      </div>

      {/* 添加/编辑表单 */}
      {showForm && (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <h5 className="text-sm font-medium text-gray-700 mb-3">
            {editingContact ? '编辑联系人' : '添加新联系人'}
          </h5>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">邮箱地址 *</label>
                <input
                  type="email"
                  required
                  value={formData.email_address}
                  onChange={(e) => setFormData({ ...formData, email_address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">姓名</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">公司</label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">电话</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">标签</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="用逗号分隔"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 mt-6">
                  <input
                    type="checkbox"
                    checked={formData.is_lead}
                    onChange={(e) => setFormData({ ...formData, is_lead: e.target.checked })}
                  />
                  <span className="text-sm">拓客线索</span>
                </label>
              </div>
            </div>
            {formData.is_lead && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">线索评分</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.lead_score}
                    onChange={(e) => setFormData({ ...formData, lead_score: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">线索状态</label>
                  <select
                    value={formData.lead_status}
                    onChange={(e) => setFormData({ ...formData, lead_status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    <option value="new">新线索</option>
                    <option value="contacted">已联系</option>
                    <option value="qualified">已筛选</option>
                    <option value="proposal">方案中</option>
                    <option value="negotiation">谈判中</option>
                    <option value="won">成交</option>
                    <option value="lost">流失</option>
                  </select>
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-600 mb-1">备注</label>
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingContact(null)
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600"
              >
                {editingContact ? '更新' : '创建'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 联系人列表 */}
      <div className="border border-gray-200 rounded-lg divide-y divide-gray-200">
        {loading ? (
          <div className="text-center py-8 text-gray-400">加载中...</div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="text-3xl mb-2">👥</div>
            <p className="text-sm">暂无联系人</p>
          </div>
        ) : (
          contacts.map((contact) => (
            <div key={contact.id} className="p-3 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{contact.name || contact.email_address}</span>
                    {contact.is_lead === 1 && (
                      <>
                        <span className={`px-2 py-0.5 rounded text-xs ${getLeadStatusColor(contact.lead_status)}`}>
                          {getLeadStatusLabel(contact.lead_status)}
                        </span>
                        {contact.lead_score > 0 && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                            评分: {contact.lead_score}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{contact.email_address}</div>
                  {contact.company && (
                    <div className="text-xs text-gray-400 mt-0.5">🏢 {contact.company}</div>
                  )}
                  {contact.tags && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      标签: {contact.tags}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(contact)}
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(contact.id)}
                    className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
