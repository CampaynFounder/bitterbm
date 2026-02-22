/**
 * Pipeline Statistics
 * 
 * Get real-time stats for dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // Parallel queries for performance
    const [
      countiesResult,
      supersetsResult,
      casesResult,
      queueResult,
      reviewResult,
      documentsResult
    ] = await Promise.all([
      // Counties
      supabase.from('counties').select('status', { count: 'exact', head: true }),
      
      // Supersets
      supabase.from('supersets').select('status, total_cases', { count: 'exact' }),
      
      // Cases
      supabase.from('cases').select('extraction_status', { count: 'exact', head: true }),
      
      // Processing queue
      supabase.from('processing_queue').select('status, task_type', { count: 'exact' }),
      
      // Review queue
      supabase.from('review_queue').select('status', { count: 'exact', head: true }),
      
      // Documents
      supabase.from('case_documents').select('status', { count: 'exact', head: true })
    ]);

    // Calculate totals
    const supersets = supersetsResult.data || [];
    const queue = queueResult.data || [];

    const stats = {
      counties: {
        total: countiesResult.count || 0
      },
      supersets: {
        total: supersetsResult.count || 0,
        active: supersets.filter(s => s.status === 'processing').length,
        total_cases: supersets.reduce((sum, s) => sum + (s.total_cases || 0), 0)
      },
      cases: {
        total: casesResult.count || 0
      },
      queue: {
        total: queueResult.count || 0,
        queued: queue.filter(q => q.status === 'queued').length,
        processing: queue.filter(q => q.status === 'processing').length,
        complete: queue.filter(q => q.status === 'complete').length,
        failed: queue.filter(q => q.status === 'failed').length,
        by_type: queue.reduce((acc, q) => {
          acc[q.task_type] = (acc[q.task_type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      },
      review: {
        pending: reviewResult.count || 0
      },
      documents: {
        total: documentsResult.count || 0
      }
    };

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get stats error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
