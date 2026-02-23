'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/admin/PageComponents';
import { TitleBlock, Hint, SectionBlock, Card } from '@/components/admin/AdminComponents';
import { ResultTableEnrichForm, type ResultTableConfig, defaultResultTableConfig } from '@/components/admin/ResultTableEnrichForm';

type SavedPresetRow = { id: string; name: string; description?: string; flow_json: unknown; kind?: string };

type CodegenNavStep = { type: string; url?: string; selector?: string; value?: string; iframe?: string; duration?: number };
type Phase1Blob = { flow: { name: string; steps: Array<{ type: string; config?: Record<string, unknown>; label?: string }> }; siteConfig: { resultTable: ResultTableConfig; siteId: string; baseUrl: string } };
type Phase1Step = Phase1Blob['flow']['steps'][number];

const PHASE1_STEP_TYPES: { value: string; label: string }[] = [
  { value: 'navigate', label: 'Go to URL' },
  { value: 'switch_frame', label: 'Switch to iframe' },
  { value: 'switch_frame_main', label: 'Switch to main page' },
  { value: 'wait', label: 'Wait for element' },
  { value: 'fill_field', label: 'Fill text field' },
  { value: 'date_range', label: 'Set date range' },
  { value: 'checkbox', label: 'Check / uncheck box' },
  { value: 'click', label: 'Click' },
  { value: 'delay', label: 'Delay (ms)' },
] as const;

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
  const [navigationSteps, setNavigationSteps] = useState<CodegenNavStep[]>([]);
  const [loadedPhase1Preset, setLoadedPhase1Preset] = useState<Phase1Blob | null>(null);
  const [savedPhase1List, setSavedPhase1List] = useState<SavedPresetRow[]>([]);
  const [loadPhase1ModalOpen, setLoadPhase1ModalOpen] = useState(false);
  const [savePhase1ModalOpen, setSavePhase1ModalOpen] = useState(false);
  const [savePhase1Name, setSavePhase1Name] = useState('');
  const [savePhase1Description, setSavePhase1Description] = useState('');
  const [savePhase1Error, setSavePhase1Error] = useState<string | null>(null);
  const [savePhase1Loading, setSavePhase1Loading] = useState(false);
  const [phase1ListLoading, setPhase1ListLoading] = useState(false);
  const [loadedPhase1Id, setLoadedPhase1Id] = useState<string | null>(null);
  const [loadedPhase1Name, setLoadedPhase1Name] = useState<string | null>(null);
  const [phase1Search, setPhase1Search] = useState('');
  const [phase1FlowName, setPhase1FlowName] = useState('codegen-superset');
  const [phase1Steps, setPhase1Steps] = useState<Phase1Step[]>([]);

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
      const navSteps: CodegenNavStep[] = Array.isArray(data.config?.navigation_steps) ? data.config.navigation_steps : [];
      setNavigationSteps(navSteps);
      setLoadedPhase1Preset(null);
      if (configType === 'superset') {
        // Merge converter output with defaults so the form never gets a partial object (avoids client crash when results_table is {})
        const rt = data.config?.results_table as ResultTableConfig | null | undefined;
        const merged =
          rt && typeof rt === 'object' && rt.primaryId != null && rt.tableSelector != null
            ? rt
            : { ...defaultResultTableConfig, ...(rt && typeof rt === 'object' ? rt : {}) };
        setResultsTable(merged);
        const initialPhase1 = codegenStepsToPhase1Steps(navSteps);
        setPhase1FlowName('codegen-superset');
        setPhase1Steps(initialPhase1);
      } else {
        setResultsTable(null);
        setPhase1Steps([]);
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

  function codegenStepsToPhase1Steps(steps: CodegenNavStep[]): Array<{ type: string; config?: Record<string, unknown> }> {
    const out: Phase1Step[] = [];
    let iframeInserted = false;
    for (const step of steps) {
      if (step.iframe && !iframeInserted) {
        out.push({ type: 'switch_frame', config: { selector: step.iframe || 'iframe' } });
        iframeInserted = true;
      }
      switch (step.type) {
        case 'navigate':
          out.push({ type: 'navigate', config: { url: step.url ?? '' } });
          break;
        case 'fill':
          out.push({ type: 'fill_field', config: { selector: step.selector ?? '', value: step.value ?? '', clearFirst: true } });
          break;
        case 'click':
          out.push({ type: 'click', config: { selector: step.selector ?? '' } });
          break;
        case 'check':
          out.push({ type: 'checkbox', config: { selector: step.selector ?? '', state: 'checked' } });
          break;
        case 'wait':
          out.push({ type: 'delay', config: { ms: typeof step.duration === 'number' ? step.duration : 1000 } });
          break;
        default:
          break;
      }
    }
    return out;
  }

  /** Strip {{ }} from date_range fromValue/toValue so output JSON uses plain dates (e.g. 01/01/2019). */
  function normalizeStepsForJson(steps: Phase1Step[]): Phase1Step[] {
    return steps.map((step) => {
      if (step.type !== 'date_range' || !step.config) return step;
      const cfg = { ...step.config };
      if (typeof cfg.fromValue === 'string') {
        cfg.fromValue = cfg.fromValue.replace(/^\{\{?\s*/, '').replace(/\s*\}\}?$/, '');
      }
      if (typeof cfg.toValue === 'string') {
        cfg.toValue = cfg.toValue.replace(/^\{\{?\s*/, '').replace(/\s*\}\}?$/, '');
      }
      return { ...step, config: cfg };
    });
  }

  /** Parse comma-separated string to array for export; leaves arrays and non-strings unchanged. */
  function parseCommaList(v: string | string[] | undefined): string[] {
    if (Array.isArray(v)) return v;
    if (typeof v !== 'string') return [];
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }

  /** Normalize resultTable for export: comma-separated strings → arrays for "in"/"all_in", columnNames. */
  function normalizeResultTableForJson(rt: ResultTableConfig): ResultTableConfig {
    const out = JSON.parse(JSON.stringify(rt)) as ResultTableConfig;
    if (typeof out.columnNames === 'string') {
      out.columnNames = parseCommaList(out.columnNames);
    }
    (out.nestedTableExtract ?? []).forEach((ne) => {
      if (ne.conditionOperator === 'in' && typeof ne.conditionValue === 'string') {
        ne.conditionValue = parseCommaList(ne.conditionValue);
      }
    });
    (out.nestedTableChecks ?? []).forEach((nc) => {
      const op = nc.operator ?? 'equals';
      if ((op === 'in' || op === 'all_in') && typeof nc.value === 'string') {
        nc.value = parseCommaList(nc.value);
      }
    });
    return out;
  }

  function buildPhase1Blob(): Phase1Blob | null {
    if (configType !== 'superset' || !resultsTable) return null;
    if (!phase1Steps.length) return null;
    const resultTable = normalizeResultTableForJson(
      { ...defaultResultTableConfig, ...resultsTable, primaryId: resultsTable.primaryId && typeof resultsTable.primaryId === 'object' ? { ...defaultResultTableConfig.primaryId, ...resultsTable.primaryId } : defaultResultTableConfig.primaryId }
    );
    const firstNav = navigationSteps.find((s) => s.type === 'navigate');
    const baseUrlFromNav = firstNav?.url ?? '';
    const baseSiteId = (loadedPhase1Preset?.siteConfig?.siteId ?? countyId) || 'codegen';
    const baseUrl = loadedPhase1Preset?.siteConfig?.baseUrl ?? baseUrlFromNav;
    const stepsForJson = normalizeStepsForJson(phase1Steps);
    return {
      flow: { name: phase1FlowName || 'codegen-superset', steps: stepsForJson },
      siteConfig: {
        ...(loadedPhase1Preset?.siteConfig ?? {}),
        resultTable,
        siteId: baseSiteId,
        baseUrl,
      },
    };
  }

  function downloadPhase1() {
    const blob = buildPhase1Blob();
    if (!blob) {
      setResult({ success: false, error: 'Convert & save first and set result table, or load a Phase 1 preset.' });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ flow: blob.flow, siteConfig: blob.siteConfig }, null, 2)], { type: 'application/json' }));
    a.download = 'superset-phase1.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  useEffect(() => {
    if ((loadPhase1ModalOpen || savePhase1ModalOpen) && (adminSecret || session?.access_token)) {
      setPhase1ListLoading(true);
      fetch('/api/admin/scraper/flows?kind=codegen_phase1', { headers: authHeaders() })
        .then((res) => res.json())
        .then((data) => setSavedPhase1List(data.flows ?? []))
        .catch(() => setSavedPhase1List([]))
        .finally(() => setPhase1ListLoading(false));
    }
  }, [loadPhase1ModalOpen, savePhase1ModalOpen, adminSecret, session?.access_token]);

  async function handleSavePhase1(slot: 'golden' | 'experimental') {
    const blob = buildPhase1Blob();
    if (!blob) { setSavePhase1Error('Convert & save and set result table first.'); return; }
    setSavePhase1Loading(true);
    setSavePhase1Error(null);
    const county = counties.find((c) => c.id === countyId);
    const countyLabel = county ? `${county.name}, ${county.state}` : countyId || 'Unknown county';
    const slotLabel = slot === 'golden' ? 'Golden' : 'Experimental';
    const name = `${countyLabel} – ${slotLabel}`;
    const existing = slot === 'golden' ? goldenConfig : experimentalConfig;
    const idToUpdate = existing?.id;
    try {
      const res = await fetch('/api/admin/scraper/flows', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ...(idToUpdate ? { id: idToUpdate } : {}),
          name,
          description: undefined,
          flow_json: { flow: blob.flow, siteConfig: blob.siteConfig },
          kind: 'codegen_phase1',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setSavePhase1ModalOpen(false);
      setSavePhase1Name('');
      setSavePhase1Description('');
      setLoadedPhase1Id(null);
      setLoadedPhase1Name(null);
    } catch (e) {
      setSavePhase1Error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavePhase1Loading(false);
    }
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

  const [sectionExpanded, setSectionExpanded] = useState({ converter: false, editor: false, crawler: false });
  const expandAll = () => setSectionExpanded({ converter: true, editor: true, crawler: true });
  const collapseAll = () => setSectionExpanded({ converter: false, editor: false, crawler: false });

  const countyCaseCrawlerConfigs = savedPhase1List.filter((f) => {
    const raw = f.flow_json as Phase1Blob | null;
    return raw && typeof raw === 'object' && raw.siteConfig?.siteId === countyId;
  });
  const goldenConfig = countyCaseCrawlerConfigs.find((f) => (f.name ?? '').endsWith(' – Golden'));
  const experimentalConfig = countyCaseCrawlerConfigs.find((f) => (f.name ?? '').endsWith(' – Experimental'));

  return (
    <div className="w-full min-w-0">
      <TitleBlock
        icon="📋"
        title="Case Crawler builder"
        description="Build a single Case Crawler config (flow + result table) per county. Paste Playwright codegen, edit the flow and enrichment, then save or download the JSON for Phase 1."
      />
      <Hint className="mt-4">
        Run <code className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)]">python3 -m playwright codegen &lt;court-url&gt;</code>, record your flow, then paste below and convert. Load a saved config at the top to resume editing.
      </Hint>

      {/* Top bar: county, Load, Expand/Collapse all */}
      <Card className="max-w-3xl mt-6">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-48">
            <label className="block admin-heading-3 mb-1 text-xs">County</label>
            <select
              value={countyId}
              onChange={(e) => setCountyId(e.target.value)}
              className="admin-input w-full h-9"
            >
              <option value="">Select county</option>
              {counties.map((c) => (
                <option key={c.id} value={c.id}>{c.name}, {c.state}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="md" onClick={() => setLoadPhase1ModalOpen(true)} disabled={!countyId}>
              Load Case Crawler config
            </Button>
            <Button variant="secondary" size="md" onClick={expandAll}>
              Expand all
            </Button>
            <Button variant="secondary" size="md" onClick={collapseAll}>
              Collapse all
            </Button>
          </div>
        </div>
      </Card>

      {/* 1. Step Converter (Codegen) — collapsible, default collapsed */}
      <div className="mt-4 max-w-3xl admin-accordion">
        <button
          type="button"
          className="admin-accordion__header"
          aria-expanded={sectionExpanded.converter}
          onClick={() => setSectionExpanded((s) => ({ ...s, converter: !s.converter }))}
        >
          <span>Step Converter (from Playwright)</span>
          <span className="admin-accordion__chevron" aria-hidden>▶</span>
        </button>
        {sectionExpanded.converter && (
          <div className="admin-accordion__body">
            <div className="space-y-4">
              <div>
                <label className="block admin-heading-3 mb-1">Config type</label>
                <select
                  value={configType}
                  onChange={(e) => setConfigType(e.target.value as 'superset' | 'extraction')}
                  className="admin-input w-full max-w-xs h-9"
                >
                  <option value="superset">Superset (search → case list)</option>
                  <option value="extraction">Extraction (case detail + PDFs)</option>
                </select>
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
                  className="admin-input w-full font-mono text-sm min-h-[200px] resize-y"
                  spellCheck={false}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="md" onClick={handleConvert} disabled={submitting}>
                  {submitting ? 'Converting…' : 'Convert & save'}
                </Button>
                {result?.success && (
                  <span className="text-sm" style={{ color: 'var(--accent-cyan)' }}>{result.message}</span>
                )}
                {result?.error && (
                  <span className="text-sm" style={{ color: 'var(--accent-red)' }}>{result.error}</span>
                )}
              </div>
              {result?.success && result.needs_review?.length ? (
                <p className="admin-text-muted text-sm">Review: {result.needs_review.join(', ')}</p>
              ) : null}
              {savedConfig && (
                <p className="admin-text-muted text-sm">Saved for this county · {savedConfig.is_validated ? 'Validated' : 'Draft'}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Step Editor (Case Crawler flow) — collapsible, default collapsed */}
      {configType === 'superset' && (
        <div className="mt-2 max-w-3xl admin-accordion">
          <button
            type="button"
            className="admin-accordion__header"
            aria-expanded={sectionExpanded.editor}
            onClick={() => setSectionExpanded((s) => ({ ...s, editor: !s.editor }))}
          >
            <span>Step Editor (Case Crawler flow)</span>
            <span className="admin-accordion__chevron" aria-hidden>▶</span>
          </button>
          {sectionExpanded.editor && (
            <div className="admin-accordion__body">
              <p className="text-sm admin-text-muted mb-4">
                Auto-populated from codegen. Review and edit these steps to define how we reach the results table.
              </p>
              <Phase1FlowEditor
                flowName={phase1FlowName}
                steps={phase1Steps}
                onFlowNameChange={setPhase1FlowName}
                onStepsChange={setPhase1Steps}
              />
            </div>
          )}
        </div>
      )}

      {/* 3. Case Crawler (Enrich results) — collapsible, default collapsed */}
      {configType === 'superset' && (
        <div className="mt-2 max-w-3xl admin-accordion">
          <button
            type="button"
            className="admin-accordion__header"
            aria-expanded={sectionExpanded.crawler}
            onClick={() => setSectionExpanded((s) => ({ ...s, crawler: !s.crawler }))}
          >
            <span>Case Crawler (enrich results)</span>
            <span className="admin-accordion__chevron" aria-hidden>▶</span>
          </button>
          {sectionExpanded.crawler && (
            <div className="admin-accordion__body">
              {!resultsTable ? (
                <p className="admin-text-muted text-sm">Load a Case Crawler config above or convert first to get a starting result table.</p>
              ) : (
                <ResultTableEnrichForm value={resultsTable} onChange={(v) => setResultsTable(v)} />
              )}
              <div className="pt-4 border-t border-[var(--border)] flex flex-wrap items-center gap-2">
                <Button size="md" onClick={downloadPhase1} disabled={!buildPhase1Blob()}>
                  Download Case Crawler JSON
                </Button>
                <Button size="md" variant="secondary" onClick={() => setSavePhase1ModalOpen(true)} disabled={!buildPhase1Blob()}>
                  Save Case Crawler config
                </Button>
                {saveResultsTableStatus && <span className="text-sm admin-text-muted">{saveResultsTableStatus}</span>}
              </div>
              <details className="mt-2">
                <summary className="text-sm cursor-pointer admin-text-muted hover:underline">Advanced: result table presets</summary>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={handleSaveResultsTable} disabled={loadingResultsTable || !resultsTable}>
                    {loadingResultsTable ? 'Saving…' : 'Save to county'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setLoadPresetModalOpen(true)}>Load preset</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setSavePresetName(loadedPresetName ?? ''); setSavePresetDescription(''); setSavePresetError(null); setSavePresetModalOpen(true); }} disabled={!resultsTable}>
                    Save as preset
                  </Button>
                </div>
              </details>
            </div>
          )}
        </div>
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

      {loadPhase1ModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setLoadPhase1ModalOpen(false)}>
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-base mb-2">Load Case Crawler config</h3>
              <p className="text-sm admin-text-muted mb-2">Load a saved config for the selected county (flow + result table + codegen). Shows only configs for the county chosen above.</p>
              {!countyId ? (
                <p className="text-sm text-[var(--accent-gold)]">Select a county above first.</p>
              ) : (
                <input type="text" value={phase1Search} onChange={(e) => setPhase1Search(e.target.value)} placeholder="Search by name…" className="admin-input w-full mt-2" />
              )}
            </div>
            <div className="overflow-auto flex-1 p-2">
              {!countyId ? (
                <p className="text-sm admin-text-muted">Select a county in the top bar to see its saved configs.</p>
              ) : phase1ListLoading ? (
                <p className="text-sm admin-text-muted">Loading…</p>
              ) : countyCaseCrawlerConfigs.filter((f) => !phase1Search.trim() || (f.name ?? '').toLowerCase().includes(phase1Search.trim().toLowerCase())).length === 0 ? (
                <p className="text-sm admin-text-muted">No saved Case Crawler configs for this county</p>
              ) : (
                <ul className="list-none p-0 m-0 space-y-1">
                  {countyCaseCrawlerConfigs
                    .filter((f) => !phase1Search.trim() || (f.name ?? '').toLowerCase().includes(phase1Search.trim().toLowerCase()))
                    .map((f) => {
                      const raw = f.flow_json as Phase1Blob | null;
                      return (
                        <li key={f.id} className="flex items-center gap-2">
                          <button
                            type="button"
                            className="flex-1 text-left px-3 py-2 rounded-lg text-sm hover:bg-[var(--bg-elevated)]"
                            onClick={() => {
                              if (raw && typeof raw === 'object') {
                                const siteId = raw.siteConfig?.siteId ?? countyId;
                                if (siteId) setCountyId(siteId);
                                if (raw.siteConfig?.resultTable) {
                                  const rt = raw.siteConfig.resultTable;
                                  setResultsTable({
                                    ...defaultResultTableConfig,
                                    ...rt,
                                    primaryId:
                                      rt.primaryId && typeof rt.primaryId === 'object'
                                        ? { ...defaultResultTableConfig.primaryId, ...rt.primaryId }
                                        : defaultResultTableConfig.primaryId,
                                  });
                                }
                                setLoadedPhase1Preset(raw);
                                setLoadedPhase1Id(f.id);
                                setLoadedPhase1Name(f.name ?? null);
                                setPhase1FlowName(raw.flow?.name ?? 'codegen-superset');
                                setPhase1Steps(Array.isArray(raw.flow?.steps) ? (raw.flow.steps as Phase1Step[]) : []);
                                // Populate Step Converter with this county's codegen source
                                supabase
                                  .from('scraper_configs')
                                  .select('codegen_source')
                                  .eq('county_id', siteId)
                                  .eq('config_type', 'superset')
                                  .maybeSingle()
                                  .then(({ data }) => {
                                    setCode((data as { codegen_source?: string } | null)?.codegen_source ?? '');
                                  });
                              }
                              setLoadPhase1ModalOpen(false);
                              setPhase1Search('');
                            }}
                          >
                            <span className="font-medium">{f.name}</span>
                            {f.description && <span className="block text-xs admin-text-muted">{f.description}</span>}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
            <div className="p-2 border-t border-[var(--border)]">
              <Button size="sm" variant="ghost" onClick={() => setLoadPhase1ModalOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {savePhase1ModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setSavePhase1ModalOpen(false); setSavePhase1Error(null); }}>
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] max-w-md w-full p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-base mb-2">Save Case Crawler config</h3>
            <p className="text-sm admin-text-muted mb-3">
              Keep up to two versions per county: a Golden copy and an Experimental copy. Saving will overwrite the chosen slot for this county.
            </p>
            {savePhase1Error && <p className="text-sm text-[var(--accent-gold)] mb-2">{savePhase1Error}</p>}
            <div className="space-y-3 mb-3">
              <div className="border border-[var(--border)] rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">Golden slot</div>
                    <div className="text-xs admin-text-muted">
                      {goldenConfig ? (goldenConfig.name ?? 'Existing Golden config') : 'Empty slot'}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSavePhase1('golden')}
                    disabled={savePhase1Loading}
                  >
                    {savePhase1Loading ? 'Saving…' : goldenConfig ? 'Overwrite Golden' : 'Save as Golden'}
                  </Button>
                </div>
              </div>
              <div className="border border-[var(--border)] rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">Experimental slot</div>
                    <div className="text-xs admin-text-muted">
                      {experimentalConfig ? (experimentalConfig.name ?? 'Existing Experimental config') : 'Empty slot'}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSavePhase1('experimental')}
                    disabled={savePhase1Loading}
                  >
                    {savePhase1Loading ? 'Saving…' : experimentalConfig ? 'Overwrite Experimental' : 'Save as Experimental'}
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSavePhase1ModalOpen(false);
                  setSavePhase1Error(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type Phase1FlowEditorProps = {
  flowName: string;
  steps: Phase1Step[];
  onFlowNameChange: (name: string) => void;
  onStepsChange: (steps: Phase1Step[]) => void;
};

const phase1LabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.875rem',
  fontWeight: 500,
  marginBottom: 'var(--space-xs)',
  color: 'var(--text-secondary)',
};

const phase1InputStyle: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-sm) var(--space-md)',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  fontSize: '0.875rem',
};

const phase1BtnSecondary: React.CSSProperties = {
  padding: 'var(--space-xs) var(--space-sm)',
  minHeight: 36,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: '0.75rem',
};

function createBlankPhase1Step(type: string): Phase1Step {
  const base: Phase1Step = { type, label: '', config: {} };
  switch (type) {
    case 'navigate':
      return { ...base, config: { url: '', waitUntil: 'networkidle' } };
    case 'switch_frame':
      return { ...base, config: { selector: 'iframe#content' } };
    case 'switch_frame_main':
      return { ...base, config: {} };
    case 'wait':
      return { ...base, config: { selector: '', timeout: 10000 } };
    case 'fill_field':
      return { ...base, config: { selector: '', value: '', clearFirst: true } };
    case 'date_range':
      return {
        ...base,
        config: { fromSelector: '', toSelector: '', fromValue: '', toValue: '' },
      };
    case 'checkbox':
      return { ...base, config: { selector: '', state: 'checked' } };
    case 'click':
      return { ...base, config: { selector: '', waitAfter: 1000 } };
    case 'delay':
      return { ...base, config: { ms: 1000 } };
    default:
      return base;
  }
}

function Phase1FlowEditor({ flowName, steps, onFlowNameChange, onStepsChange }: Phase1FlowEditorProps) {
  const [expandedSet, setExpandedSet] = useState<Set<number>>(() => new Set([0]));
  const [insertAt, setInsertAt] = useState<number | null>(null);

  const updateStep = (index: number, step: Phase1Step) => {
    const next = [...steps];
    next[index] = step;
    onStepsChange(next);
  };

  const changeStepType = (index: number, newType: string) => {
    const blank = createBlankPhase1Step(newType);
    const prev = steps[index] as { config?: Record<string, unknown>; label?: string; type: string };
    if (prev?.config && typeof prev.config === 'object') {
      blank.config = { ...prev.config, ...(blank.config ?? {}) };
    }
    blank.label = prev.label ?? '';
    updateStep(index, blank);
  };

  const insertStep = (at: number, type: string) => {
    const next = [...steps];
    next.splice(at, 0, createBlankPhase1Step(type));
    onStepsChange(next);
    setExpandedSet((s) => new Set(Array.from(s)).add(at));
    setInsertAt(null);
  };

  const removeStep = (index: number) => {
    const next = steps.filter((_, i) => i !== index);
    onStepsChange(next);
    setExpandedSet((s) => new Set(Array.from(s).filter((i) => i !== index).map((i) => (i >= index ? i - 1 : i))));
  };

  const moveStep = (index: number, dir: 'up' | 'down') => {
    const next = [...steps];
    const j = dir === 'up' ? index - 1 : index + 1;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    onStepsChange(next);
    setExpandedSet((s) => {
      const out = new Set(Array.from(s));
      out.delete(index);
      out.delete(j);
      out.add(j);
      return out;
    });
  };

  const duplicateStep = (index: number) => {
    const next = [...steps];
    next.splice(index + 1, 0, { ...steps[index] });
    onStepsChange(next);
    setExpandedSet((s) => new Set(Array.from(s)).add(index + 1));
  };

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <label style={phase1LabelStyle}>Flow name</label>
        <input
          value={flowName}
          onChange={(e) => onFlowNameChange(e.target.value)}
          placeholder="codegen-superset"
          style={{ ...phase1InputStyle, maxWidth: 320 }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-md)',
          alignItems: 'center',
        }}
      >
        <button type="button" onClick={() => setExpandedSet(new Set(steps.map((_, i) => i)))} style={phase1BtnSecondary}>
          Expand all
        </button>
        <button type="button" onClick={() => setExpandedSet(new Set())} style={phase1BtnSecondary}>
          Collapse all
        </button>
        <select
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v) {
              insertStep(steps.length, v);
              e.target.value = '';
            }
          }}
          style={{ ...phase1InputStyle, maxWidth: 260 }}
        >
          <option value="">+ Add step at end</option>
          {PHASE1_STEP_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      {steps.map((step, index) => (
        <div key={index}>
          {insertAt === index && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
                marginBottom: 'var(--space-sm)',
                padding: 'var(--space-sm)',
                background: 'var(--bg-elevated)',
                borderRadius: 8,
                border: '1px dashed var(--border)',
              }}
            >
              <span style={{ fontSize: '0.8125rem' }}>Insert:</span>
              <select
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) insertStep(index, v);
                }}
                style={{ ...phase1InputStyle, maxWidth: 240 }}
              >
                <option value="">Choose type…</option>
                {PHASE1_STEP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setInsertAt(null)} style={phase1BtnSecondary}>
                Cancel
              </button>
            </div>
          )}
          <Phase1StepCard
            step={step}
            index={index}
            total={steps.length}
            expanded={expandedSet.has(index)}
            onToggle={() =>
              setExpandedSet((s) => {
                const n = new Set(Array.from(s));
                if (n.has(index)) n.delete(index);
                else n.add(index);
                return n;
              })
            }
            onChange={(s) => updateStep(index, s)}
            onTypeChange={(newType) => changeStepType(index, newType)}
            onRemove={() => removeStep(index)}
            onInsertAbove={() => setInsertAt(index)}
            onInsertBelow={() => setInsertAt(index + 1)}
            onMoveUp={() => moveStep(index, 'up')}
            onMoveDown={() => moveStep(index, 'down')}
            onDuplicate={() => duplicateStep(index)}
          />
        </div>
      ))}
    </div>
  );
}

