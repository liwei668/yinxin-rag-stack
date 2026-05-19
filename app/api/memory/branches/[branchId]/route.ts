import { NextRequest, NextResponse } from 'next/server';
import memorySystem from '../../../../../src/services/memorySystem';
import { logger } from '../../../../../src/lib/logger';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ branchId: string }> }
) {
  try {
    const { branchId } = await context.params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const branch = await memorySystem.getBranch(userId, branchId);
    
    if (!branch) {
      return NextResponse.json(
        { error: 'Branch not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, branch });
  } catch (error) {
    logger.error('SYSTEM', 'Error fetching memory branch', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: 'Failed to fetch memory branch' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ branchId: string }> }
) {
  try {
    const { branchId } = await context.params;
    const body = await request.json();
    const { userId, ...updates } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const updatedBranch = await memorySystem.updateBranch(
      userId,
      branchId,
      updates
    );

    if (!updatedBranch) {
      return NextResponse.json(
        { error: 'Branch not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, branch: updatedBranch });
  } catch (error) {
    logger.error('SYSTEM', 'Error updating memory branch', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: 'Failed to update memory branch' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ branchId: string }> }
) {
  try {
    const { branchId } = await context.params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const deletedBranch = await memorySystem.deleteBranch(userId, branchId);

    if (!deletedBranch) {
      return NextResponse.json(
        { error: 'Branch not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('SYSTEM', 'Error deleting memory branch', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: 'Failed to delete memory branch' },
      { status: 500 }
    );
  }
}
