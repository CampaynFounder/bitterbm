'use client';

import './admin.css';
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
      <div className="admin-pages min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
          <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Checking authentication…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-pages min-h-screen">
      <header className="admin-header sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 rounded-lg"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sidebarOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>⚖️</span>
            <span className="admin-brand">Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="admin-status-label hidden sm:inline">Pipeline</span>
          <span className="w-2 h-2 rounded-full" aria-hidden title="Active" style={{ backgroundColor: 'var(--accent-cyan)' }} />
        </div>
      </header>

      <div className="flex h-[calc(100vh-3.5rem)]">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 lg:hidden transition-all"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        )}

        <aside className={`admin-sidebar fixed lg:static inset-y-0 left-0 top-14 z-40 w-64 transform transition-transform duration-200 overflow-y-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            {navigation.map((section, idx) => (
              <div key={idx}>
                <h2 className="admin-nav-section" style={{ marginBottom: 'var(--space-sm)', paddingLeft: 'var(--space-sm)' }}>
                  {section.section}
                </h2>
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {section.items.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className="admin-nav-link flex items-center gap-2"
                        data-active={isActive}
                      >
                        <span className="text-lg" aria-hidden>{item.icon}</span>
                        <span className="flex-1">{item.name}</span>
                        {item.badge && (
                          <span className="admin-nav-badge">{item.badge}</span>
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
