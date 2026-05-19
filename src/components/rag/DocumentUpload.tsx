'use client';

import { useState, useEffect } from 'react';

const DocumentUpload = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('默认分类');

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/categories');
        const result = await response.json();
        if (result.success) {
          setCategories(result.categories.sort());
        }
      } catch (error) {
        console.error('获取分类失败:', error);
        // 如果获取失败，至少添加默认分类
        setCategories(['默认分类']);
      }
    };
    
    fetchCategories();
  }, []);



  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      setFiles(selectedFiles);
      setMessage(`已选择 ${selectedFiles.length} 个文件: ${selectedFiles.map(f => f.name).join(', ')}`);
      setSuccess(false);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setMessage('请至少选择一个文件');
      return;
    }

    setIsUploading(true);
    setMessage(`正在上传 ${files.length} 个文件...`);

    try {
      // 并行上传文件
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('metadata', JSON.stringify({
          id: Date.now().toString() + Math.random(),
          fileName: file.name,
          categories: [selectedCategory]
        }));

        const response = await fetch('/api/rag', {
          method: 'POST',
          body: formData
        });

        return await response.json();
      });

      const results = await Promise.all(uploadPromises);
      const successCount = results.filter(result => result.success).length;
      const totalChunks = results.reduce((sum, result) => sum + (result.success ? result.count : 0), 0);

      if (successCount > 0) {
        setMessage(`上传成功！从 ${successCount} 个文件中添加了 ${totalChunks} 个分块到知识库`);
        setSuccess(true);
        setFiles([]);
      } else {
        setMessage('上传失败：所有文件上传失败');
        setSuccess(false);
      }
    } catch (error) {
      setMessage('上传失败：网络错误');
      setSuccess(false);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden border">
      <div className="p-3 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
        <h3 className="text-sm font-semibold text-gray-900">文档上传</h3>
      </div>
      
      <div className="p-3 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="block text-xs font-medium text-gray-700 whitespace-nowrap">
            选择分类
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="flex-1 min-w-[120px] px-2 py-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[150px]">
            <input
              type="file"
              multiple
              accept=".txt,.md,.pdf,.doc,.docx,.xlsx,.xls,.csv,.html,.htm,.json,.xml,.jpg,.jpeg,.png,.gif,.bmp,.webp"
              onChange={handleFileChange}
              className="block w-full text-xs text-gray-500
                        file:mr-2 file:py-1 file:px-2
                        file:rounded-lg file:border-0
                        file:text-xs file:font-medium
                        file:bg-blue-50 file:text-blue-700
                        hover:file:bg-blue-100
                        cursor-pointer"
            />
          </div>
        </div>

        {message && (
          <div className={`p-2 rounded-lg ${success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} text-xs`}>
            {message}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={files.length === 0 || isUploading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors text-sm"
        >
          {isUploading ? '上传中...' : (files.length > 0 ? `上传 ${files.length} 个文件` : '上传文件')}
        </button>
      </div>
    </div>
  );
};

export default DocumentUpload;
