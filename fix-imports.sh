#!/bin/bash

# 修复API文件中的导入路径

# 4层目录的文件（app/api/email-marketing/[category]/route.ts）
files_4level=(
  "app/api/email-marketing/config/route.ts"
  "app/api/email-marketing/templates/route.ts"
  "app/api/email-marketing/contacts/route.ts"
  "app/api/email-marketing/reminders/route.ts"
  "app/api/email-marketing/stats/route.ts"
  "app/api/email-marketing/signatures/route.ts"
  "app/api/email-marketing/debug/route.ts"
  "app/api/email-marketing/fix-db/route.ts"
  "app/api/email-marketing/quick-setup/route.ts"
)

# 5层目录的文件（app/api/email-marketing/emails/inbox/route.ts）
files_5level=(
  "app/api/email-marketing/emails/inbox/route.ts"
  "app/api/email-marketing/emails/sent/route.ts"
  "app/api/email-marketing/config/delete/route.ts"
)

# 修复4层目录的文件
for file in "${files_4level[@]}"; do
  if [ -f "$file" ]; then
    sed -i '' "s|from '../../../../src/services/email-marketing/database'|from '../../../../src/services/email-marketing/database'|g" "$file"
    echo "✓ 修复 $file"
  fi
done

# 修复5层目录的文件
for file in "${files_5level[@]}"; do
  if [ -f "$file" ]; then
    sed -i '' "s|from '../../../../src/services/email-marketing/database'|from '../../../../../src/services/email-marketing/database'|g" "$file"
    echo "✓ 修复 $file"
  fi
done

echo "完成！"
