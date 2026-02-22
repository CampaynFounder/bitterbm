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
    const { code, county_id, config_type = 'superset' } = body;

    if (!code || !county_id) {
      return NextResponse.json(
        { success: false, error: 'code and county_id are required' },
        { status: 400 }
      );
    }

    // Call Python converter service
    const converterResponse = await fetch('http://localhost:8000/pipeline/convert-codegen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, county_id })
    });

    if (!converterResponse.ok) {
      const errText = await converterResponse.text();
      throw new Error(errText || 'Converter service error');
    }

    const result = await converterResponse.json();

    const row = {
      county_id,
      config_type: config_type === 'extraction' ? 'extraction' : 'superset',
      navigation_steps: result.config.navigation_steps,
      search_form: result.config.search_form ?? null,
      results_table: result.config.results_table ?? null,
      extraction_rules: result.config.extraction_rules,
      codegen_source: code,
      is_validated: false,
    };

    // Upsert so we replace existing config for this county+type and always store codegen
    const { data: config, error } = await supabase
      .from('scraper_configs')
      .upsert(row, { onConflict: 'county_id,config_type' })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      config_id: config.id,
      config: result.config,
      needs_review: result.needs_review,
      message: 'Config saved. Codegen stored. Please review and validate.'
    });

  } catch (error) {
    console.error('Convert codegen error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
