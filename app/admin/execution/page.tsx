'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/admin/PageComponents';
import {
  TitleBlock,
  Hint,
  SectionBlock,
  Card,
} from '@/components/admin/AdminComponents';

type County = {
  id: string;
  name: string;
  state: string;
  court_type: string | null;
  base_url: string;
  status: string;
  superset_recording_at?: string | null;
  extraction_recording_at?: string | null;
};

type Config = {
  id: string;
  county_id: string;
  config_type?: string | null;
  is_validated: boolean;
};

type Superset = {
  id: string;
  county_id: string;
  name: string | null;
  total_cases: number;
  status: string;
};

type QueueItem = {
  id: string;
  county_id: string | null;
  status: string;
  task_type: string;
};

type StateRollup = {
  state: string;
  countyCount: number;
  withSupersetOutput: number;
  withExtractionOutput: number;
  counties: County[];
  configsByCounty: Record<string, Config[]>;
  supersetsByCounty: Record<string, Superset[]>;
  caseCountByCounty: Record<string, number>;
  docCountByCounty: Record<string, number>;
  queueByCounty: Record<string, { queued: number; processing: number; failed: number }>;
};

const RELEVANT_CASES_LABELS = [
  '1. Codegen Superset Recorder',
  '2. Recording → Superset Converter',
  '3. Converted Superset JSON Executor',
  '4. Superset Output Case List File(s)',
];

