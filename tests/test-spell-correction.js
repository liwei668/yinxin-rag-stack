// 测试拼写纠正服务
import { correctSpelling, correctText } from './src/services/spellCorrectionService.ts';

// 测试用例
const testCases = [
  // 同音错字
  { input: '康逼特', expected: '康比特' },
  { input: '吃犯', expected: '吃饭' },
  // 正确输入
  { input: '康比特', expected: '康比特' },
  { input: '吃饭', expected: '吃饭' },
  // 其他股票名称
  { input: '比亚迪', expected: '比亚迪' },
  { input: '茅台', expected: '茅台' },
  // 公司名称
  { input: '引信技术', expected: '引信技术' },
  { input: '德财引信', expected: '德财引信' },
  // 财税术语
  { input: '增值税', expected: '增值税' },
  { input: '企业所得税', expected: '企业所得税' },
  // 通用高频词
  { input: '你好', expected: '你好' },
  { input: '谢谢', expected: '谢谢' }
];

// 运行测试
function runTests() {
  console.log('开始测试拼写纠正服务...');
  let passed = 0;
  let failed = 0;
  
  testCases.forEach((testCase, index) => {
    const result = correctSpelling(testCase.input);
    const success = result === testCase.expected;
    
    console.log(`测试 ${index + 1}: ${testCase.input} → ${result}`);
    console.log(`预期: ${testCase.expected}, 实际: ${result}, 结果: ${success ? '通过' : '失败'}`);
    console.log('---');
    
    if (success) {
      passed++;
    } else {
      failed++;
    }
  });
  
  console.log(`测试完成: 通过 ${passed}, 失败 ${failed}`);
  console.log(`成功率: ${(passed / testCases.length * 100).toFixed(2)}%`);
}

// 测试批量纠正
function testBatchCorrection() {
  console.log('\n测试批量纠正...');
  const testText = '康逼特 吃犯 比亚迪 茅台';
  const result = correctText(testText);
  console.log(`输入: ${testText}`);
  console.log(`输出: ${result}`);
  console.log('---');
}

// 运行所有测试
runTests();
testBatchCorrection();
