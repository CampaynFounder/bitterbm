/**
 * Data Pipeline API Routes
 * 
 * Endpoints:
 * - POST /api/pipeline/generate-superset
 * - POST /api/pipeline/convert-codegen
 * - POST /api/pipeline/validate-config
 * - POST /api/pipeline/process-queue
 * - GET  /api/pipeline/stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Generate Superset
 * 
 * Triggers Python pipeline to run search and collect case IDs
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { county_id, name, search_params } = body;

    // Create superset record
    const { data: superset, error } = await supabase
      .from('supersets')
      .insert({
        county_id,
        name: name || `Search ${new Date().toLocaleDateString()}`,
        search_params,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    // Call Python pipeline service
    // In production, this would be a webhook or queue trigger
    const pipelineResponse = await fetch('http://localhost:8000/pipeline/generate-superset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        superset_id: superset.id,
        county_id,
        search_params
      })
    });

    if (!pipelineResponse.ok) {
      throw new Error('Pipeline service error');
    }

    return NextResponse.json({
      success: true,
      superset_id: superset.id,
      message: 'Superset generation started'
    });

  } catch (error) {
    console.error('Generate superset error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