const TRAINING_DATA_LABELS = [
  '1. Codegen Extraction Recorder',
  '2. Recording → Extraction Converter',
  '3. Converted Extraction JSON Executor',
  '4. Extraction Data Output (Scorecard + RAG PDFs)',
];

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 py-1" style={{ gap: 'var(--space-xs)' }}>
      <span
        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
        style={{
          background: done ? 'var(--accent-primary)' : 'var(--bg-elevated)',
          color: done ? '#fff' : 'var(--text-muted)',
        }}
      >
        {done ? '✓' : '—'}
      </span>
      <span style={{ color: done ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}

function CountyExecutionCard({
  county,
  configs,
  supersets,
  caseCount,
  docCount,
  queueStats,
  onRefresh,
}: {
  county: County;
  configs: Config[];
  supersets: Superset[];
  caseCount: number;
  docCount: number;
  queueStats: { queued: number; processing: number; failed: number };
  onRefresh: () => void;
}) {
  const supersetConfig = configs.find((c) => (c as Config & { config_type?: string }).config_type === 'superset') ?? configs[0];
  const extractionConfig = configs.find((c) => (c as Config & { config_type?: string }).config_type === 'extraction') ?? configs[0];
  const hasSupersetConfig = !!supersetConfig || configs.length > 0;
  const hasExtractionConfig = !!extractionConfig || configs.length > 0;

  const relevantCasesDone = [
    !!county.superset_recording_at,
    hasSupersetConfig,
    hasSupersetConfig && supersetConfig?.is_validated,
    supersets.length > 0,
  ];

  const trainingDataDone = [
    !!county.extraction_recording_at,
    hasExtractionConfig,
    hasExtractionConfig && extractionConfig?.is_validated,
    caseCount > 0 || docCount > 0,
  ];

  const [createSupersetOpen, setCreateSupersetOpen] = useState(false);
  const [extractSupersetId, setExtractSupersetId] = useState<string | null>(null);

  const markRecorder = async (type: 'superset' | 'extraction') => {
    const col = type === 'superset' ? 'superset_recording_at' : 'extraction_recording_at';
    await supabase.from('scraper_counties').update({ [col]: new Date().toISOString() }).eq('id', county.id);
    onRefresh();
  };

  return (
    <Card className="mb-4">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="admin-heading-2 mb-1">{county.name}, {county.state}</h3>
            <p className="admin-text-muted text-sm">{county.court_type || 'Court'} · {county.base_url}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="success"
              onClick={() => setCreateSupersetOpen(true)}
            >
              Create superset
            </Button>
            {supersets.length > 0 && (
              <select
                className="admin-input text-sm min-h-[36px] max-w-[200px]"
                value={extractSupersetId ?? ''}
                onChange={(e) => setExtractSupersetId(e.target.value || null)}
              >
                <option value="">Extract from…</option>
                {supersets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.id.slice(0, 8)} ({s.total_cases} cases)
                  </option>
                ))}
              </select>
            )}
            {extractSupersetId && (
              <Button
                size="sm"
                variant="primary"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/pipeline/process-queue', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ superset_id: extractSupersetId, limit: 50 }),
                    });
                    if (res.ok) onRefresh();
                  } catch (_) {}
                }}
              >
                Run extraction
              </Button>
            )}
          </div>
        </div>

        {/* Queue status */}
        <div className="flex flex-wrap gap-4 mb-4 p-3 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
          <span className="text-sm">
            <strong>Queue:</strong> <span style={{ color: 'var(--accent-gold)' }}>{queueStats.queued} queued</span>
            {' · '}
            <span style={{ color: 'var(--accent-cyan)' }}>{queueStats.processing} running</span>
            {queueStats.failed > 0 && (
              <> · <span style={{ color: 'var(--accent-red)' }}>{queueStats.failed} failed</span></>
            )}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="admin-heading-3 mb-2">Relevant Cases</h4>
            {RELEVANT_CASES_LABELS.map((label, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <CheckItem done={relevantCasesDone[i]} label={label} />
                {i === 0 && (
                  <Button size="sm" variant="ghost" onClick={() => markRecorder('superset')} className="flex-shrink-0">
                    {county.superset_recording_at ? '✓ Marked' : 'Mark recorder'}
                  </Button>
                )}
              </div>
            ))}
            {supersets.length > 0 && (
              <p className="text-sm mt-2 admin-text-muted">
                {supersets.length} superset file(s): {supersets.map((s) => s.name || s.id.slice(0, 8)).join(', ')}
              </p>
            )}
          </div>
          <div>
            <h4 className="admin-heading-3 mb-2">Training Data</h4>
            {TRAINING_DATA_LABELS.map((label, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <CheckItem done={trainingDataDone[i]} label={label} />
                {i === 0 && (
                  <Button size="sm" variant="ghost" onClick={() => markRecorder('extraction')} className="flex-shrink-0">
                    {county.extraction_recording_at ? '✓ Marked' : 'Mark recorder'}
                  </Button>
                )}
              </div>
            ))}
            {(caseCount > 0 || docCount > 0) && (
              <p className="text-sm mt-2 admin-text-muted">
                {caseCount} cases · {docCount} documents
              </p>
            )}
          </div>
        </div>

        {createSupersetOpen && (
          <CreateSupersetModal
            countyId={county.id}
            countyName={`${county.name}, ${county.state}`}
            onClose={() => setCreateSupersetOpen(false)}
            onSuccess={() => { setCreateSupersetOpen(false); onRefresh(); }}
          />
        )}
      </div>
    </Card>
  );
}

