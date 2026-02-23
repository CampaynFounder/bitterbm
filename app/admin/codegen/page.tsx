'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/admin/PageComponents';
import { TitleBlock, Hint, SectionBlock, Card } from '@/components/admin/AdminComponents';
import { ResultTableEnrichForm, type ResultTableConfig, defaultResultTableConfig } from '@/components/admin/ResultTableEnrichForm';

type SavedPresetRow = { id: string; name: string; description?: string; flow_json: unknown; kind?: string };

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
  const [resultsTable, setResultsTable] = useState<ResultTableConfig | null>(null);
  const [loadingResultsTable, setLoadingResultsTable] = useState(false);
  const [saveResultsTableStatus, setSaveResultsTableStatus] = useState<string | null>(null);
  const [session, setSession] = useState<{ access_token?: string } | null>(null);
  const [adminSecret] = useState(() => (typeof window !== 'undefined' ? sessionStorage.getItem('scraper_admin_secret') ?? '' : ''));
  const [savedPresetsList, setSavedPresetsList] = useState<SavedPresetRow[]>([]);
  const [loadPresetModalOpen, setLoadPresetModalOpen] = useState(false);
  const [savePresetModalOpen, setSavePresetModalOpen] = useState(false);
  const [savePresetName, setSavePresetName] = useState('');
  const [savePresetDescription, setSavePresetDescription] = useState('');
  const [savePresetError, setSavePresetError] = useState<string | null>(null);
  const [savePresetLoading, setSavePresetLoading] = useState(false);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [loadedPresetId, setLoadedPresetId] = useState<string | null>(null);
  const [loadedPresetName, setLoadedPresetName] = useState<string | null>(null);
  const [presetSearch, setPresetSearch] = useState('');

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
      setResultsTable(null);
      setCode('');
      return;
    }
    supabase
      .from('scraper_configs')
      .select('id, config_type, is_validated, codegen_source, created_at, results_table')
      .eq('county_id', countyId)
      .eq('config_type', configType)
      .maybeSingle()
      .then(({ data }) => {
        const cfg = data as (SavedConfig & { results_table?: any }) | null;
        if (!cfg) {
          setSavedConfig(null);
          setResultsTable(null);
          setCode('');
          return;
        }
        setSavedConfig({
          id: cfg.id,
          config_type: cfg.config_type,
          is_validated: cfg.is_validated,
          codegen_source: cfg.codegen_source,
          created_at: cfg.created_at,
        });
        if (cfg.codegen_source) setCode(cfg.codegen_source);
        else setCode('');
        if (configType === 'superset') {
          const rt = (cfg as any).results_table as ResultTableConfig | null | undefined;
          const merged =
            rt && typeof rt === 'object' && rt.primaryId != null && rt.tableSelector != null
              ? rt
              : { ...defaultResultTableConfig, ...(rt && typeof rt === 'object' ? rt : {}) };
          setResultsTable(merged);
        } else {
          setResultsTable(null);
        }
      });
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
      if (configType === 'superset') {
        // Merge converter output with defaults so the form never gets a partial object (avoids client crash when results_table is {})
        const rt = data.config?.results_table as ResultTableConfig | null | undefined;
        const merged =
          rt && typeof rt === 'object' && rt.primaryId != null && rt.tableSelector != null
            ? rt
            : { ...defaultResultTableConfig, ...(rt && typeof rt === 'object' ? rt : {}) };
        setResultsTable(merged);
      } else {
        setResultsTable(null);
      }
    } catch (e) {
      setResult({ success: false, error: e instanceof Error ? e.message : 'Convert failed' });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s ?? null);
    });
  }, []);

  useEffect(() => {
    if (loadPresetModalOpen && (adminSecret || session?.access_token)) {
      setPresetsLoading(true);
      fetch('/api/admin/scraper/flows?kind=codegen_result_config', { headers: authHeaders() })
        .then((res) => res.json())
        .then((data) => setSavedPresetsList(data.flows ?? []))
        .catch(() => setSavedPresetsList([]))
        .finally(() => setPresetsLoading(false));
    }
  }, [loadPresetModalOpen, adminSecret, session?.access_token]);

  function authHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
    if (adminSecret) h['X-Admin-Secret'] = adminSecret;
    return h;
  }

  const loadSavedCodegen = () => {
    if (savedConfig?.codegen_source) setCode(savedConfig.codegen_source);
  };

  function applyPresetToForm(preset: SavedPresetRow) {
    const raw = preset.flow_json;
    const blob = (typeof raw === 'string' ? (() => { try { return JSON.parse(raw) } catch { return null } })() : raw) as ResultTableConfig | null;
    if (blob && typeof blob === 'object') {
      const merged = { ...defaultResultTableConfig, ...blob, primaryId: blob.primaryId && typeof blob.primaryId === 'object' ? { ...defaultResultTableConfig.primaryId, ...blob.primaryId } : defaultResultTableConfig.primaryId };
      setResultsTable(merged);
    }
  }

  async function handleSavePreset(overwrite: boolean) {
    if (!savePresetName.trim()) { setSavePresetError('Name required'); return; }
    if (!resultsTable) { setSavePresetError('No result table config to save.'); return; }
    setSavePresetLoading(true);
    setSavePresetError(null);
    const idToUpdate = overwrite && loadedPresetId ? loadedPresetId : undefined;
    try {
      const res = await fetch('/api/admin/scraper/flows', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ...(idToUpdate ? { id: idToUpdate } : {}),
          name: savePresetName.trim(),
          description: savePresetDescription.trim() || undefined,
          flow_json: resultsTable,
          kind: 'codegen_result_config',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setSavePresetModalOpen(false);
      setSavePresetName('');
      setSavePresetDescription('');
      if (overwrite && loadedPresetId) setLoadedPresetName(savePresetName.trim());
      else { setLoadedPresetId(null); setLoadedPresetName(null); }
    } catch (e) {
      setSavePresetError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavePresetLoading(false);
    }
  }

  const handleSaveResultsTable = async () => {
    if (!countyId || configType !== 'superset' || !resultsTable) return;
    setSaveResultsTableStatus(null);
    setLoadingResultsTable(true);
    try {
      const res = await fetch('/api/pipeline/scraper-config/results-table', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          county_id: countyId,
          config_type: configType,
          results_table: resultsTable,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSaveResultsTableStatus('Result table saved.');
    } catch (e) {
      setSaveResultsTableStatus(
        e instanceof Error ? `Save failed: ${e.message}` : 'Save failed'
      );
    } finally {
      setLoadingResultsTable(false);
    }
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

      <SectionBlock title="Convert and save" description="Select county and config type; any saved conversion for that county loads automatically (code + result table). Paste new codegen and Convert & save to overwrite.">
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
                    Reload saved codegen
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

      {configType === 'superset' && (
        <SectionBlock
          title="Enrich result table (conditional logic + extraction)"
          description="Define how to interpret the results table (ID column, row filters, nested filters, extract columns). Save to county or save/load named presets to reuse across counties."
        >
          <Card className="max-w-3xl">
            <div className="p-4 sm:p-6 space-y-4">
              {!resultsTable && (
                <p className="admin-text-muted text-sm">
                  No result table config yet. Load a preset below or Convert &amp; save first to get a starting config.
                </p>
              )}
              {resultsTable && (
                <ResultTableEnrichForm
                  value={resultsTable}
                  onChange={(v) => setResultsTable(v)}
                />
              )}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button size="sm" onClick={handleSaveResultsTable} disabled={loadingResultsTable || !resultsTable}>
                  {loadingResultsTable ? 'Saving…' : 'Save to county'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setLoadPresetModalOpen(true)}>
                  Load preset
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setSavePresetName(loadedPresetName ?? ''); setSavePresetDescription(''); setSavePresetError(null); setSavePresetModalOpen(true); }} disabled={!resultsTable}>
                  Save as preset
                </Button>
                {saveResultsTableStatus && <span className="text-sm admin-text-muted">{saveResultsTableStatus}</span>}
              </div>
            </div>
          </Card>
        </SectionBlock>
      )}

      {loadPresetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setLoadPresetModalOpen(false)}>
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-base mb-2">Load result table preset</h3>
              <p className="text-sm admin-text-muted mb-2">Load a saved conditional logic preset into the form. Then save to county or overwrite the preset.</p>
              <input
                type="text"
                value={presetSearch}
                onChange={(e) => setPresetSearch(e.target.value)}
                placeholder="Search by name…"
                className="admin-input w-full"
              />
            </div>
            <div className="overflow-auto flex-1 p-2">
              {presetsLoading ? (
                <p className="text-sm admin-text-muted">Loading…</p>
              ) : savedPresetsList.filter((f) => !presetSearch.trim() || (f.name ?? '').toLowerCase().includes(presetSearch.trim().toLowerCase())).length === 0 ? (
                <p className="text-sm admin-text-muted">No saved presets</p>
              ) : (
                <ul className="list-none p-0 m-0 space-y-1">
                  {savedPresetsList
                    .filter((f) => !presetSearch.trim() || (f.name ?? '').toLowerCase().includes(presetSearch.trim().toLowerCase()))
                    .map((f) => (
                      <li key={f.id} className="flex items-center gap-2">
                        <button
                          type="button"
                          className="flex-1 text-left px-3 py-2 rounded-lg text-sm hover:bg-[var(--bg-elevated)]"
                          onClick={() => { applyPresetToForm(f); setLoadedPresetId(f.id); setLoadedPresetName(f.name ?? null); setLoadPresetModalOpen(false); setPresetSearch(''); }}
                        >
                          <span className="font-medium">{f.name}</span>
                          {f.description && <span className="block text-xs admin-text-muted">{f.description}</span>}
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <div className="p-2 border-t border-[var(--border)]">
              <Button size="sm" variant="ghost" onClick={() => setLoadPresetModalOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {savePresetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setSavePresetModalOpen(false); setSavePresetError(null); }}>
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] max-w-md w-full p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-base mb-2">Save result table preset</h3>
            <p className="text-sm admin-text-muted mb-3">Save the current conditional logic (result table config) as a named preset. Load it later to apply to any county.</p>
            <label className="block admin-heading-3 mb-1">Name</label>
            <input value={savePresetName} onChange={(e) => setSavePresetName(e.target.value)} placeholder="e.g. Cobb Superior result table" className="admin-input w-full mb-3" />
            <label className="block admin-heading-3 mb-1">Description (optional)</label>
            <input value={savePresetDescription} onChange={(e) => setSavePresetDescription(e.target.value)} className="admin-input w-full mb-3" />
            {savePresetError && <p className="text-sm text-[var(--accent-gold)] mb-2">{savePresetError}</p>}
            <div className="flex flex-wrap gap-2">
              {loadedPresetId ? (
                <>
                  <Button size="sm" onClick={() => handleSavePreset(true)} disabled={savePresetLoading}>{savePresetLoading ? 'Saving…' : 'Overwrite'}</Button>
                  <Button size="sm" variant="ghost" onClick={() => handleSavePreset(false)} disabled={savePresetLoading}>Save as new copy</Button>
                </>
              ) : (
                <Button size="sm" onClick={() => handleSavePreset(false)} disabled={savePresetLoading}>{savePresetLoading ? 'Saving…' : 'Save'}</Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => { setSavePresetModalOpen(false); setSavePresetError(null); }}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
