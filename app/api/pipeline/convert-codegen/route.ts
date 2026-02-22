/**
 * Convert Codegen to Config
 * 
 * Parses Playwright codegen output into structured scraper configuration
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
    const { code, county_id } = body;

    // Call Python converter service
    const converterResponse = await fetch('http://localhost:8000/pipeline/convert-codegen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, county_id })
    });

    if (!converterResponse.ok) {
      throw new Error('Converter service error');
    }

    const result = await converterResponse.json();

    // Save config to database
    const { data: config, error } = await supabase
      .from('scraper_configs')
      .insert({
        county_id,
        navigation_steps: result.config.navigation_steps,
        search_form: result.config.search_form,
        results_table: result.config.results_table,
        extraction_rules: result.config.extraction_rules,
        is_validated: false
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      config_id: config.id,
      config: result.config,
      needs_review: result.needs_review,
      message: 'Config created. Please review and validate.'
    });

  } catch (error) {
    console.error('Convert codegen error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
