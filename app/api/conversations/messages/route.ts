import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '../../../../src/middleware/withAuth';
import Conversation from '../../../../src/models/Conversation';
import { connectToDatabase } from '../../../../lib/mongodb';
import { broadcastNewMessage, broadcastConversationUpdate } from '../../sse/route';

// POST - 发送消息（用户或AI）
export const POST = withAuth(async (req) => {
  try {
    await connectToDatabase();
    const userId = req.user.userId;
    const { conversationId, message } = await req.json();
    
    if (!conversationId || !message) {
      return NextResponse.json({ 
        success: false, 
        error: '缺少必要参数' 
      }, { status: 400 });
    }
    
    // 查找对话
    const conversation = await Conversation.findOne({ 
      _id: conversationId, 
      userId,
      isDeleted: { $ne: true }
    });
    
    if (!conversation) {
      return NextResponse.json({ 
        success: false, 
        error: '对话不存在' 
      }, { status: 404 });
    }
    
    // 添加消息
    const newMessage = {
      id: message.id || Date.now().toString(),
      role: message.role,
      content: message.content,
      createdAt: new Date()
    };
    
    conversation.messages.push(newMessage);
    
    // 更新对话标题（如果是第一条用户消息）
    if (message.role === 'user' && conversation.title === '新对话') {
      conversation.title = message.content.slice(0, 10) + (message.content.length > 10 ? '...' : '');
    }
    
    conversation.updatedAt = new Date();
    await conversation.save();
    
    // 广播给用户的其他设备
    broadcastNewMessage(userId, conversationId, newMessage);
    broadcastConversationUpdate(userId, {
      id: conversation._id.toString(),
      title: conversation.title,
      messages: conversation.messages,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      pinned: conversation.pinned,
      pinnedAt: conversation.pinnedAt,
    });
    
    return NextResponse.json({ 
      success: true, 
      message: newMessage 
    });
  } catch (error: any) {
    console.error('发送消息失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: '发送消息失败: ' + error.message 
    }, { status: 500 });
  }
});

// GET - 获取对话的消息列表
export const GET = withAuth(async (req) => {
  try {
    await connectToDatabase();
    const userId = req.user.userId;
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('conversationId');
    
    if (!conversationId) {
      return NextResponse.json({ 
        success: false, 
        error: '缺少对话ID' 
      }, { status: 400 });
    }
    
    const conversation = await Conversation.findOne({ 
      _id: conversationId, 
      userId,
      isDeleted: { $ne: true }
    }).select('messages');
    
    if (!conversation) {
      return NextResponse.json({ 
        success: false, 
        error: '对话不存在' 
      }, { status: 404 });
    }
    
    return NextResponse.json({ 
      success: true, 
      messages: conversation.messages 
    });
  } catch (error: any) {
    console.error('获取消息失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: '获取消息失败: ' + error.message 
    }, { status: 500 });
  }
});
