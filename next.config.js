/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  output: 'standalone',
  // 允许局域网访问（使用字符串列表）
  allowedDevOrigins: [
    'localhost', 
    '127.0.0.1',
    // 常用局域网IP范围（覆盖常见网段）
    '192.168.0.0',
    '192.168.0.1',
    '192.168.0.100',
    '192.168.0.106',
    '192.168.0.110',
    '192.168.0.160',
    '192.168.1.1',
    '192.168.1.100',
    '192.168.43.1',
    '192.168.43.14',
    '192.168.43.20',
    '192.168.64.1',
    '192.168.64.205',
    '192.168.64.224',
    '192.168.100.1',
    '192.168.100.100',
    '10.0.0.1',
    '10.0.0.100',
  ],
  devIndicators: false,
  serverExternalPackages: ['mongoose', 'playwright', 'better-sqlite3'],
  typescript: {
    ignoreBuildErrors: true,
  },
  // Turbopack 配置：处理 noVNC 等 CommonJS 模块
  turbopack: {
    resolveAlias: {
      // noVNC 的某些内部模块可能引用 'canvas'，在服务端不需要
      'canvas': { browser: '' },
    },
  },
}
