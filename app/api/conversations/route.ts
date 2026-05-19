import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '../../../lib/mongodb';
import Conversation from '../../../src/models/Conversation';
import { logger } from '../../../src/lib/logger';

// 获取用户的所有对话
export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    const conversations = await (Conversation as any).find({ 
      userId, 
      isDeleted: false 
    })
    .sort({ createdAt: -1 })
    .lean();
    
    return NextResponse.json({ success: true, conversations });
  } catch (error) {
    logger.error('SYSTEM', 'Error fetching conversations', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}

// 创建新对话
export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const body = await request.json();
    const { userId, conversation } = body;
    
    if (!userId || !conversation) {
      return NextResponse.json(
        { error: 'User ID and conversation are required' },
        { status: 400 }
      );
    }
    
    const newConversation = new Conversation({
      ...conversation,
      userId,
    });
    
    await newConversation.save();
    
    return NextResponse.json({ 
      success: true, 
      conversation: newConversation.toObject() 
    });
  } catch (error) {
    logger.error('SYSTEM', 'Error creating conversation', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    );
  }
}

// 更新对话
export async function PUT(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const body = await request.json();
    const { userId, conversation } = body;
    
    if (!userId || !conversation?.id) {
      return NextResponse.json(
        { error: 'User ID and conversation ID are required' },
        { status: 400 }
      );
    }
    
    const updatedConversation = await (Conversation as any).findOneAndUpdate(
      { id: conversation.id, userId },
      { 
        ...conversation, 
        updatedAt: new Date() 
      },
      { new: true }
    ).lean();
    
    if (!updatedConversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      conversation: updatedConversation 
    });
  } catch (error) {
    logger.error('SYSTEM', 'Error updating conversation', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: 'Failed to update conversation' },
      { status: 500 }
    );
  }
}

// 删除对话
export async function DELETE(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const conversationId = searchParams.get('conversationId');
    
    if (!userId || !conversationId) {
      return NextResponse.json(
        { error: 'User ID and conversation ID are required' },
        { status: 400 }
      );
    }
    
    const deletedConversation = await (Conversation as any).findOneAndUpdate(
      { id: conversationId, userId },
      { isDeleted: true, updatedAt: new Date() },
      { new: true }
    ).lean();
    
    if (!deletedConversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('SYSTEM', 'Error deleting conversation', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: 'Failed to delete conversation' },
      { status: 500 }
    );
  }
}
