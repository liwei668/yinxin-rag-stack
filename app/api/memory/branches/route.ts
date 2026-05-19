import { NextRequest, NextResponse } from 'next/server';
import memorySystem from '../../../../src/services/memorySystem';
import { logger } from '../../../../src/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const limit = searchParams.get('limit');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const branches = await memorySystem.getUserBranches(userId, {
      status: status as any,
      priority: priority as any,
      limit: limit ? parseInt(limit) : undefined
    });

    return NextResponse.json({ success: true, branches });
  } catch (error) {
    logger.error('SYSTEM', 'Error fetching memory branches', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: 'Failed to fetch memory branches' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, title, description, tags, keywords, isImportant } = body;

    if (!userId || !title) {
      return NextResponse.json(
        { error: 'User ID and title are required' },
        { status: 400 }
      );
    }

    const branch = await memorySystem.createBranch(userId, {
      title,
      description,
      tags,
      keywords,
      isImportant
    });

    return NextResponse.json({ success: true, branch });
  } catch (error) {
    logger.error('SYSTEM', 'Error creating memory branch', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: 'Failed to create memory branch' },
      { status: 500 }
    );
  }
}
