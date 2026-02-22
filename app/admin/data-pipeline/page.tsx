'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Data Pipeline Dashboard
 * 
 * Workflow:
 * 1. Configure County (one-time setup)
 * 2. Create Superset (define search criteria)
 * 3. Monitor Processing (view queue status)
 * 4. Review Low-Confidence Extractions
 * 5. View Analytics
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-2xl">🏛️</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                County Data Pipeline
              </h1>
              <p className="text-gray-600 mt-1">
                Configure counties, generate supersets, and monitor extraction
              </p>
            </div>
          </div>
        </div>

        {/* Stats Overview - Modern Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Counties"
            value={counties.length}
            icon="🏛️"
            color="blue"
          />
          <StatCard
            title="Active Supersets"
            value={supersets.filter(s => s.status === 'processing').length}
            icon="📦"
            color="green"
          />
          <StatCard
            title="Queue"
            value={queue.filter(q => q.status === 'queued').length}
            icon="⏳"
            color="yellow"
          />
          <StatCard
            title="Needs Review"
            value={reviewItems.length}
            icon="👁️"
            color="red"
          />
        </div>

        {/* Tabs - Modern Design */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 p-1">
            <nav className="flex gap-1 overflow-x-auto">
              <Tab
                label="Counties"
                active={activeTab === 'counties'}
                onClick={() => setActiveTab('counties')}
                badge={counties.length}
              />
              <Tab
                label="Supersets"
                active={activeTab === 'supersets'}
                onClick={() => setActiveTab('supersets')}
                badge={supersets.length}
              />
              <Tab
                label="Processing Queue"
                active={activeTab === 'queue'}
                onClick={() => setActiveTab('queue')}
                badge={queue.filter(q => q.status === 'queued').length}
              />
              <Tab
                label="Review Queue"
                active={activeTab === 'review'}
                onClick={() => setActiveTab('review')}
                badge={reviewItems.length}
              />
              <Tab
                label="Analytics"
                active={activeTab === 'analytics'}
                onClick={() => setActiveTab('analytics')}
              />
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'counties' && <CountiesTab counties={counties} onUpdate={loadData} />}
            {activeTab === 'supersets' && <SupersetsTab supersets={supersets} counties={counties} onUpdate={loadData} />}
            {activeTab === 'queue' && <QueueTab queue={queue} />}
            {activeTab === 'review' && <ReviewTab items={reviewItems} onUpdate={loadData} />}
            {activeTab === 'analytics' && <AnalyticsTab />}
          </div>
        </div>
      </div>
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
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Configured Counties</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-sm hover:shadow-md font-medium"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add County
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-xl p-6 mb-6 shadow-sm">
          <h3 className="text-xl font-bold text-gray-900 mb-5">New County Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="County Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              required
            />
            <input
              type="text"
              placeholder="State (e.g., GA)"
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              required
            />
            <select
              value={formData.court_type}
              onChange={(e) => setFormData({ ...formData, court_type: e.target.value })}
              className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
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
              className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              required
            />
          </div>
          <div className="mt-6 flex gap-3">
            <button
              type="submit"
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-sm hover:shadow-md font-medium"
            >
              Save County
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {counties.map((county) => (
          <CountyCard key={county.id} county={county} onUpdate={onUpdate} />
        ))}
      </div>
    </div>
  );
}

