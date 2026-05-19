'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { useUser } from '../../src/contexts/UserContext';

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useUser();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '注册失败');
      }

      login(data.user);
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#f0f0f5]">
      {/* 背景柔和光斑 - 低饱和，为毛玻璃提供可见的底层内容 */}
      <div className="absolute top-[10%] left-[15%] w-[350px] h-[350px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(160,180,220,0.4) 0%, transparent 70%)', filter: 'blur(80px)' }}
      />
      <div className="absolute bottom-[15%] right-[10%] w-[400px] h-[400px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(140,200,180,0.35) 0%, transparent 70%)', filter: 'blur(80px)' }}
      />
      <div className="absolute top-[45%] left-[55%] w-[250px] h-[250px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(180,170,210,0.3) 0%, transparent 70%)', filter: 'blur(70px)' }}
      />

      <div className="w-full max-w-[380px] relative z-10">
        {/* 品牌标识 */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2.5">
            <Sparkles size={20} className="text-[#1A8F50]" strokeWidth={1.8} />
            <h1 className="text-[22px] font-semibold text-[#1A8F50] tracking-wide">Yinxin.AGI.ai</h1>
          </div>
          <p className="text-[13px] text-[#555555] mt-1.5">引信智能顾问</p>
        </div>

        {/* 苹果毛玻璃卡片 */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: 'rgba(255, 255, 255, 0.75)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(224, 224, 224, 0.3)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)',
          }}
        >
          <h2 className="text-[16px] font-semibold text-[#333333] text-center mb-6">创建账号</h2>

          <form onSubmit={handleRegister} className="space-y-4">
            {error && (
              <div className="px-3.5 py-2.5 rounded-lg text-[13px] text-red-600 bg-red-50 border border-red-100">
                {error}
              </div>
            )}

            <div>
              <label className="block text-[12px] text-[#555555] mb-1.5">用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-[14px] text-[#333333] placeholder-[#BBBBBB] outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.5)',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                }}
                onFocus={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.7)';
                  e.target.style.borderColor = 'rgba(0, 0, 0, 0.15)';
                }}
                onBlur={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.5)';
                  e.target.style.borderColor = 'rgba(0, 0, 0, 0.08)';
                }}
                placeholder="输入用户名"
                required
              />
            </div>

            <div>
              <label className="block text-[12px] text-[#555555] mb-1.5">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-[14px] text-[#333333] placeholder-[#BBBBBB] outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.5)',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                }}
                onFocus={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.7)';
                  e.target.style.borderColor = 'rgba(0, 0, 0, 0.15)';
                }}
                onBlur={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.5)';
                  e.target.style.borderColor = 'rgba(0, 0, 0, 0.08)';
                }}
                placeholder="输入邮箱"
                required
              />
            </div>

            <div>
              <label className="block text-[12px] text-[#555555] mb-1.5">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-[14px] text-[#333333] placeholder-[#BBBBBB] outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.5)',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                }}
                onFocus={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.7)';
                  e.target.style.borderColor = 'rgba(0, 0, 0, 0.15)';
                }}
                onBlur={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.5)';
                  e.target.style.borderColor = 'rgba(0, 0, 0, 0.08)';
                }}
                placeholder="输入密码（至少6位）"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#1A8F50] hover:bg-[#167A43] text-white rounded-lg font-medium text-[14px] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 mt-1"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  注册中...
                </>
              ) : (
                '注册'
              )}
            </button>
          </form>

          {/* 登录引导 */}
          <div className="mt-5 text-center">
            <button
              onClick={() => router.push('/login')}
              className="text-[13px] text-[#2DA868] hover:text-[#1A8F50] transition-colors duration-200"
            >
              已有账号？立即登录
            </button>
          </div>
        </div>

        {/* 底部版权 */}
        <p className="text-center text-[11px] text-[#999999] mt-8">
          © 2026 引信（中国）技术有限公司
        </p>
      </div>
    </div>
  );
}