function CreateSupersetModal({
  countyId,
  countyName,
  onClose,
  onSuccess,
}: {
  countyId: string;
  countyName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [partyName, setPartyName] = useState('%');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/pipeline/generate-superset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          county_id: countyId,
          name: name || `Superset ${new Date().toISOString().slice(0, 10)}`,
          search_params: { date_from: dateFrom, date_to: dateTo, party_name: partyName },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create superset');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-superset-title"
    >
      <div className="admin-card max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h2 id="create-superset-title" className="admin-heading-2 mb-4">Create superset · {countyName}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Superset name (e.g. Cobb A–J)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="admin-input w-full"
          />
          <div className="grid grid-cols-2 gap-4">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="admin-input w-full" required />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="admin-input w-full" required />
          </div>
          <input
            type="text"
            placeholder="Party name (use % for all)"
            value={partyName}
            onChange={(e) => setPartyName(e.target.value)}
            className="admin-input w-full"
          />
          {error && <p className="text-sm" style={{ color: 'var(--accent-red)' }}>{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create superset'}</Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ExecutionPage() {
  const [counties, setCounties] = useState<County[]>([]);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [supersets, setSupersets] = useState<Superset[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [caseCountByCounty, setCaseCountByCounty] = useState<Record<string, number>>({});
  const [docCountByCounty, setDocCountByCounty] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const [
      countiesRes,
      configsRes,
      supersetsRes,
      queueRes,
      casesRes,
      docsRes,
    ] = await Promise.all([
      supabase.from('scraper_counties').select('*').order('state').order('name'),
      supabase.from('scraper_configs').select('id, county_id, config_type, is_validated'),
      supabase.from('scraper_supersets').select('id, county_id, name, total_cases, status').order('created_at', { ascending: false }),
      supabase.from('scraper_queue').select('id, county_id, status, task_type').limit(500),
      supabase.from('scraped_cases').select('county_id').then((r) => {
        const map: Record<string, number> = {};
        (r.data ?? []).forEach((row: { county_id: string | null }) => {
          if (row.county_id) map[row.county_id] = (map[row.county_id] ?? 0) + 1;
        });
        return { data: map };
      }),
      (async () => {
        const [docsRes, casesRes] = await Promise.all([
          supabase.from('scraped_documents').select('case_id'),
          supabase.from('scraped_cases').select('id, county_id'),
        ]);
        const countyByCase: Record<string, string> = {};
        (casesRes.data ?? []).forEach((row: { id: string; county_id: string | null }) => {
          if (row.county_id) countyByCase[row.id] = row.county_id;
        });
        const map: Record<string, number> = {};
        (docsRes.data ?? []).forEach((row: { case_id: string }) => {
          const cid = countyByCase[row.case_id];
          if (cid) map[cid] = (map[cid] ?? 0) + 1;
        });
        return { data: map };
      })(),
    ]);

    setCounties((countiesRes.data as County[]) ?? []);
    setConfigs((configsRes.data as Config[]) ?? []);
    setSupersets((supersetsRes.data as Superset[]) ?? []);
    setQueue((queueRes.data as QueueItem[]) ?? []);
    setCaseCountByCounty((casesRes.data as Record<string, number>) ?? {});
    setDocCountByCounty((docsRes.data as Record<string, number>) ?? {});
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    load();
    const POLL_IDLE_MS = 60_000;
    const t = setInterval(() => load(true), POLL_IDLE_MS);
    return () => clearInterval(t);
  }, []);

  const queueByCounty = useMemo(() => {
    const q: Record<string, { queued: number; processing: number; failed: number }> = {};
    queue.forEach((item) => {
      const cid = item.county_id ?? '_global';
      if (!q[cid]) q[cid] = { queued: 0, processing: 0, failed: 0 };
      if (item.status === 'queued') q[cid].queued++;
      else if (item.status === 'processing') q[cid].processing++;
      else if (item.status === 'failed') q[cid].failed++;
    });
    return q;
  }, [queue]);

  const stateRollups = useMemo((): StateRollup[] => {
    const byState = new Map<string, County[]>();
    counties.forEach((c) => {
      if (!byState.has(c.state)) byState.set(c.state, []);
      byState.get(c.state)!.push(c);
    });

    const configsByCounty: Record<string, Config[]> = {};
    configs.forEach((c) => {
      if (!configsByCounty[c.county_id]) configsByCounty[c.county_id] = [];
      configsByCounty[c.county_id].push(c);
    });

    const supersetsByCounty: Record<string, Superset[]> = {};
    supersets.forEach((s) => {
      if (!supersetsByCounty[s.county_id]) supersetsByCounty[s.county_id] = [];
      supersetsByCounty[s.county_id].push(s);
    });

    const searchLower = search.trim().toLowerCase();
    const filtered: StateRollup[] = [];
    byState.forEach((stateCounties, state) => {
      let list = stateCounties;
      if (searchLower) {
        list = list.filter(
          (c) =>
            state.toLowerCase().includes(searchLower) ||
            c.name.toLowerCase().includes(searchLower)
        );
      }
      if (list.length === 0) return;
      const withSuperset = list.filter((c) => (supersetsByCounty[c.id]?.length ?? 0) > 0).length;
      const withExtraction = list.filter((c) => (caseCountByCounty[c.id] ?? 0) > 0 || (docCountByCounty[c.id] ?? 0) > 0).length;
      filtered.push({
        state,
        countyCount: list.length,
        withSupersetOutput: withSuperset,
        withExtractionOutput: withExtraction,
        counties: list,
        configsByCounty,
        supersetsByCounty,
        caseCountByCounty,
        docCountByCounty,
        queueByCounty,
      });
    });
    filtered.sort((a, b) => a.state.localeCompare(b.state));
    return filtered;
  }, [counties, configs, supersets, caseCountByCounty, docCountByCounty, queueByCounty, search]);

  return (
    <div className="w-full min-w-0">
      <TitleBlock
        icon="▶️"
        title="Pipeline Execution"
        description="Track recorder, converter, executor, and output status by state and county. Create supersets and run extraction."
        badge="Execution"
      />
      <Hint className="mt-4">
        State-first view: expand a state to see counties. Green checkmarks show what exists. Use &quot;Create superset&quot; or &quot;Run extraction&quot; to execute pipeline steps.
      </Hint>

      <SectionBlock title="Search" description="Filter by state or county name.">
        <input
          type="search"
          placeholder="State or county name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="admin-input w-full max-w-md"
          aria-label="Search states and counties"
        />
      </SectionBlock>

      <SectionBlock title="By state" description="Rollup and queue status. Click a state to expand counties.">
        {loading ? (
          <p className="admin-text-muted">Loading…</p>
        ) : stateRollups.length === 0 ? (
          <p className="admin-text-muted">No counties yet. Add counties in County Data Pipeline.</p>
        ) : (
          <div className="space-y-2">
            {stateRollups.map((rollup) => {
              const expanded = expandedStates.has(rollup.state);
              return (
                <Card key={rollup.state} noPadding className="overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-[var(--bg-elevated)] transition-colors"
                    onClick={() => {
                      setExpandedStates((prev) => {
                        const next = new Set(prev);
                        if (next.has(rollup.state)) next.delete(rollup.state);
                        else next.add(rollup.state);
                        return next;
                      });
                    }}
                    aria-expanded={expanded}
                  >
                    <span className="font-semibold">{rollup.state}</span>
                    <span className="execution-rollup-stats" role="status">
                      <span className="execution-rollup-stat">
                        <span className="execution-rollup-stat__value">{rollup.countyCount}</span>
                        <span className="execution-rollup-stat__label">counties</span>
                      </span>
                      <span className="execution-rollup-stat">
                        <span className="execution-rollup-stat__value">{rollup.withSupersetOutput}</span>
                        <span className="execution-rollup-stat__label">superset</span>
                      </span>
                      <span className="execution-rollup-stat">
                        <span className="execution-rollup-stat__value">{rollup.withExtractionOutput}</span>
                        <span className="execution-rollup-stat__label">extraction</span>
                      </span>
                    </span>
                    <span className="text-lg flex-shrink-0" aria-hidden>{expanded ? '▼' : '▶'}</span>
                  </button>
                  {expanded && (
                    <div className="border-t border-[var(--border)] p-4 pt-2">
                      {rollup.counties.map((county) => (
                        <CountyExecutionCard
                          key={county.id}
                          county={county}
                          configs={rollup.configsByCounty[county.id] ?? []}
                          supersets={rollup.supersetsByCounty[county.id] ?? []}
                          caseCount={rollup.caseCountByCounty[county.id] ?? 0}
                          docCount={rollup.docCountByCounty[county.id] ?? 0}
                          queueStats={rollup.queueByCounty[county.id] ?? { queued: 0, processing: 0, failed: 0 }}
                          onRefresh={load}
                        />
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </SectionBlock>
    </div>
  );
}