function CountyCard({ county, onUpdate }: { county: County; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(false);

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800 border-gray-300',
    configured: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    active: 'bg-green-100 text-green-800 border-green-300',
    paused: 'bg-red-100 text-red-800 border-red-300'
  };

  return (
    <div className="bg-white border-2 border-gray-200 rounded-xl p-5 hover:shadow-lg transition-all duration-200">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-xl font-bold text-gray-900">{county.name}, {county.state}</h3>
            <span className={`px-3 py-1 text-xs font-bold rounded-full border ${statusColors[county.status] || statusColors.draft}`}>
              {county.status.toUpperCase()}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            <span className="font-medium">{county.court_type}</span> • {county.base_url}
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-4 p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
        >
          <svg className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="mt-5 pt-5 border-t-2 border-gray-100">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => window.location.href = `/admin/scraper-config?county=${county.id}`}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-sm hover:shadow-md font-medium"
            >
              <span>📝</span> Configure Scraper
            </button>
            <button
              onClick={() => window.location.href = `/admin/visual-builder?county=${county.id}`}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all shadow-sm hover:shadow-md font-medium"
            >
              <span>🎨</span> Visual Builder
            </button>
            <button className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all shadow-sm hover:shadow-md font-medium">
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

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Supersets</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          + Generate Superset
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Generate New Superset</h3>
          <div className="space-y-4">
            <select
              value={formData.county_id}
              onChange={(e) => setFormData({ ...formData, county_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
              placeholder="Superset Name (e.g., 'Family Cases 2020-2024')"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            />
            
            <div className="grid grid-cols-2 gap-4">
              <input
                type="date"
                placeholder="Date From"
                value={formData.date_from}
                onChange={(e) => setFormData({ ...formData, date_from: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
              <input
                type="date"
                placeholder="Date To"
                value={formData.date_to}
                onChange={(e) => setFormData({ ...formData, date_to: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            
            <input
              type="text"
              placeholder="Party Name (use % for wildcard)"
              value={formData.party_name}
              onChange={(e) => setFormData({ ...formData, party_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              🚀 Generate
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {supersets.map((superset) => (
          <SupersetCard key={superset.id} superset={superset} />
        ))}
      </div>
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
      <h2 className="text-xl font-semibold mb-4">Processing Queue</h2>
      
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-gray-600">Queued</p>
          <p className="text-2xl font-bold text-yellow-700">{stats.queued}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-gray-600">Processing</p>
          <p className="text-2xl font-bold text-blue-700">{stats.processing}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-gray-600">Complete</p>
          <p className="text-2xl font-bold text-green-700">{stats.complete}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-gray-600">Failed</p>
          <p className="text-2xl font-bold text-red-700">{stats.failed}</p>
        </div>
      </div>

      {/* Queue Items */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Queued</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attempts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {queue.slice(0, 50).map((task) => (
              <tr key={task.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">{task.task_type}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    task.status === 'queued' ? 'bg-yellow-100 text-yellow-800' :
                    task.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                    task.status === 'complete' ? 'bg-green-100 text-green-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {task.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {new Date(task.queued_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {task.attempts} / {task.max_attempts}
                </td>
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
      <h2 className="text-xl font-semibold mb-4">Review Queue ({items.length})</h2>
      
      <div className="grid grid-cols-2 gap-6">
        {/* List */}
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className={`bg-white border rounded-lg p-4 cursor-pointer hover:border-blue-500 ${
                selectedItem?.id === item.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">{item.review_type}</span>
                <span className="text-xs text-gray-500">
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Case: {item.cases?.case_number}
              </p>
            </div>
          ))}
        </div>

        {/* Detail */}
        {selectedItem && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 sticky top-6">
            <h3 className="text-lg font-semibold mb-4">Review Details</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Type</label>
                <p className="text-sm">{selectedItem.review_type}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700">Case</label>
                <p className="text-sm">{selectedItem.cases?.case_number}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700">Data to Review</label>
                <pre className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded text-xs overflow-auto max-h-64">
                  {JSON.stringify(selectedItem.data_to_review, null, 2)}
                </pre>
              </div>
              
              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => handleApprove(selectedItem)}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  ✅ Approve
                </button>
                <button
                  onClick={() => handleReject(selectedItem)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
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

function StatCard({ title, value, icon, color }: { 
  title: string; 
  value: number; 
  icon: string; 
  color: 'blue' | 'green' | 'yellow' | 'red';
}) {
  const colors = {
    blue: {
      bg: 'from-blue-50 to-blue-100',
      border: 'border-blue-200',
      text: 'text-blue-700',
      icon: 'bg-blue-500'
    },
    green: {
      bg: 'from-green-50 to-green-100',
      border: 'border-green-200',
      text: 'text-green-700',
      icon: 'bg-green-500'
    },
    yellow: {
      bg: 'from-yellow-50 to-yellow-100',
      border: 'border-yellow-200',
      text: 'text-yellow-700',
      icon: 'bg-yellow-500'
    },
    red: {
      bg: 'from-red-50 to-red-100',
      border: 'border-red-200',
      text: 'text-red-700',
      icon: 'bg-red-500'
    }
  };

  const colorScheme = colors[color];

  return (
    <div className={`bg-gradient-to-br ${colorScheme.bg} border ${colorScheme.border} rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className={`text-sm font-medium ${colorScheme.text} opacity-80`}>{title}</p>
          <p className={`text-3xl font-bold ${colorScheme.text} mt-2`}>{value}</p>
        </div>
        <div className={`w-12 h-12 ${colorScheme.icon} bg-opacity-20 rounded-xl flex items-center justify-center`}>
          <span className="text-2xl">{icon}</span>
        </div>
      </div>
    </div>
  );
}

function Tab({ label, active, badge, onClick }: { 
  label: string; 
  active: boolean; 
  badge?: number; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        relative px-4 py-2 font-medium text-sm rounded-lg transition-all duration-200 whitespace-nowrap
        ${
          active
            ? 'bg-white text-blue-600 shadow-sm'
            : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
        }
      `}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold shadow-sm">
          {badge}
        </span>
      )}
    </button>
  );
}
