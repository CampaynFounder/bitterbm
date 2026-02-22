'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/admin/PageComponents';
import {
  TitleBlock,
  Hint,
  SectionBlock,
  OverviewCard,
  Card,
  TabBar,
  EmptyState,
} from '@/components/admin/AdminComponents';

/**
 * County Data Pipeline
 * Workflow: Counties → Supersets → Queue → Review → Analytics
 */

// Type definitions
type County = {
  id: string;
  name: string;
  state: string;
  court_type: string;
  base_url: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type Superset = {
  id: string;
  county_id: string;
  name: string;
  search_params: any;
  case_ids: any;
  total_cases: number;
  status: string;
  progress: number;
  created_at: string;
  counties?: { name: string; state: string };
};

type QueueItem = {
  id: string;
  task_type: string;
  status: string;
  priority: number;
  queued_at: string;
  attempts: number;
  max_attempts: number;
};

type ReviewItem = {
  id: string;
  review_type: string;
  status: string;
  data_to_review: any;
  created_at: string;
  cases?: { case_number: string };
};

export default function DataPipelinePage() {
  const [activeTab, setActiveTab] = useState('counties');
  const [counties, setCounties] = useState<County[]>([]);
  const [supersets, setSupersets] = useState<Superset[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);

  useEffect(() => {
    loadData();
    
    // Refresh queue every 5 seconds
    const interval = setInterval(() => {
      loadQueue();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    const [countiesRes, supersetsRes, queueRes, reviewRes] = await Promise.all([
      supabase.from('scraper_counties').select('*').order('created_at', { ascending: false }),
      supabase.from('scraper_supersets').select('*, scraper_counties(name, state)').order('created_at', { ascending: false }),
      supabase.from('scraper_queue').select('*').order('queued_at', { ascending: false }).limit(100),
      supabase.from('scraper_review_queue').select('*, scraped_cases(case_number)').eq('status', 'pending')
    ]);

    setCounties(countiesRes.data || []);
    setSupersets(supersetsRes.data || []);
    setQueue(queueRes.data || []);
    setReviewItems(reviewRes.data || []);
  };

  const loadQueue = async () => {
    const { data } = await supabase
      .from('scraper_queue')
      .select('*')
      .order('queued_at', { ascending: false })
      .limit(100);
    
    setQueue(data || []);
  };

  const tabs = [
    { id: 'counties', label: 'Counties', badge: counties.length },
    { id: 'supersets', label: 'Supersets', badge: supersets.length },
    { id: 'queue', label: 'Queue', badge: queue.filter(q => q.status === 'queued').length },
    { id: 'review', label: 'Review', badge: reviewItems.length },
    { id: 'analytics', label: 'Analytics' },
  ];

  const queuedCount = queue.filter(q => q.status === 'queued').length;
  const processingSupersets = supersets.filter(s => s.status === 'processing').length;

  return (
    <div className="w-full min-w-0">
      <TitleBlock
        icon="🏛️"
        title="County Data Pipeline"
        description="Collect and process family court case data from county court portals."
        badge="New"
        primaryAction={
          <Button
            size="lg"
            onClick={() => setActiveTab('counties')}
            icon="+"
          >
            Add county
          </Button>
        }
      />

      <div className="mt-6">
        <Hint>
          Add a county and its court URL, then create a superset to define your search. The queue processes cases and flags items for review when needed.
        </Hint>
      </div>

      <SectionBlock
        title="Pipeline at a glance"
        description="Summary of your pipeline. Click a card to jump to that section."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <OverviewCard
            title="Counties"
            hint="Court sources configured"
            value={counties.length}
            icon="🏛️"
            variant="blue"
            onClick={() => setActiveTab('counties')}
          />
          <OverviewCard
            title="Active supersets"
            hint="Search definitions running"
            value={processingSupersets}
            icon="📦"
            variant="green"
            onClick={() => setActiveTab('supersets')}
          />
          <OverviewCard
            title="Queued"
            hint="Tasks waiting to run"
            value={queuedCount}
            icon="⏳"
            variant="amber"
            onClick={() => setActiveTab('queue')}
          />
          <OverviewCard
            title="Needs review"
            hint="Items for your decision"
            value={reviewItems.length}
            icon="👁️"
            variant="red"
            onClick={() => setActiveTab('review')}
          />
        </div>
      </SectionBlock>

      <SectionBlock
        title="Workflow"
        description="Configure counties, create supersets, and manage the processing queue. Use the tabs below to switch steps."
      >
        <Card noPadding className="mt-4">
          <TabBar
            label="Pipeline steps"
            tabs={tabs}
            activeId={activeTab}
            onChange={setActiveTab}
          />
          <div className="p-4 sm:p-6">
            {activeTab === 'counties' && <CountiesTab counties={counties} onUpdate={loadData} />}
            {activeTab === 'supersets' && <SupersetsTab supersets={supersets} counties={counties} onUpdate={loadData} />}
            {activeTab === 'queue' && <QueueTab queue={queue} />}
            {activeTab === 'review' && <ReviewTab items={reviewItems} onUpdate={loadData} />}
            {activeTab === 'analytics' && <AnalyticsTab />}
          </div>
        </Card>
      </SectionBlock>
    </div>
  );
}

// ========================================
// County Configuration Tab
// ========================================

function CountiesTab({ counties, onUpdate }: { counties: County[]; onUpdate: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    name: '',
    state: '',
    court_type: 'family',
    base_url: ''
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await supabase.from('scraper_counties').insert(formData);
    setShowForm(false);
    setFormData({ name: '', state: '', court_type: 'family', base_url: '' });
    onUpdate();
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === counties.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(counties.map((c) => c.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} county(ies)? This cannot be undone.`)) return;
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await supabase.from('scraper_counties').delete().eq('id', id);
    }
    setSelectedIds(new Set());
    onUpdate();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        <h2 className="admin-heading-1">Configured Counties</h2>
        <div className="flex flex-wrap items-center gap-2">
          {counties.length > 0 && (
            <>
              <label className="flex items-center gap-2 cursor-pointer admin-text-secondary text-sm">
                <input
                  type="checkbox"
                  checked={selectedIds.size === counties.length}
                  onChange={toggleSelectAll}
                  aria-label="Select all counties"
                />
                Select all
              </label>
              {selectedIds.size > 0 && (
                <Button variant="danger" size="sm" onClick={handleBulkDelete}>
                  Delete selected ({selectedIds.size})
                </Button>
              )}
            </>
          )}
          <Button
            onClick={() => setShowForm(!showForm)}
            variant="primary"
            size="lg"
            icon="+"
            className="w-full sm:w-auto min-h-[48px]"
          >
            Add County
          </Button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="admin-card mb-6" style={{ marginBottom: 'var(--space-lg)', borderWidth: '2px', borderColor: 'var(--accent-primary)' }}>
          <h3 className="admin-heading-2 mb-5" style={{ marginBottom: 'var(--space-md)' }}>New County Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ gap: 'var(--space-md)' }}>
            <input
              type="text"
              placeholder="County Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="admin-input"
              required
            />
            <input
              type="text"
              placeholder="State (e.g., GA)"
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              className="admin-input"
              required
            />
            <select
              value={formData.court_type}
              onChange={(e) => setFormData({ ...formData, court_type: e.target.value })}
              className="admin-input"
            >
              <option value="family">Family Court</option>
              <option value="superior">Superior Court</option>
              <option value="district">District Court</option>
            </select>
            <input
              type="url"
              placeholder="Base URL"
              value={formData.base_url}
              onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
              className="admin-input"
              required
            />
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-3" style={{ marginTop: 'var(--space-lg)', gap: 'var(--space-md)' }}>
            <Button type="submit" variant="primary" size="lg" className="w-full sm:w-auto min-h-[48px]">
              Save County
            </Button>
            <Button
              type="button"
              onClick={() => setShowForm(false)}
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto min-h-[48px]"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {counties.length === 0 ? (
          <EmptyState
            icon="🏛️"
            title="No counties yet"
            description="Add your first county (court system and base URL) to start collecting case data."
            action={
              <Button size="lg" onClick={() => setShowForm(true)} icon="+">
                Add your first county
              </Button>
            }
          />
        ) : (
          counties.map((county) => (
            <CountyCard
              key={county.id}
              county={county}
              onUpdate={onUpdate}
              selected={selectedIds.has(county.id)}
              onToggleSelect={() => toggleSelectOne(county.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CountyCard({
  county,
  onUpdate,
  selected,
  onToggleSelect,
}: {
  county: County;
  onUpdate: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const statusClass: Record<string, string> = {
    draft: 'admin-status-pill--draft',
    configured: 'admin-status-pill--ready',
    active: 'admin-status-pill--done',
    paused: 'admin-status-pill--failed'
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${county.name}, ${county.state}? This cannot be undone.`)) return;
    await supabase.from('scraper_counties').delete().eq('id', county.id);
    onUpdate();
  };

  return (
    <div className="admin-card border-2 rounded-xl transition-all duration-200" style={{ borderColor: selected ? 'var(--accent-primary)' : 'var(--border)' }}>
      <div className="flex items-center justify-between gap-3" style={{ gap: 'var(--space-md)' }}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <label className="flex-shrink-0 cursor-pointer" title="Select for bulk delete">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select ${county.name}`}
            />
          </label>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap" style={{ gap: 'var(--space-sm)' }}>
              <h3 className="admin-heading-3">{county.name}, {county.state}</h3>
              <span className={`admin-status-pill ${statusClass[county.status] || statusClass.draft}`}>
                {county.status.toUpperCase()}
              </span>
            </div>
            <p className="admin-text-secondary mt-1 truncate" style={{ marginTop: 'var(--space-xs)' }}>
              <span className="font-medium">{county.court_type}</span> • {county.base_url}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          <Button size="sm" variant="danger" onClick={handleDelete}>
            Delete
          </Button>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            aria-expanded={expanded}
          >
            <svg className={`w-6 h-6 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t" style={{ marginTop: 'var(--space-md)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--border)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" style={{ gap: 'var(--space-md)' }}>
            <button type="button" onClick={() => window.location.href = `/admin/codegen?county=${county.id}`} className="btn-primary flex items-center justify-center gap-2 min-h-[48px]">
              <span>📝</span> Configure Scraper
            </button>
            <button type="button" onClick={() => window.location.href = `/admin/visual-builder?county=${county.id}`} className="btn-secondary flex items-center justify-center gap-2 min-h-[48px]">
              <span>🎨</span> Visual Builder
            </button>
            <button type="button" style={{ background: 'var(--accent-cyan)', color: 'var(--bg-primary)', border: 'none', minHeight: 48, borderRadius: 8, padding: 'var(--space-sm) var(--space-md)', fontWeight: 600 }} className="flex items-center justify-center gap-2">
              <span>▶️</span> Test Scraper
            </button>
          </div>
        </div>
      )}

      {editOpen && (
        <EditCountyModal
          county={county}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); onUpdate(); }}
        />
      )}
    </div>
  );
}

