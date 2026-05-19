#!/usr/bin/env python3
"""
银信RAG堆栈 - 完整API测试脚本
"""

import requests
import json
import sys

BASE_URL = "http://localhost:3000"

def log_test(name, success, message=""):
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"\n{status} - {name}")
    if message:
        print(f"   {message}")

def test_model_router_api():
    """测试模型路由API"""
    print("\n" + "="*60)
    print("测试 1: 模型路由API")
    print("="*60)
    
    try:
        # 测试列出路由规则
        print("\n1.1 列出路由规则...")
        response = requests.get(f"{BASE_URL}/api/model-router?action=list", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                rules = data.get('rules', [])
                print(f"   ✓ 成功返回 {len(rules)} 条规则")
                log_test("列出路由规则", True)
                
                if rules:
                    print(f"   规则示例: {rules[0].get('name', 'N/A')}")
                return True
            else:
                log_test("列出路由规则", False, f"API返回错误: {data.get('error', 'Unknown')}")
        else:
            log_test("列出路由规则", False, f"HTTP状态码: {response.status_code}")
    except Exception as e:
        log_test("列出路由规则", False, f"异常: {str(e)}")
    
    return False

def test_customer_archive_api():
    """测试客户档案API"""
    print("\n" + "="*60)
    print("测试 2: 客户档案API")
    print("="*60)
    
    try:
        # 测试列出客户
        print("\n2.1 列出客户档案...")
        response = requests.get(f"{BASE_URL}/api/customer-archive?action=list", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                customers = data.get('customers', [])
                print(f"   ✓ 成功返回 {len(customers)} 个客户")
                log_test("列出客户", True)
                return True
            else:
                log_test("列出客户", False, f"API返回错误: {data.get('error', 'Unknown')}")
        else:
            log_test("列出客户", False, f"HTTP状态码: {response.status_code}")
    except Exception as e:
        log_test("列出客户", False, f"异常: {str(e)}")
    
    return False

def test_skill_combinations_api():
    """测试技能组合API"""
    print("\n" + "="*60)
    print("测试 3: 技能组合API")
    print("="*60)
    
    try:
        # 测试列出组合
        print("\n3.1 列出技能组合...")
        response = requests.get(f"{BASE_URL}/api/skill-combinations?action=list", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                combinations = data.get('combinations', [])
                print(f"   ✓ 成功返回 {len(combinations)} 个组合")
                log_test("列出技能组合", True)
                
                if combinations:
                    print(f"   组合示例: {combinations[0].get('name', 'N/A')}")
                return True
            else:
                log_test("列出技能组合", False, f"API返回错误: {data.get('error', 'Unknown')}")
        else:
            log_test("列出技能组合", False, f"HTTP状态码: {response.status_code}")
    except Exception as e:
        log_test("列出技能组合", False, f"异常: {str(e)}")
    
    return False

def test_data_files():
    """测试数据文件是否存在且格式正确"""
    print("\n" + "="*60)
    print("测试 4: 数据文件检查")
    print("="*60)
    
    import os
    
    files = [
        ("模型路由配置", "data/model-router.json"),
        ("客户档案配置", "data/customer-archives.json"),
        ("技能组合配置", "data/skill-combinations.json")
    ]
    
    all_ok = True
    for name, path in files:
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                print(f"\n✓ {name}: 文件存在且格式正确")
                log_test(name, True)
            except Exception as e:
                print(f"\n✗ {name}: 文件格式错误 - {str(e)}")
                log_test(name, False)
                all_ok = False
        else:
            print(f"\n✗ {name}: 文件不存在")
            log_test(name, False)
            all_ok = False
    
    # 检查技能提词器文件
    print("\n检查技能提词器文件...")
    skill_prompts_dir = "data/skill-prompts"
    if os.path.exists(skill_prompts_dir):
        files = os.listdir(skill_prompts_dir)
        txt_files = [f for f in files if f.endswith('.txt')]
        print(f"✓ 技能提词器目录存在，找到 {len(txt_files)} 个提词器文件")
        log_test("技能提词器文件", len(txt_files) > 0)
        
        for f in txt_files:
            size = os.path.getsize(os.path.join(skill_prompts_dir, f))
            print(f"  - {f}: {size} 字节")
    else:
        print("✗ 技能提词器目录不存在")
        log_test("技能提词器文件", False)
        all_ok = False
    
    return all_ok

def main():
    print("银信RAG堆栈 - 前后端数据连通性测试")
    print("="*60)
    
    print(f"\n目标服务器: {BASE_URL}")
    
    # 检查服务器是否可访问
    try:
        print("\n0. 测试服务器连通性...")
        response = requests.get(BASE_URL, timeout=5)
        print(f"✓ 服务器可访问 (HTTP {response.status_code})")
        log_test("服务器连通性", True)
    except Exception as e:
        print(f"✗ 服务器不可访问: {str(e)}")
        print("\n请先运行: npm run dev")
        return 1
    
    # 运行所有测试
    results = []
    
    results.append(("模型路由API", test_model_router_api()))
    results.append(("客户档案API", test_customer_archive_api()))
    results.append(("技能组合API", test_skill_combinations_api()))
    results.append(("数据文件检查", test_data_files()))
    
    # 总结
    print("\n" + "="*60)
    print("测试总结")
    print("="*60)
    
    passed = sum(1 for name, ok in results if ok)
    total = len(results)
    
    for name, ok in results:
        status = "✅" if ok else "❌"
        print(f"{status} {name}")
    
    print(f"\n总计: {passed}/{total} 测试通过")
    
    if passed == total:
        print("\n🎉 所有测试通过！前后端数据已完全打通！")
        return 0
    else:
        print(f"\n⚠️ 有 {total - passed} 个测试失败，请检查。")
        return 1

if __name__ == "__main__":
    sys.exit(main())

