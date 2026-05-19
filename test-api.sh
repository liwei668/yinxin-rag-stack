#!/bin/bash
# 测试知识库API

echo "=== 测试1: 获取知识库列表 ==="
curl -X GET http://localhost:3000/api/knowledge-structure \
  -H "Content-Type: application/json"

echo -e "\n\n=== 测试2: 创建知识库 ==="
curl -X POST http://localhost:3000/api/knowledge-structure \
  -H "Content-Type: application/json" \
  -d '{"name": "测试知识库2", "parentId": null, "level": 0}'

echo -e "\n\n=== 测试3: 重命名知识库 ==="
# 先获取列表
RESPONSE=$(curl -s -X GET http://localhost:3000/api/knowledge-structure)
FIRST_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$FIRST_ID" ]; then
  echo "找到知识库ID: $FIRST_ID"
  curl -X PUT http://localhost:3000/api/knowledge-structure \
    -H "Content-Type: application/json" \
    -d "{\"action\": \"rename\", \"id\": \"$FIRST_ID\", \"newName\": \"重命名后的名称\", \"currentVersion\": 1}"
else
  echo "未找到知识库ID"
fi

echo -e "\n\n=== 测试完成 ==="
