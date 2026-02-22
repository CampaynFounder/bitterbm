'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface AdminLayoutProps {
  children: ReactNode;
}

const PUBLIC_ADMIN_PATHS = ['/admin/login', '/admin/auth/callback'];

const navigation = [
  {
    section: 'Core Pipelines',
    items: [
      {
        name: 'Executive Dashboard',
        href: '/admin/dashboard',
        icon: '📊',
        description: 'CourtListener RAG Overview'
      },
      {
        name: 'County Scraper',
        href: '/admin/data-pipeline',
        icon: '🏛️',
        description: 'County Court Data Pipeline',
        badge: 'New'
      }
    ]
  },
  {
    section: 'Configuration',
    items: [
      {
        name: 'Scraper Builder',
        href: '/admin/scraper-builder',
        icon: '🔧',
        description: 'Visual Config Tool'
      },
      {
        name: 'Superset Manager',
        href: '/admin/superset',
        icon: '📦',
        description: 'Data Superset Control'
      }
    ]
  },
  {
    section: 'Automation',
    items: [
      {
        name: 'Autoscrape',
        href: '/admin/autoscrape',
        icon: '🤖',
        description: 'Automated Extraction'
      },
      {
        name: 'Scrape Jobs',
        href: '/admin/scrape',
        icon: '⚡',
        description: 'Active Scraping Tasks'
      }
    ]
  }
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');

  const isPublicPath = PUBLIC_ADMIN_PATHS.includes(pathname ?? '');

  useEffect(() => {
    if (isPublicPath) {
      setAuthStatus('authenticated');
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthStatus('authenticated');
      } else {
        setAuthStatus('unauthenticated');
        router.replace('/admin/login');
      }
    });
  }, [isPublicPath, pathname, router]);

  // Public auth pages: no sidebar, no dashboard links — only the auth form
  if (isPublicPath) {
    return <>{children}</>;
  }

  // Protected routes: wait for auth check, never show cockpit until authenticated
  if (authStatus === 'checking' || authStatus === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Checking authentication…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Top Navigation Bar - Executive Style */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md shadow-md border-b border-gray-200">
        <div className="max-w-full">
          <div className="flex items-center justify-between h-16 px-4 lg:px-8">
            {/* Left: Brand & Mobile Menu */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-2.5 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all"
                aria-label="Toggle navigation"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sidebarOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
                </svg>
              </button>
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-xl font-bold">⚖️</span>
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-lg font-bold bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 bg-clip-text text-transparent">
                    Legal Data Platform
                  </h1>
                  <p className="text-xs text-gray-500">Executive Control Center</p>
                </div>
              </div>
            </div>

            {/* Right: Status & Quick Actions */}
            <div className="flex items-center gap-3">
              {/* System Status */}
              <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl shadow-sm">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                </span>
                <span className="text-xs font-semibold text-green-700">All Systems Operational</span>
              </div>

              {/* User Menu */}
              <button className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition-all">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-bold">A</span>
                </div>
                <span className="hidden sm:block text-sm font-medium text-gray-700">Admin</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-4rem)]">
        {/* Mobile Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-all"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar - Executive Navigation */}
        <aside className={`
          fixed lg:static inset-y-0 left-0 top-16 z-40
          w-80 bg-white/95 backdrop-blur-lg shadow-2xl lg:shadow-none border-r border-gray-200
          transform transition-all duration-300 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          overflow-y-auto
        `}>
          <div className="p-6 space-y-6">
            {navigation.map((section, idx) => (
              <div key={idx}>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-3">
                  {section.section}
                </h3>
                <nav className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={`
                          group relative flex items-center gap-3 px-4 py-3.5 min-h-[48px] sm:min-h-[52px] rounded-xl
                          transition-all duration-200
                          ${
                            isActive
                              ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/30 scale-[1.02]'
                              : 'text-gray-700 hover:bg-gray-50 hover:shadow-sm hover:scale-[1.01]'
                          }
                        `}
                      >
                        <div className={`
                          w-10 h-10 rounded-xl flex items-center justify-center text-xl
                          ${isActive ? 'bg-white/20' : 'bg-gray-100 group-hover:bg-gray-200'}
                          transition-all
                        `}>
                          {item.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold text-sm ${isActive ? 'text-white' : 'text-gray-900'}`}>
                              {item.name}
                            </span>
                            {item.badge && (
                              <span className="px-2 py-0.5 text-[10px] font-black bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-full shadow-sm">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <p className={`text-xs mt-0.5 ${isActive ? 'text-blue-100' : 'text-gray-500'}`}>
                            {item.description}
                          </p>
                        </div>
                        
                        {/* Active indicator arrow */}
                        {isActive && (
                          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            ))}
          </div>

          {/* System Health Panel */}
          <div className="p-6 border-t border-gray-200 bg-gradient-to-br from-gray-50 to-slate-50">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4">System Health</h3>
            <div className="space-y-3">
              <HealthIndicator label="Database" status="online" />
              <HealthIndicator label="API Services" status="online" />
              <HealthIndicator label="Queue Processing" status="online" />
              <HealthIndicator label="Storage" status="online" usage="67%" />
            </div>
          </div>
        </aside>

        {/* Main Content Area - single centered column, generous padding */}
        <main className="flex-1 overflow-y-auto min-w-0 flex justify-center">
          <div className="w-full max-w-4xl lg:max-w-5xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 box-border">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function HealthIndicator({ label, status, usage }: { label: string; status: 'online' | 'warning' | 'offline'; usage?: string }) {
  const statusConfig = {
    online: { color: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50' },
    warning: { color: 'bg-yellow-500', text: 'text-yellow-700', bg: 'bg-yellow-50' },
    offline: { color: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' }
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-700 font-medium">{label}</span>
      <div className="flex items-center gap-2">
        {usage && <span className="text-xs text-gray-500">{usage}</span>}
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${config.bg}`}>
          <span className={`w-2 h-2 ${config.color} rounded-full`}></span>
          <span className={`text-xs font-semibold ${config.text} capitalize`}>{status}</span>
        </div>
      </div>
    </div>
  );
}
