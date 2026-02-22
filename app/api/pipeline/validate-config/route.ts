/**
 * Validate Config
 * 
 * Mark scraper config as validated and ready for production use
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { config_id, validated_by } = body;

    const { data, error } = await supabase
      .from('scraper_configs')
      .update({
        is_validated: true,
        validated_at: new Date().toISOString(),
        validated_by
      })
      .eq('id', config_id)
      .select()
      .single();

    if (error) throw error;

    // Also update county status to active
    await supabase
      .from('counties')
      .update({ status: 'active' })
      .eq('id', data.county_id);

    return NextResponse.json({
      success: true,
      message: 'Config validated and county activated'
    });

  } catch (error) {
    console.error('Validate config error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
