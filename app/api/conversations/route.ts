import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '../../../src/middleware/withAuth';
import Conversation from '../../../src/models/Conversation';
import { connectToDatabase } from '../../../lib/mongodb';
import { broadcastConversationUpdate, broadcastConversationDeleted } from '../sse/route';

// GET - 获取当前用户的对话列表
export const GET = withAuth(async (req) => {
  try {
    await connectToDatabase();
    const userId = req.user.userId;
    
    // 只查询当前用户的对话
    const conversations = await Conversation.find({ 
      userId,
      isDeleted: { $ne: true }
    })
    .sort({ updatedAt: -1 })
    .select('_id title messages createdAt updatedAt pinned pinnedAt');
    
    return NextResponse.json({ 
      success: true, 
      conversations: conversations.map((c: any) => ({
        id: c._id.toString(),
        title: c.title,
        messages: c.messages,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        pinned: c.pinned,
        pinnedAt: c.pinnedAt,
      }))
    });
  } catch (error: any) {
    console.error('获取对话列表失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: '获取对话列表失败: ' + error.message 
    }, { status: 500 });
  }
});

// POST - 创建新对话
export const POST = withAuth(async (req) => {
  try {
    await connectToDatabase();
    const userId = req.user.userId;
    const { title = '新对话' } = await req.json();
    
    const conversation = new Conversation({
      userId,
      title,
      messages: [],
    });
    
    await conversation.save();
    
    const newConversation = {
      id: (conversation as any)._id.toString(),
      title: conversation.title,
      messages: [],
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
    
    // 广播给用户的其他设备
    broadcastConversationUpdate(userId, newConversation);
    
    return NextResponse.json({ 
      success: true, 
      conversation: newConversation
    });
  } catch (error: any) {
    console.error('创建对话失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: '创建对话失败: ' + error.message 
    }, { status: 500 });
  }
});

// PUT - 更新对话（重命名、置顶等）
export const PUT = withAuth(async (req) => {
  try {
    await connectToDatabase();
    const userId = req.user.userId;
    const { id, ...updates } = await req.json();
    
    // 只能更新自己的对话
    const conversation = await Conversation.findOneAndUpdate(
      { _id: id, userId },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    
    if (!conversation) {
      return NextResponse.json({ 
        success: false, 
        error: '对话不存在或无权限' 
      }, { status: 404 });
    }
    
    // 广播更新
    broadcastConversationUpdate(userId, {
      id: (conversation as any)._id.toString(),
      title: conversation.title,
      messages: conversation.messages,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      pinned: conversation.pinned,
      pinnedAt: conversation.pinnedAt,
    });
    
    return NextResponse.json({ success: true, conversation });
  } catch (error: any) {
    console.error('更新对话失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: '更新对话失败: ' + error.message 
    }, { status: 500 });
  }
});

// DELETE - 删除对话
export const DELETE = withAuth(async (req) => {
  try {
    await connectToDatabase();
    const userId = req.user.userId;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ 
        success: false, 
        error: '缺少对话ID' 
      }, { status: 400 });
    }
    
    // 软删除：只标记为已删除
    const conversation = await Conversation.findOneAndUpdate(
      { _id: id, userId },
      { isDeleted: true, updatedAt: new Date() },
      { new: true }
    );
    
    if (!conversation) {
      return NextResponse.json({ 
        success: false, 
        error: '对话不存在或无权限' 
      }, { status: 404 });
    }
    
    // 广播删除
    broadcastConversationDeleted(userId, id);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('删除对话失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: '删除对话失败: ' + error.message 
    }, { status: 500 });
  }
});
