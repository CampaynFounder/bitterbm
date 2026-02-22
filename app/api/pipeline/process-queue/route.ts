/**
 * Process Queue
 * 
 * Manually trigger processing of queued tasks
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { task_type, limit = 10 } = body;

    // Call Python pipeline service
    const response = await fetch('http://localhost:8000/pipeline/process-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_type, limit })
    });

    if (!response.ok) {
      throw new Error('Pipeline service error');
    }

    const result = await response.json();

    return NextResponse.json({
      success: true,
      processed: result.processed,
      message: `Processed ${result.processed} tasks`
    });

  } catch (error) {
    console.error('Process queue error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