function EditCountyModal({
  county,
  onClose,
  onSaved,
}: {
  county: County;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [formData, setFormData] = useState({
    name: county.name,
    state: county.state,
    court_type: county.court_type || 'family',
    base_url: county.base_url,
    status: county.status,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    await supabase
      .from('scraper_counties')
      .update({
        name: formData.name,
        state: formData.state,
        court_type: formData.court_type,
        base_url: formData.base_url,
        status: formData.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', county.id);
    setSaving(false);
    onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-county-title"
    >
      <div className="admin-card max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h2 id="edit-county-title" className="admin-heading-2 mb-4">Edit county</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="County Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="admin-input w-full"
            required
          />
          <input
            type="text"
            placeholder="State (e.g., GA)"
            value={formData.state}
            onChange={(e) => setFormData({ ...formData, state: e.target.value })}
            className="admin-input w-full"
            required
          />
          <select
            value={formData.court_type}
            onChange={(e) => setFormData({ ...formData, court_type: e.target.value })}
            className="admin-input w-full"
          >
            <option value="family">Family Court</option>
            <option value="superior">Superior Court</option>
            <option value="district">District Court</option>
          </select>
          <input
            type="url"
            placeholder="Base URL"
            value={formData.base_url}
            onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
            className="admin-input w-full"
            required
          />
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            className="admin-input w-full"
          >
            <option value="draft">Draft</option>
            <option value="configured">Configured</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ========================================
// Supersets Tab
// ========================================

function SupersetsTab({ supersets, counties, onUpdate }: { 
  supersets: Superset[]; 
  counties: County[]; 
  onUpdate: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    county_id: '',
    name: '',
    party_name: '%',
    date_from: '',
    date_to: '',
    case_types: []
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Call API to generate superset
    const response = await fetch('/api/pipeline/generate-superset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    if (response.ok) {
      setShowForm(false);
      onUpdate();
    }
  };

  const hasActiveCounties = counties.some(c => c.status === 'active');

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        <h2 className="admin-heading-1">Supersets</h2>
        <Button
          onClick={() => setShowForm(!showForm)}
          variant="success"
          size="lg"
          icon="+"
          className="w-full sm:w-auto min-h-[48px]"
        >
          Generate superset
        </Button>
      </div>
      {!hasActiveCounties && counties.length > 0 && (
        <Hint icon="⚠️" className="mb-4">
          No counties are active yet. Activate a county in the Counties tab before generating a superset.
        </Hint>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="admin-card mb-6" style={{ marginBottom: 'var(--space-lg)' }}>
          <h3 className="admin-heading-2 mb-4" style={{ marginBottom: 'var(--space-md)' }}>Generate New Superset</h3>
          <div className="space-y-4" style={{ gap: 'var(--space-md)' }}>
            <select
              value={formData.county_id}
              onChange={(e) => setFormData({ ...formData, county_id: e.target.value })}
              className="admin-input w-full min-h-[48px]"
              required
            >
              <option value="">Select County</option>
              {counties.filter(c => c.status === 'active').map(county => (
                <option key={county.id} value={county.id}>
                  {county.name}, {county.state}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Superset Name (e.g., Family Cases 2020-2024)"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="admin-input w-full min-h-[48px]"
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                type="date"
                value={formData.date_from}
                onChange={(e) => setFormData({ ...formData, date_from: e.target.value })}
                className="admin-input w-full min-h-[48px]"
                required
              />
              <input
                type="date"
                value={formData.date_to}
                onChange={(e) => setFormData({ ...formData, date_to: e.target.value })}
                className="admin-input w-full min-h-[48px]"
                required
              />
            </div>
            <input
              type="text"
              placeholder="Party Name (use % for wildcard)"
              value={formData.party_name}
              onChange={(e) => setFormData({ ...formData, party_name: e.target.value })}
              className="admin-input w-full min-h-[48px]"
            />
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Button type="submit" variant="success" size="lg" className="w-full sm:w-auto min-h-[48px]">
              🚀 Generate
            </Button>
            <Button type="button" onClick={() => setShowForm(false)} variant="secondary" size="lg" className="w-full sm:w-auto min-h-[48px]">
              Cancel
            </Button>
          </div>
        </form>
      )}

      {supersets.length === 0 ? (
        <EmptyState
          icon="📦"
          title="No supersets yet"
          description="Create a superset to define a search (county, date range, party). The pipeline will collect case IDs and process them."
          action={
            <Button size="lg" variant="success" onClick={() => setShowForm(true)} icon="+">
              Create first superset
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {supersets.map((superset) => (
            <SupersetCard key={superset.id} superset={superset} />
          ))}
        </div>
      )}
    </div>
  );
}

function SupersetCard({ superset }: { superset: Superset }) {
  const statusClass: Record<string, string> = {
    pending: 'admin-status-pill--draft',
    collecting: 'admin-status-pill--running',
    processing: 'admin-status-pill--running',
    complete: 'admin-status-pill--done',
    failed: 'admin-status-pill--failed'
  };

  return (
    <div className="admin-card rounded-lg">
      <div className="flex items-center justify-between mb-2" style={{ marginBottom: 'var(--space-sm)' }}>
        <h3 className="admin-heading-3">{superset.name}</h3>
        <span className={`admin-status-pill ${statusClass[superset.status] || statusClass.pending}`}>
          {superset.status}
        </span>
      </div>
      <div className="admin-text-secondary space-y-1">
        <p>📍 {superset.counties?.name}, {superset.counties?.state}</p>
        <p>📅 {superset.search_params?.date_from} → {superset.search_params?.date_to}</p>
        <p>📊 {superset.total_cases} cases</p>
        {superset.status === 'processing' && (
          <div style={{ marginTop: 'var(--space-md)' }}>
            <div className="w-full rounded-full h-2" style={{ background: 'var(--bg-elevated)' }}>
              <div className="h-2 rounded-full transition-all" style={{ width: `${superset.progress}%`, background: 'var(--accent-primary)' }} />
            </div>
            <p className="admin-text-muted mt-1" style={{ marginTop: 'var(--space-xs)' }}>{superset.progress}% complete</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================
// Processing Queue Tab
// ========================================

function QueueTab({ queue }: { queue: QueueItem[] }) {
  const stats = {
    queued: queue.filter(q => q.status === 'queued').length,
    processing: queue.filter(q => q.status === 'processing').length,
    complete: queue.filter(q => q.status === 'complete').length,
    failed: queue.filter(q => q.status === 'failed').length
  };

  return (
    <div>
      <h2 className="admin-heading-1 mb-4" style={{ marginBottom: 'var(--space-md)' }}>Processing Queue</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        <div className="admin-card border-2 rounded-xl" style={{ borderColor: 'var(--accent-gold)' }}>
          <p className="admin-text-muted text-sm font-semibold">Queued</p>
          <p className="admin-overview-value text-2xl">{stats.queued}</p>
        </div>
        <div className="admin-card border-2 rounded-xl" style={{ borderColor: 'var(--accent-primary)' }}>
          <p className="admin-text-muted text-sm font-semibold">Processing</p>
          <p className="admin-overview-value text-2xl">{stats.processing}</p>
        </div>
        <div className="admin-card border-2 rounded-xl" style={{ borderColor: 'var(--accent-cyan)' }}>
          <p className="admin-text-muted text-sm font-semibold">Complete</p>
          <p className="admin-overview-value text-2xl">{stats.complete}</p>
        </div>
        <div className="admin-card border-2 rounded-xl" style={{ borderColor: '#f87171' }}>
          <p className="admin-text-muted text-sm font-semibold">Failed</p>
          <p className="admin-overview-value text-2xl">{stats.failed}</p>
        </div>
      </div>
      <div className="admin-card rounded-xl overflow-hidden overflow-x-auto border-2" style={{ borderColor: 'var(--border)' }}>
        <table className="admin-table w-full min-w-[400px]">
          <thead>
            <tr>
              <th>Task</th>
              <th>Status</th>
              <th>Queued</th>
              <th>Attempts</th>
            </tr>
          </thead>
          <tbody>
            {queue.slice(0, 50).map((task) => (
              <tr key={task.id}>
                <td className="font-medium">{task.task_type}</td>
                <td>
                  <span className={`admin-status-pill ${
                    task.status === 'queued' ? 'admin-status-pill--draft' :
                    task.status === 'processing' ? 'admin-status-pill--running' :
                    task.status === 'complete' ? 'admin-status-pill--done' :
                    'admin-status-pill--failed'
                  }`}>
                    {task.status}
                  </span>
                </td>
                <td className="admin-text-secondary">{new Date(task.queued_at).toLocaleString()}</td>
                <td className="admin-text-secondary">{task.attempts} / {task.max_attempts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ========================================
// Review Queue Tab
// ========================================

function ReviewTab({ items, onUpdate }: { items: ReviewItem[]; onUpdate: () => void }) {
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);

  const handleApprove = async (item: ReviewItem) => {
    await supabase
      .from('scraper_review_queue')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', item.id);
    
    onUpdate();
  };

  const handleReject = async (item: ReviewItem) => {
    await supabase
      .from('scraper_review_queue')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', item.id);
    
    onUpdate();
  };

  return (
    <div>
      <h2 className="admin-heading-1 mb-4" style={{ marginBottom: 'var(--space-md)' }}>Review Queue ({items.length})</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ gap: 'var(--space-lg)' }}>
        <div className="space-y-3" style={{ gap: 'var(--space-md)' }}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedItem(item)}
              className="w-full text-left admin-card rounded-xl p-4 min-h-[56px] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] border-2"
              style={{ borderColor: selectedItem?.id === item.id ? 'var(--accent-primary)' : 'var(--border)' }}
            >
              <div className="flex items-center justify-between gap-2 mb-1" style={{ marginBottom: 'var(--space-xs)' }}>
                <span className="admin-card-title">{item.review_type}</span>
                <span className="admin-text-muted text-xs">{new Date(item.created_at).toLocaleDateString()}</span>
              </div>
              <p className="admin-text-secondary text-sm">Case: {item.cases?.case_number ?? '—'}</p>
            </button>
          ))}
        </div>
        {selectedItem && (
          <div className="admin-card rounded-2xl p-4 sm:p-6 lg:sticky lg:top-6 border-2" style={{ borderColor: 'var(--border)' }}>
            <h3 className="admin-heading-2 mb-4" style={{ marginBottom: 'var(--space-md)' }}>Review Details</h3>
            <div className="space-y-4" style={{ gap: 'var(--space-md)' }}>
              <div>
                <label className="admin-input-label">Type</label>
                <p className="admin-text-secondary text-sm">{selectedItem.review_type}</p>
              </div>
              <div>
                <label className="admin-input-label">Case</label>
                <p className="admin-text-secondary text-sm">{selectedItem.cases?.case_number ?? '—'}</p>
              </div>
              <div>
                <label className="admin-input-label">Data to Review</label>
                <pre className="mt-1 p-3 rounded-xl text-xs overflow-auto max-h-64 font-mono" style={{ marginTop: 'var(--space-xs)', padding: 'var(--space-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                  {JSON.stringify(selectedItem.data_to_review, null, 2)}
                </pre>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-4" style={{ gap: 'var(--space-md)', paddingTop: 'var(--space-md)' }}>
                <button type="button" onClick={() => handleApprove(selectedItem)} className="btn-primary flex-1 min-h-[48px]">
                  ✅ Approve
                </button>
                <button type="button" onClick={() => handleReject(selectedItem)} className="flex-1 min-h-[48px] font-semibold rounded-xl border-2" style={{ background: 'rgba(248,113,113,0.2)', color: '#fca5a5', borderColor: '#f87171' }}>
                  ❌ Reject
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================
// Analytics Tab
// ========================================

function AnalyticsTab() {
  return (
    <div>
      <h2 className="admin-heading-2 mb-4" style={{ marginBottom: 'var(--space-md)' }}>Analytics</h2>
      <p className="admin-text-secondary">Coming soon: Judge statistics, attorney performance, case outcome trends</p>
    </div>
  );
}

// ========================================
// Helper Components
// ========================================

