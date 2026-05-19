#!/bin/bash

# 知识库系统快速启动脚本

echo "=========================================="
echo "  🚀 知识库系统快速启动"
echo "=========================================="
echo ""

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    echo "   cd /Users/liwei/Desktop/yinxin-rag-stack"
    exit 1
fi

# 检查依赖是否安装
if [ ! -d "node_modules" ]; then
    echo "📦 正在安装依赖..."
    npm install
fi

echo ""
echo "=========================================="
echo "  🧪 可用的测试命令："
echo "=========================================="
echo ""
echo "1️⃣  启动开发服务器"
echo "    命令: npm run dev"
echo "    访问: http://localhost:3000"
echo ""
echo "2️⃣  类型检查"
echo "    命令: npm run check"
echo ""
echo "3️⃣  构建生产版本"
echo "    命令: npm run build"
echo ""
echo "4️⃣  代码检查"
echo "    命令: npm run lint"
echo ""
echo "=========================================="
echo ""

# 询问用户要执行的操作
read -p "请选择操作 (1-4，或按 Enter 启动开发服务器): " choice

case $choice in
    1|"")
        echo "🚀 正在启动开发服务器..."
        echo "📍 访问地址: http://localhost:3000"
        echo "📖 API 文档: 参见 docs/TEST_GUIDE.md"
        echo ""
        npm run dev
        ;;
    2)
        echo "🔍 正在检查类型..."
        npm run check
        ;;
    3)
        echo "🏗️  正在构建生产版本..."
        npm run build
        ;;
    4)
        echo "🔍 正在检查代码..."
        npm run lint
        ;;
    *)
        echo "❌ 无效的选择"
        ;;
esac
