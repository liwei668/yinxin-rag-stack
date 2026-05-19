#!/bin/bash
# ============================================
# Yinxin.AGL.ai 一键部署脚本
# ============================================

set -e

echo "=========================================="
echo "  Yinxin.AGL.ai 部署脚本"
echo "=========================================="

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，正在安装..."
    curl -fsSL https://get.docker.com | sh
    systemctl start docker
    systemctl enable docker
    echo "✅ Docker 安装完成"
fi

# 检查 Docker Compose 是否安装
if ! command -v docker compose &> /dev/null; then
    echo "❌ Docker Compose 未安装，正在安装..."
    apt-get update && apt-get install -y docker-compose-plugin
    echo "✅ Docker Compose 安装完成"
fi

# 检查 .env 文件
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "⚠️  已从 .env.example 创建 .env 文件"
        echo "   请编辑 .env 文件，修改数据库密码和 API Key 等配置"
        echo "   编辑命令: nano .env"
        exit 1
    else
        echo "❌ 未找到 .env 或 .env.example 文件"
        exit 1
    fi
fi

echo ""
echo "📋 当前配置:"
echo "   - 应用端口: 80 (Nginx) -> 3000 (Next.js)"
echo "   - MongoDB: 27017"
echo "   - Redis: 6379"
echo ""

# 停止旧容器（如果存在）
echo "🔄 停止旧容器..."
docker compose down 2>/dev/null || true

# 构建并启动
echo "🔨 构建 Docker 镜像..."
docker compose build --no-cache

echo "🚀 启动服务..."
docker compose up -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 10

# 检查服务状态
echo ""
echo "📊 服务状态:"
docker compose ps

echo ""
echo "=========================================="
echo "  ✅ 部署完成！"
echo "=========================================="
echo ""
echo "  访问地址: http://$(hostname -I | awk '{print $1}')"
echo ""
echo "  常用命令:"
echo "    查看日志:   docker compose logs -f"
echo "    查看状态:   docker compose ps"
echo "    重启服务:   docker compose restart"
echo "    停止服务:   docker compose down"
echo "    更新部署:   docker compose build && docker compose up -d"
echo "=========================================="
