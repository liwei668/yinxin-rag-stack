import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../src/lib/logger';

/**
 * AI 意图判断 API
 * 快速判断用户消息是否需要 Agent 执行（浏览器操作）
 * 使用轻量级关键词 + 规则匹配，不调用 AI（避免延迟）
 */
export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ needsAgent: false });
    }

    const msg = message.toLowerCase();

    // 需要浏览器操作的意图关键词
    const browserActionKeywords = [
      // 注册/登录类
      '注册', '注册账号', '注册一个', '创建账号', '申请账号',
      '登录', '登陆', '签到', '打卡',
      // 搜索/访问类
      '搜索', '查找', '搜一下', '查一下', '搜一搜',
      '打开', '访问', '进入', '浏览',
      // 发布/上传类
      '发布', '上传', '发视频', '发帖子', '发文章',
      '提交', '填写', '输入',
      // 购买/交易类
      '购买', '下单', '预订', '预约', '抢购', '秒杀',
      // 下载/安装类
      '下载', '安装',
      // 操作类
      '点击', '操作', '自动化', '帮我', '替我',
      // 平台名 + 操作
      '快手', '抖音', '淘宝', '京东', '拼多多', '微博', '小红书',
      '百度', '微信', '支付宝', 'bilibili', 'b站',
      '天猫', '闲鱼', '转转', '美团', '饿了么',
      '谷歌', 'google', '必应', 'bing', '搜狗',
      '豆包', '元宝', '腾讯', '阿里',
    ];

    // 不需要 Agent 的意图（纯对话/问答）
    const chatOnlyKeywords = [
      '什么是', '什么是', '如何学习', '怎么学习', '解释一下',
      '翻译', '写一篇', '帮我写', '帮我改', '帮我润色',
      '什么意思', '区别是什么', '对比', '推荐',
      '你好', '谢谢', '再见',
    ];

    // 先检查是否是纯聊天意图
    const isChatOnly = chatOnlyKeywords.some(kw => msg.includes(kw));
    if (isChatOnly) {
      return NextResponse.json({ needsAgent: false });
    }

    // 强制 Agent 的模式：用户明确要求"打开XX网站/首页"
    const forceAgentPatterns = [
      /打开.{1,10}(首页|网站|网页|页面)/,
      /用.{1,10}(搜索|查|问|打开)/,
      /在.{1,10}(搜索|查|问|打开)/,
      /访问.{1,10}(网站|网页)/,
      /进入.{1,10}(网站|网页|首页)/,
    ];
    const isForceAgent = forceAgentPatterns.some(p => p.test(msg));
    if (isForceAgent) {
      return NextResponse.json({ needsAgent: true });
    }

    // 计算浏览器操作意图得分
    let score = 0;
    for (const kw of browserActionKeywords) {
      if (msg.includes(kw)) {
        score += 1;
      }
    }

    // 有平台名 + 操作动词 = 高概率需要 Agent
    const hasPlatform = ['快手', '抖音', '淘宝', '京东', '拼多多', '微博', '小红书', '百度', '微信', 'bilibili', 'b站', '美团', '谷歌', 'google', '豆包', '元宝'].some(p => msg.includes(p));
    const hasAction = ['注册', '登录', '搜索', '发布', '上传', '购买', '下单', '打开', '访问', '查', '问'].some(a => msg.includes(a));

    if (hasPlatform && hasAction) {
      return NextResponse.json({ needsAgent: true });
    }

    // 得分 >= 2 认为需要 Agent
    if (score >= 2) {
      return NextResponse.json({ needsAgent: true });
    }

    return NextResponse.json({ needsAgent: false });
  } catch (error) {
    return NextResponse.json({ needsAgent: false });
  }
}
