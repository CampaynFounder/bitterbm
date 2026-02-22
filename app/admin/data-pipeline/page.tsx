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

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Configured Counties</h2>
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

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-2xl p-6 mb-6 shadow-sm">
          <h3 className="text-xl font-bold text-gray-900 mb-5">New County Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="County Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              required
            />
            <input
              type="text"
              placeholder="State (e.g., GA)"
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              className="px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              required
            />
            <select
              value={formData.court_type}
              onChange={(e) => setFormData({ ...formData, court_type: e.target.value })}
              className="px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
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
              className="px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              required
            />
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
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
            <CountyCard key={county.id} county={county} onUpdate={onUpdate} />
          ))
        )}
      </div>
    </div>
  );
}

function CountyCard({ county, onUpdate }: { county: County; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(false);

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-200 text-gray-900',
    configured: 'bg-amber-200 text-amber-900',
    active: 'bg-green-200 text-green-900',
    paused: 'bg-red-200 text-red-900'
  };

  return (
    <div className="bg-white border-2 border-gray-200 rounded-xl p-4 sm:p-5 hover:shadow-md transition-all duration-200">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900">{county.name}, {county.state}</h3>
            <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${statusColors[county.status] || statusColors.draft}`}>
              {county.status.toUpperCase()}
            </span>
          </div>
          <p className="text-sm text-gray-700 mt-1 truncate">
            <span className="font-medium">{county.court_type}</span> • {county.base_url}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-expanded={expanded}
        >
          <svg className={`w-6 h-6 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => window.location.href = `/admin/scraper-config?county=${county.id}`}
              className="flex items-center justify-center gap-2 min-h-[48px] px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <span>📝</span> Configure Scraper
            </button>
            <button
              type="button"
              onClick={() => window.location.href = `/admin/visual-builder?county=${county.id}`}
              className="flex items-center justify-center gap-2 min-h-[48px] px-4 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
            >
              <span>🎨</span> Visual Builder
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-2 min-h-[48px] px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              <span>▶️</span> Test Scraper
            </button>
          </div>
        </div>
      )}
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
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Supersets</h2>
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
        <form onSubmit={handleSubmit} className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 sm:p-6 mb-6">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Generate New Superset</h3>
          <div className="space-y-4">
            <select
              value={formData.county_id}
              onChange={(e) => setFormData({ ...formData, county_id: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-green-500 min-h-[48px]"
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
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-green-500 min-h-[48px]"
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                type="date"
                value={formData.date_from}
                onChange={(e) => setFormData({ ...formData, date_from: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-green-500 min-h-[48px]"
                required
              />
              <input
                type="date"
                value={formData.date_to}
                onChange={(e) => setFormData({ ...formData, date_to: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-green-500 min-h-[48px]"
                required
              />
            </div>
            <input
              type="text"
              placeholder="Party Name (use % for wildcard)"
              value={formData.party_name}
              onChange={(e) => setFormData({ ...formData, party_name: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-green-500 min-h-[48px]"
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
  const statusColors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-800',
    collecting: 'bg-blue-100 text-blue-800',
    processing: 'bg-yellow-100 text-yellow-800',
    complete: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800'
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold">{superset.name}</h3>
        <span className={`px-2 py-1 text-xs rounded-full ${statusColors[superset.status] || statusColors.pending}`}>
          {superset.status}
        </span>
      </div>
      
      <div className="text-sm text-gray-600 space-y-1">
        <p>📍 {superset.counties?.name}, {superset.counties?.state}</p>
        <p>📅 {superset.search_params?.date_from} → {superset.search_params?.date_to}</p>
        <p>📊 {superset.total_cases} cases</p>
        
        {superset.status === 'processing' && (
          <div className="mt-3">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${superset.progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{superset.progress}% complete</p>
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
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Processing Queue</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800">Queued</p>
          <p className="text-2xl font-bold text-amber-900">{stats.queued}</p>
        </div>
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-blue-800">Processing</p>
          <p className="text-2xl font-bold text-blue-900">{stats.processing}</p>
        </div>
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-green-800">Complete</p>
          <p className="text-2xl font-bold text-green-900">{stats.complete}</p>
        </div>
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-800">Failed</p>
          <p className="text-2xl font-bold text-red-900">{stats.failed}</p>
        </div>
      </div>
      <div className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[400px]">
          <thead className="bg-gray-100 border-b-2 border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Task</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Queued</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Attempts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {queue.slice(0, 50).map((task) => (
              <tr key={task.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{task.task_type}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                    task.status === 'queued' ? 'bg-amber-200 text-amber-900' :
                    task.status === 'processing' ? 'bg-blue-200 text-blue-900' :
                    task.status === 'complete' ? 'bg-green-200 text-green-900' :
                    'bg-red-200 text-red-900'
                  }`}>
                    {task.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{new Date(task.queued_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{task.attempts} / {task.max_attempts}</td>
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
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Review Queue ({items.length})</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedItem(item)}
              className={`w-full text-left bg-white border-2 rounded-xl p-4 min-h-[56px] transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                selectedItem?.id === item.id ? 'border-blue-600 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-gray-900">{item.review_type}</span>
                <span className="text-xs text-gray-600">{new Date(item.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-gray-700">Case: {item.cases?.case_number ?? '—'}</p>
            </button>
          ))}
        </div>
        {selectedItem && (
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 sm:p-6 lg:sticky lg:top-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Review Details</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">Type</label>
                <p className="text-sm text-gray-900">{selectedItem.review_type}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">Case</label>
                <p className="text-sm text-gray-900">{selectedItem.cases?.case_number ?? '—'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">Data to Review</label>
                <pre className="mt-1 p-3 bg-gray-100 border border-gray-200 rounded-xl text-xs overflow-auto max-h-64 text-gray-800">
                  {JSON.stringify(selectedItem.data_to_review, null, 2)}
                </pre>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => handleApprove(selectedItem)}
                  className="flex-1 min-h-[48px] px-4 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  ✅ Approve
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(selectedItem)}
                  className="flex-1 min-h-[48px] px-4 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
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
      <h2 className="text-xl font-semibold mb-4">Analytics</h2>
      <p className="text-gray-600">Coming soon: Judge statistics, attorney performance, case outcome trends</p>
    </div>
  );
}

// ========================================
// Helper Components
// ========================================

