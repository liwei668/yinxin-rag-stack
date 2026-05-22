#!/bin/bash

# 项目备份脚本 - yinxin-rag-stack

# 配置路径
PROJECT_DIR="/Users/liwei/Desktop/yinxin-rag-stack"
BACKUP_DIR="/Users/liwei/Desktop/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="yinxin-rag-backup-${DATE}.tar.gz"

# 检查项目目录是否存在
if [ ! -d "$PROJECT_DIR" ]; then
    echo "错误：项目目录不存在: $PROJECT_DIR"
    exit 1
fi

# 创建备份目录（如果不存在）
mkdir -p "$BACKUP_DIR"

# 开始备份
echo "开始备份项目..."
echo "项目路径: $PROJECT_DIR"
echo "备份路径: $BACKUP_DIR/$BACKUP_FILE"

# 创建压缩备份（排除常见的大文件和临时文件）
tar -czvf "$BACKUP_DIR/$BACKUP_FILE" \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.env' \
    --exclude='venv' \
    --exclude='.venv' \
    --exclude='dist' \
    --exclude='build' \
    --exclude='.pytest_cache' \
    --exclude='.mypy_cache' \
    --exclude='*.log' \
    -C "$PROJECT_DIR" .

# 检查备份是否成功
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 备份成功！"
    echo "备份文件: $BACKUP_DIR/$BACKUP_FILE"
    ls -lh "$BACKUP_DIR/$BACKUP_FILE"
else
    echo ""
    echo "❌ 备份失败！"
    exit 1
fi

# 清理旧备份（保留最近30天）
echo ""
echo "清理30天前的旧备份..."
find "$BACKUP_DIR" -name "yinxin-rag-backup-*.tar.gz" -mtime +30 -delete
echo "清理完成"

# 显示当前备份列表
echo ""
echo "当前备份文件列表："
ls -lth "$BACKUP_DIR"/yinxin-rag-backup-*.tar.gz 2>/dev/null | head -10
