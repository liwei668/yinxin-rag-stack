import { NextRequest, NextResponse } from 'next/server';
import memorySystem from '../../../../src/services/memorySystem';
import { logger } from '../../../../src/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, input } = body;

    if (!userId || !input) {
      return NextResponse.json(
        { error: 'User ID and input are required' },
        { status: 400 }
      );
    }

    const matchResult = await memorySystem.matchBranch(userId, input);

    return NextResponse.json({ 
      success: true, 
      match: matchResult 
    });
  } catch (error) {
    logger.error('SYSTEM', 'Error matching memory branch', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: 'Failed to match memory branch' },
      { status: 500 }
    );
  }
}