type Phase1StepCardProps = {
  step: Phase1Step;
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (s: Phase1Step) => void;
  onTypeChange: (newType: string) => void;
  onRemove: () => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
};

function Phase1StepCard({
  step,
  index,
  total,
  expanded,
  onToggle,
  onChange,
  onTypeChange,
  onRemove,
  onInsertAbove,
  onInsertBelow,
  onMoveUp,
  onMoveDown,
  onDuplicate,
}: Phase1StepCardProps) {
  const cfg = (step as { config?: Record<string, unknown> }).config ?? {};
  const update = (key: string, value: unknown) => {
    onChange({ ...step, config: { ...cfg, [key]: value } } as Phase1Step);
  };
  const typeLabel = PHASE1_STEP_TYPES.find((t) => t.value === step.type)?.label ?? step.type;
  const stepLabel = (step as { label?: string }).label ?? '';

  return (
    <div
      style={{
        borderRadius: 12,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        marginBottom: 'var(--space-md)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          padding: 'var(--space-md)',
          cursor: 'pointer',
        }}
        onClick={onToggle}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flex: 1, minWidth: 0 }}>
          <span style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
            {index + 1}. {typeLabel}
          </span>
          {stepLabel && (
            <span
              style={{
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              — {stepLabel}
            </span>
          )}
        </div>
        <div
          style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap', alignItems: 'center' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={onInsertAbove} style={{ ...phase1BtnSecondary, borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }}>
            + above
          </button>
          <button type="button" onClick={onInsertBelow} style={{ ...phase1BtnSecondary, borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }}>
            + below
          </button>
          <button type="button" onClick={onDuplicate} style={phase1BtnSecondary}>
            Duplicate
          </button>
          <button type="button" onClick={onMoveUp} disabled={index === 0} style={phase1BtnSecondary}>
            ↑
          </button>
          <button type="button" onClick={onMoveDown} disabled={index >= total - 1} style={phase1BtnSecondary}>
            ↓
          </button>
          <button type="button" onClick={onRemove} style={{ ...phase1BtnSecondary, color: 'var(--accent-gold)' }}>
            Remove
          </button>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '0 var(--space-md) var(--space-md)', borderTop: '1px solid var(--border)' }}>
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label style={phase1LabelStyle}>Step label (optional)</label>
            <input
              value={stepLabel}
              onChange={(e) => onChange({ ...step, label: e.target.value } as Phase1Step)}
              placeholder="e.g. Go to search page"
              style={{ ...phase1InputStyle, maxWidth: 320 }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label style={phase1LabelStyle}>Step type</label>
            <select
              value={step.type}
              onChange={(e) => onTypeChange(e.target.value)}
              style={{ ...phase1InputStyle, maxWidth: 280 }}
            >
              {PHASE1_STEP_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {step.type === 'navigate' && (
            <>
              <div>
                <label style={phase1LabelStyle}>URL</label>
                <input
                  value={String((cfg as any).url ?? '')}
                  onChange={(e) => update('url', e.target.value)}
                  placeholder="https://..."
                  style={phase1InputStyle}
                />
              </div>
              <div>
                <label style={phase1LabelStyle}>Wait for page</label>
                <select
                  value={String((cfg as any).waitUntil ?? 'networkidle')}
                  onChange={(e) => update('waitUntil', e.target.value)}
                  style={phase1InputStyle}
                >
                  <option value="domcontentloaded">DOM ready</option>
                  <option value="load">Load</option>
                  <option value="networkidle">Network idle</option>
                </select>
              </div>
            </>
          )}
          {step.type === 'switch_frame' && (
            <>
              <div>
                <label style={phase1LabelStyle}>iframe CSS selector</label>
                <input
                  value={String((cfg as any).selector ?? '')}
                  onChange={(e) => update('selector', e.target.value)}
                  placeholder="iframe#content"
                  style={phase1InputStyle}
                />
              </div>
              <div>
                <label style={phase1LabelStyle}>Or frame name</label>
                <input
                  value={String((cfg as any).name ?? '')}
                  onChange={(e) => update('name', e.target.value)}
                  style={phase1InputStyle}
                />
              </div>
              <div>
                <label style={phase1LabelStyle}>Or frame URL (partial)</label>
                <input
                  value={String((cfg as any).url ?? '')}
                  onChange={(e) => update('url', e.target.value)}
                  style={phase1InputStyle}
                />
              </div>
            </>
          )}
          {step.type === 'switch_frame_main' && (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Switches back to the top-level document.</p>
          )}
          {step.type === 'wait' && (
            <>
              <div>
                <label style={phase1LabelStyle}>CSS selector</label>
                <input
                  value={String((cfg as any).selector ?? '')}
                  onChange={(e) => update('selector', e.target.value)}
                  placeholder="table tbody tr"
                  style={phase1InputStyle}
                />
              </div>
              <div>
                <label style={phase1LabelStyle}>Wait until</label>
                <select
                  value={String((cfg as any).waitUntil ?? 'visible')}
                  onChange={(e) => update('waitUntil', e.target.value)}
                  style={phase1InputStyle}
                >
                  <option value="visible">Visible</option>
                  <option value="hidden">Hidden</option>
                  <option value="attached">Attached</option>
                </select>
              </div>
              <div>
                <label style={phase1LabelStyle}>Timeout (ms)</label>
                <input
                  type="number"
                  value={Number((cfg as any).timeout ?? 10000)}
                  onChange={(e) => update('timeout', parseInt(e.target.value, 10) || 10000)}
                  style={phase1InputStyle}
                />
              </div>
            </>
          )}
          {step.type === 'fill_field' && (
            <>
              <div>
                <label style={phase1LabelStyle}>CSS selector</label>
                <input
                  value={String((cfg as any).selector ?? '')}
                  onChange={(e) => update('selector', e.target.value)}
                  placeholder="#search, input[name='q']"
                  style={phase1InputStyle}
                />
              </div>
              <div>
                <label style={phase1LabelStyle}>Value (use {"{{var}}"})</label>
                <input
                  value={String((cfg as any).value ?? '')}
                  onChange={(e) => update('value', e.target.value)}
                  placeholder="{{search_term}}"
                  style={phase1InputStyle}
                />
              </div>
            </>
          )}
          {step.type === 'date_range' && (
            <>
              <div>
                <label style={phase1LabelStyle}>From selector</label>
                <input
                  value={String((cfg as any).fromSelector ?? '')}
                  onChange={(e) => update('fromSelector', e.target.value)}
                  placeholder="#date-from"
                  style={phase1InputStyle}
                />
              </div>
              <div>
                <label style={phase1LabelStyle}>To selector</label>
                <input
                  value={String((cfg as any).toSelector ?? '')}
                  onChange={(e) => update('toSelector', e.target.value)}
                  placeholder="#date-to"
                  style={phase1InputStyle}
                />
              </div>
              <div>
                <label style={phase1LabelStyle}>From value</label>
                <input
                  value={String((cfg as any).fromValue ?? '')}
                  onChange={(e) => update('fromValue', e.target.value)}
                  placeholder="{{date_from}}"
                  style={phase1InputStyle}
                />
              </div>
              <div>
                <label style={phase1LabelStyle}>To value</label>
                <input
                  value={String((cfg as any).toValue ?? '')}
                  onChange={(e) => update('toValue', e.target.value)}
                  placeholder="{{date_to}}"
                  style={phase1InputStyle}
                />
              </div>
            </>
          )}
          {step.type === 'checkbox' && (
            <>
              <div>
                <label style={phase1LabelStyle}>Selector</label>
                <input
                  value={String((cfg as any).selector ?? '')}
                  onChange={(e) => update('selector', e.target.value)}
                  style={phase1InputStyle}
                />
              </div>
              <div>
                <label style={phase1LabelStyle}>State</label>
                <select
                  value={String((cfg as any).state ?? 'checked')}
                  onChange={(e) => update('state', e.target.value)}
                  style={phase1InputStyle}
                >
                  <option value="checked">Checked</option>
                  <option value="unchecked">Unchecked</option>
                </select>
              </div>
            </>
          )}
          {step.type === 'click' && (
            <div>
              <label style={phase1LabelStyle}>Selector</label>
              <input
                value={String((cfg as any).selector ?? '')}
                onChange={(e) => update('selector', e.target.value)}
                style={phase1InputStyle}
              />
            </div>
          )}
          {step.type === 'delay' && (
            <div>
              <label style={phase1LabelStyle}>Delay (ms)</label>
              <input
                type="number"
                value={Number((cfg as any).ms ?? 1000)}
                onChange={(e) => update('ms', parseInt(e.target.value, 10) || 1000)}
                style={phase1InputStyle}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
