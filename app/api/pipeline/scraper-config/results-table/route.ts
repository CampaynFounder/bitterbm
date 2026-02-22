/**
 * PATCH /api/pipeline/scraper-config/results-table
 * Update only the results_table JSON for a county's scraper config (superset type).
 * Body: { county_id: string, config_type?: 'superset' | 'extraction', results_table: object }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { county_id, config_type = 'superset', results_table } = body;
    if (!county_id || results_table === undefined) {
      return NextResponse.json(
        { error: 'county_id and results_table are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('scraper_configs')
      .update({
        results_table: typeof results_table === 'object' ? results_table : null,
      })
      .eq('county_id', county_id)
      .eq('config_type', config_type === 'extraction' ? 'extraction' : 'superset')
      .select('id, results_table')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'No scraper config found for this county and config type. Run Convert & save first.' },
          { status: 404 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      config_id: data.id,
      results_table: data.results_table,
      message: 'Result table config saved.',
    });
  } catch (e) {
    console.error('PATCH results-table error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Update failed' },
      { status: 500 }
    );
  }
}
