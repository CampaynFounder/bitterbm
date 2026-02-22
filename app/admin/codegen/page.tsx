'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/admin/PageComponents';
import { TitleBlock, Hint, SectionBlock, Card } from '@/components/admin/AdminComponents';

type County = {
  id: string;
  name: string;
  state: string;
  base_url: string;
};

type SavedConfig = {
  id: string;
  config_type: string | null;
  is_validated: boolean;
  codegen_source: string | null;
  created_at: string;
};

export default function CodegenPage() {
  const searchParams = useSearchParams();
  const countyFromUrl = searchParams.get('county') ?? '';
  const [counties, setCounties] = useState<County[]>([]);
  const [countyId, setCountyId] = useState('');
  const [configType, setConfigType] = useState<'superset' | 'extraction'>('superset');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message?: string; config_id?: string; error?: string; needs_review?: string[] } | null>(null);
  const [savedConfig, setSavedConfig] = useState<SavedConfig | null>(null);

  useEffect(() => {
    supabase.from('scraper_counties').select('id, name, state, base_url').order('state').order('name').then(({ data }) => {
      const list = (data as County[]) ?? [];
      setCounties(list);
      if (list.length > 0) {
        const preferred = countyFromUrl && list.some((c) => c.id === countyFromUrl) ? countyFromUrl : list[0].id;
        setCountyId((prev) => (prev && list.some((c) => c.id === prev) ? prev : preferred));
      }
    });
  }, [countyFromUrl]);

  useEffect(() => {
    if (!countyId) {
      setSavedConfig(null);
      return;
    }
    supabase
      .from('scraper_configs')
      .select('id, config_type, is_validated, codegen_source, created_at')
      .eq('county_id', countyId)
      .eq('config_type', configType)
      .maybeSingle()
      .then(({ data }) => setSavedConfig((data as SavedConfig | null) ?? null));
  }, [countyId, configType]);

  const handleConvert = async () => {
    if (!code.trim()) {
      setResult({ success: false, error: 'Paste your Playwright codegen output first.' });
      return;
    }
    if (!countyId) {
      setResult({ success: false, error: 'Select a county.' });
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch('/api/pipeline/convert-codegen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), county_id: countyId, config_type: configType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Convert failed');
      setResult({
        success: true,
        message: data.message,
        config_id: data.config_id,
        needs_review: data.needs_review,
      });
      setSavedConfig({
        id: data.config_id,
        config_type: configType,
        is_validated: false,
        codegen_source: code.trim(),
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      setResult({ success: false, error: e instanceof Error ? e.message : 'Convert failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const loadSavedCodegen = () => {
    if (savedConfig?.codegen_source) setCode(savedConfig.codegen_source);
  };

  return (
    <div className="w-full min-w-0">
      <TitleBlock
        icon="📋"
        title="Codegen → Config"
        description="Paste Playwright codegen output to convert it to a scraper config. The raw codegen is stored with the config."
      />
      <Hint className="mt-4">
        Run <code className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)]">python3 -m playwright codegen &lt;court-url&gt;</code>, record your flow, then paste the generated code below and click Convert &amp; save.
      </Hint>

      <SectionBlock title="Convert and save" description="Select county and config type, paste codegen, then convert.">
        <Card className="max-w-3xl">
          <div className="p-4 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block admin-heading-3 mb-1">County</label>
                <select
                  value={countyId}
                  onChange={(e) => setCountyId(e.target.value)}
                  className="admin-input w-full"
                >
                  <option value="">Select county</option>
                  {counties.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}, {c.state}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block admin-heading-3 mb-1">Config type</label>
                <select
                  value={configType}
                  onChange={(e) => setConfigType(e.target.value as 'superset' | 'extraction')}
                  className="admin-input w-full"
                >
                  <option value="superset">Superset (search → case list)</option>
                  <option value="extraction">Extraction (case detail + PDFs)</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block admin-heading-3">Playwright codegen output</label>
                {savedConfig?.codegen_source && (
                  <Button size="sm" variant="ghost" onClick={loadSavedCodegen}>
                    Load saved codegen
                  </Button>
                )}
              </div>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste the full script from Playwright codegen (e.g. page.goto(...), .fill(...), .click(...))"
                className="admin-input w-full font-mono text-sm min-h-[240px] resize-y"
                spellCheck={false}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleConvert} disabled={submitting}>
                {submitting ? 'Converting…' : 'Convert & save'}
              </Button>
              {result?.success && (
                <span className="text-sm" style={{ color: 'var(--accent-cyan)' }}>{result.message}</span>
              )}
              {result?.error && (
                <span className="text-sm" style={{ color: 'var(--accent-red)' }}>{result.error}</span>
              )}
            </div>

            {result?.success && result.needs_review?.length && (
              <p className="admin-text-muted text-sm">
                Review: {result.needs_review.join(', ')}
              </p>
            )}

            {savedConfig && (
              <div className="pt-4 border-t border-[var(--border)]">
                <p className="admin-text-muted text-sm">
                  Saved config for this county + type: {savedConfig.is_validated ? 'Validated' : 'Draft'} · Codegen stored
                </p>
              </div>
            )}
          </div>
        </Card>
      </SectionBlock>
    </div>
  );
}
