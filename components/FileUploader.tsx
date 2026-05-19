'use client';
import React, { useRef } from 'react'
import { Paperclip } from 'lucide-react'
import { UploadedFile } from '../utils/fileUtils'

interface FileUploaderProps {
  uploadedFiles: UploadedFile[]
  setUploadedFiles: (files: UploadedFile[]) => void
  screenshotHistory: UploadedFile[]
  setScreenshotHistory: (files: UploadedFile[]) => void
  loading: boolean
  onScreenshotUpload: (files: UploadedFile[]) => void
}

const FileUploader: React.FC<FileUploaderProps> = ({
  uploadedFiles,
  setUploadedFiles,
  screenshotHistory,
  setScreenshotHistory,
  loading,
  onScreenshotUpload
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    
    try {
      const formData = new FormData()
      files.forEach(file => {
        formData.append('files', file)
      })
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })
      
      if (response.ok) {
        const data = await response.json()
        const newFiles: UploadedFile[] = data.files.map((file: any) => ({
          name: file.name,
          size: file.size,
          type: file.type,
          filename: file.filename,
          url: file.url
        }))
        setUploadedFiles(prev => [...prev, ...newFiles])
      } else {
        throw new Error('文件上传失败')
      }
    } catch (error) {
      console.error('Error uploading files:', error)
      // 上传失败时，使用本地文件信息
      const newFiles: UploadedFile[] = files.map(file => ({
        name: file.name,
        size: file.size,
        type: file.type
      }))
      setUploadedFiles(prev => [...prev, ...newFiles])
    }
  }

  return (
    <>
      {/* 隐藏的文件输入 */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        multiple
        accept=".txt,.md,.docx,.xlsx,.xls,.csv,.pdf,.html,.htm,.json,.xml,.jpg,.jpeg,.png,.gif,.bmp,.webp"
        className="hidden"
      />

      {/* 文件上传按钮 - 只保留按钮，不包含预览 */}
      <button 
        className="p-1.5 md:p-2 hover:bg-gray-200 rounded-md" 
        disabled={loading}
        onClick={() => fileInputRef.current?.click()}
        title="上传文件"
      >
        <Paperclip size={20} className="text-gray-600" />
      </button>
    </>
  )
}

export default FileUploader