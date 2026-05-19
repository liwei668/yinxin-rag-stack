import { NextRequest, NextResponse } from 'next/server';
import memorySystem from '@/services/memorySystem';
import { logger } from '../../../../src/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, input } = body;

    if (!userId || !input) {
      return NextResponse.json(
        { success: false, error: 'Missing userId or input' },
        { status: 400 }
      );
    }

    const result = await memorySystem.detectDuplicateIntent(userId, input);

    return NextResponse.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('SYSTEM', 'Duplicate intent detection error', { extra: { error: String(error) } });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
