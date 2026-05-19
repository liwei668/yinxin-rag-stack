import { NextRequest, NextResponse } from 'next/server';
import memorySystem from '../../../../src/services/memorySystem';
import { logger } from '../../../../src/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const preference = await memorySystem.getUserPreference(userId);

    return NextResponse.json({ success: true, preference });
  } catch (error) {
    logger.error('SYSTEM', 'Error fetching user preference', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: 'Failed to fetch user preference' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, ...updates } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const preference = await memorySystem.updateUserPreference(userId, updates);

    return NextResponse.json({ success: true, preference });
  } catch (error) {
    logger.error('SYSTEM', 'Error updating user preference', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: 'Failed to update user preference' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, signalType, signalValue, confidence } = body;

    if (!userId || !signalType) {
      return NextResponse.json(
        { error: 'User ID and signalType are required' },
        { status: 400 }
      );
    }

    const updates = await memorySystem.learnFromSignal(
      userId,
      signalType,
      signalValue,
      confidence || 0.5
    );

    return NextResponse.json({ success: true, updates });
  } catch (error) {
    logger.error('SYSTEM', 'Error learning from signal', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: 'Failed to learn from signal' },
      { status: 500 }
    );
  }
}
