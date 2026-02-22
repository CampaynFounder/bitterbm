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

export default function DataPipelinePage() {
  const [activeTab, setActiveTab] = useState('counties');
  const [counties, setCounties] = useState([]);
  const [supersets, setSupersets] = useState([]);
  const [queue, setQueue] = useState([]);
  const [reviewItems, setReviewItems] = useState([]);

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
      supabase.from('counties').select('*').order('created_at', { ascending: false }),
      supabase.from('supersets').select('*, counties(name, state)').order('created_at', { ascending: false }),
      supabase.from('processing_queue').select('*').order('queued_at', { ascending: false }).limit(100),
      supabase.from('review_queue').select('*, cases(case_number)').eq('status', 'pending')
    ]);

    setCounties(countiesRes.data || []);
    setSupersets(supersetsRes.data || []);
    setQueue(queueRes.data || []);
    setReviewItems(reviewRes.data || []);
  };

  const loadQueue = async () => {
    const { data } = await supabase
      .from('processing_queue')
      .select('*')
      .order('queued_at', { ascending: false })
      .limit(100);
    
    setQueue(data || []);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
          📊 Data Pipeline Dashboard
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          Configure counties, generate supersets, and monitor data extraction
        </p>
      </div>

      {/* Stats Overview - Responsive Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
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

      {/* Tabs - Mobile Responsive */}
      <div className="border-b border-gray-200 mb-6 overflow-x-auto">
        <nav className="-mb-px flex space-x-4 sm:space-x-8 min-w-max sm:min-w-0">
          <Tab
            label="Counties"
            active={activeTab === 'counties'}
            onClick={() => setActiveTab('counties')}
          />
          <Tab
            label="Supersets"
            active={activeTab === 'supersets'}
            onClick={() => setActiveTab('supersets')}
          />
          <Tab
            label="Processing Queue"
            active={activeTab === 'queue'}
            onClick={() => setActiveTab('queue')}
          />
          <Tab
            label="Review Queue"
            active={activeTab === 'review'}
            badge={reviewItems.length}
            onClick={() => setActiveTab('review')}
          />
          <Tab
            label="Analytics"
            active={activeTab === 'analytics'}
            onClick={() => setActiveTab('analytics')}
          />
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'counties' && <CountiesTab counties={counties} onUpdate={loadData} />}
      {activeTab === 'supersets' && <SupersetsTab supersets={supersets} counties={counties} onUpdate={loadData} />}
      {activeTab === 'queue' && <QueueTab queue={queue} />}
      {activeTab === 'review' && <ReviewTab items={reviewItems} onUpdate={loadData} />}
      {activeTab === 'analytics' && <AnalyticsTab />}
    </div>
  );
}

// ========================================
// County Configuration Tab
// ========================================

function CountiesTab({ counties, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    state: '',
    court_type: 'family',
    base_url: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    await supabase.from('counties').insert(formData);
    
    setShowForm(false);
    setFormData({ name: '', state: '', court_type: 'family', base_url: '' });
    onUpdate();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Configured Counties</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + Add County
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">New County</h3>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="County Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg"
              required
            />
            <input
              type="text"
              placeholder="State (e.g., GA)"
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg"
              required
            />
            <select
              value={formData.court_type}
              onChange={(e) => setFormData({ ...formData, court_type: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg"
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
              className="px-3 py-2 border border-gray-300 rounded-lg"
              required
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Save County
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
        {counties.map((county) => (
          <CountyCard key={county.id} county={county} onUpdate={onUpdate} />
        ))}
      </div>
    </div>
  );
}

function CountyCard({ county, onUpdate }) {
  const [expanded, setExpanded] = useState(false);

  const statusColors = {
    draft: 'bg-gray-100 text-gray-800',
    configured: 'bg-yellow-100 text-yellow-800',
    active: 'bg-green-100 text-green-800',
    paused: 'bg-red-100 text-red-800'
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">{county.name}, {county.state}</h3>
            <span className={`px-2 py-1 text-xs rounded-full ${statusColors[county.status]}`}>
              {county.status}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">{county.court_type} • {county.base_url}</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-blue-600 hover:text-blue-700"
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex gap-2">
            <button
              onClick={() => window.location.href = `/admin/scraper-config?county=${county.id}`}
              className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
            >
              📝 Configure Scraper
            </button>
            <button
              onClick={() => window.location.href = `/admin/visual-builder?county=${county.id}`}
              className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
            >
              🎨 Visual Builder
            </button>
            <button className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200">
              ▶️ Test Scraper
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

function SupersetsTab({ supersets, counties, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    county_id: '',
    name: '',
    party_name: '%',
    date_from: '',
    date_to: '',
    case_types: []
  });

  const handleSubmit = async (e) => {
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

function SupersetCard({ superset }) {
  const statusColors = {
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
        <span className={`px-2 py-1 text-xs rounded-full ${statusColors[superset.status]}`}>
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

function QueueTab({ queue }) {
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

function ReviewTab({ items, onUpdate }) {
  const [selectedItem, setSelectedItem] = useState(null);

  const handleApprove = async (item) => {
    await supabase
      .from('review_queue')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', item.id);
    
    onUpdate();
  };

  const handleReject = async (item) => {
    await supabase
      .from('review_queue')
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

function StatCard({ title, value, icon, color }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    red: 'bg-red-50 border-red-200 text-red-700'
  };

  return (
    <div className={`border rounded-lg p-3 sm:p-4 ${colors[color]}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm opacity-75 truncate">{title}</p>
          <p className="text-xl sm:text-2xl font-bold mt-1">{value}</p>
        </div>
        <span className="text-2xl sm:text-3xl ml-2 flex-shrink-0">{icon}</span>
      </div>
    </div>
  );
}

function Tab({ label, active, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm relative whitespace-nowrap ${
        active
          ? 'border-blue-500 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {label}
      {badge > 0 && (
        <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center text-[10px] sm:text-xs">
          {badge}
        </span>
      )}
    </button>
  );
}
