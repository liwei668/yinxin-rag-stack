#!/usr/bin/env python3
import os
import re

# 修复导入路径
def fix_imports():
    base_path = "/Users/liwei/Desktop/yinxin-rag-stack"

    # 需要5层 ../ 的文件（更深层的子目录）
    files_5level = [
        "app/api/email-marketing/emails/inbox/route.ts",
        "app/api/email-marketing/emails/sent/route.ts",
        "app/api/email-marketing/config/delete/route.ts",
    ]

    # 需要4层 ../ 的文件
    files_4level = [
        "app/api/email-marketing/config/route.ts",
        "app/api/email-marketing/templates/route.ts",
        "app/api/email-marketing/contacts/route.ts",
        "app/api/email-marketing/reminders/route.ts",
        "app/api/email-marketing/stats/route.ts",
        "app/api/email-marketing/signatures/route.ts",
        "app/api/email-marketing/debug/route.ts",
        "app/api/email-marketing/fix-db/route.ts",
        "app/api/email-marketing/quick-setup/route.ts",
    ]

    # 修复5层目录
    for file_path in files_5level:
        full_path = os.path.join(base_path, file_path)
        if os.path.exists(full_path):
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # 替换错误的路径
            new_content = content.replace(
                "from '../../../../src/services/email-marketing/database'",
                "from '../../../../../src/services/email-marketing/database'"
            )

            if new_content != content:
                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"✓ 修复 {file_path}")

    # 修复4层目录（已经是正确的，不需要改）
    for file_path in files_4level:
        full_path = os.path.join(base_path, file_path)
        if os.path.exists(full_path):
            print(f"✓ {file_path} (路径正确)")

if __name__ == "__main__":
    fix_imports()
    print("\n完成！所有导入路径已修复。")
