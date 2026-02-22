'use client';

import './admin.css';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const MVP_CSS_URL = 'https://unpkg.com/mvp.css@1.17.2/mvp.css';

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

  // MVP.css for admin pages only (when authenticated, not on login/callback)
  useEffect(() => {
    if (isPublicPath || authStatus !== 'authenticated') return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = MVP_CSS_URL;
    link.setAttribute('data-admin-mvp', 'true');
    document.head.appendChild(link);
    return () => {
      document.querySelector('link[data-admin-mvp="true"]')?.remove();
    };
  }, [isPublicPath, authStatus]);

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
    <div className="admin-pages min-h-screen bg-gray-50">
      <header className="admin-header sticky top-0 z-50 h-14 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sidebarOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>⚖️</span>
            <span className="font-semibold text-gray-900">Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-xs text-gray-500">Pipeline</span>
          <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden />
        </div>
      </header>

      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Mobile Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-all"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside className={`admin-sidebar fixed lg:static inset-y-0 left-0 top-14 z-40 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} overflow-y-auto`}>
          <div className="p-4 space-y-4">
            {navigation.map((section, idx) => (
              <div key={idx}>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">
                  {section.section}
                </h2>
                <nav className="space-y-0.5">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded text-sm font-medium min-h-[44px] ${
                          isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <span className="text-lg">{item.icon}</span>
                        <span className="flex-1">{item.name}</span>
                        {item.badge && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${isActive ? 'bg-white/20' : 'bg-amber-100 text-amber-800'}`}>
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            ))}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
