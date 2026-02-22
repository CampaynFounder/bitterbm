'use client';

import './admin.css';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { HamburgerMenu } from '@/components/landing/HamburgerMenu';

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
      },
      {
        name: 'Pipeline Execution',
        href: '/admin/execution',
        icon: '▶️',
        description: 'Track recorders, configs, supersets & extraction by state/county'
      }
    ]
  },
  {
    section: 'Configuration',
    items: [
      {
        name: 'Codegen → Config',
        href: '/admin/codegen',
        icon: '📋',
        description: 'Paste codegen, convert & save superset/extraction config'
      },
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

  async function handleAdminSignOut() {
    await supabase.auth.signOut();
    router.replace('/admin/login');
  }

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
      <header className="admin-header sticky top-0 z-40 flex items-center justify-between">
        <div className="flex items-center gap-2" style={{ paddingRight: 56 }}>
          <span className="text-2xl" aria-hidden>⚖️</span>
          <span className="admin-brand">Admin</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="admin-status-label hidden sm:inline">Pipeline</span>
          <span className="w-2 h-2 rounded-full" aria-hidden title="Active" style={{ backgroundColor: 'var(--accent-cyan)' }} />
        </div>
      </header>

      <HamburgerMenu
        visible
        variant="admin"
        adminSections={navigation}
        onAdminSignOut={() => handleAdminSignOut()}
      />

      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
