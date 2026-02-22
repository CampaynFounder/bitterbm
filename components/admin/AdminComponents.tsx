'use client';

import { ReactNode } from 'react';

/**
 * Admin component library. Uses design tokens from app/globals.css
 * via app/admin/admin.css (.admin-* classes). Same font (Syne) and
 * dark palette as the rest of the product.
 */

// =============================================================================
// Page structure
// =============================================================================

interface TitleBlockProps {
  title: string;
  description?: string;
  badge?: string;
  primaryAction?: ReactNode;
  icon?: string;
}

export function TitleBlock({ title, description, badge, primaryAction, icon }: TitleBlockProps) {
  return (
    <header className="admin-title-block">
      <div
        className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"
        style={{ gap: 'var(--space-md)' }}
      >
        <div className="flex items-start gap-4 min-w-0" style={{ gap: 'var(--space-md)' }}>
          {icon && (
            <div
              className="hidden sm:flex w-12 h-12 rounded-xl items-center justify-center flex-shrink-0 text-2xl"
              style={{ background: 'var(--accent-primary)', color: '#fff' }}
              aria-hidden
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 flex-wrap" style={{ gap: 'var(--space-sm)', marginBottom: 0 }}>
              {title}
              {badge && <span className="admin-title-badge">{badge}</span>}
            </h1>
            {description && <p>{description}</p>}
          </div>
        </div>
        {primaryAction && <div className="flex-shrink-0 w-full sm:w-auto">{primaryAction}</div>}
      </div>
    </header>
  );
}

interface HintProps {
  children: ReactNode;
  icon?: string;
  className?: string;
}

export function Hint({ children, icon = '💡', className = '' }: HintProps) {
  return (
    <div className={`admin-hint ${className}`} role="status">
      <span className="flex-shrink-0 text-base" aria-hidden>{icon}</span>
      <p>{children}</p>
    </div>
  );
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon = '📭', title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`admin-empty-state ${className}`}>
      <div className="text-4xl sm:text-5xl mb-4" style={{ marginBottom: 'var(--space-md)' }} aria-hidden>{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  );
}

interface SectionBlockProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function SectionBlock({ title, description, children, className = '' }: SectionBlockProps) {
  return (
    <section className={`admin-section-block ${className}`} style={{ paddingTop: 'var(--space-lg)' }}>
      {(title || description) && (
        <div style={{ marginBottom: 'var(--space-md)' }}>
          {title && <h2>{title}</h2>}
          {description && <p style={{ marginTop: 'var(--space-xs)', marginBottom: 0 }}>{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

interface OverviewCardProps {
  title: string;
  hint?: string;
  value: string | number;
  icon: string;
  onClick?: () => void;
  variant?: 'blue' | 'green' | 'amber' | 'red' | 'gray';
}

export function OverviewCard({ title, hint, value, icon, onClick, variant = 'gray' }: OverviewCardProps) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`admin-overview-card admin-overview-card--${variant} w-full text-left ${onClick ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2 focus:ring-offset-[var(--bg-primary)]' : ''}`}
    >
      <div className="flex items-start justify-between gap-3" style={{ gap: 'var(--space-md)' }}>
        <div className="min-w-0">
          <p className="admin-card-title">{title}</p>
          {hint && <p className="admin-text-muted mt-0.5" style={{ marginTop: 'var(--space-xs)' }}>{hint}</p>}
          <p className="admin-overview-value mt-2" style={{ marginTop: 'var(--space-sm)' }}>{value}</p>
        </div>
        <span className="text-2xl sm:text-3xl flex-shrink-0" aria-hidden>{icon}</span>
      </div>
    </Wrapper>
  );
}

interface CardProps {
  children: ReactNode;
  noPadding?: boolean;
  className?: string;
}

export function Card({ children, noPadding = false, className = '' }: CardProps) {
  return (
    <div className={`admin-card ${noPadding ? 'p-0' : ''} ${className}`}>
      {children}
    </div>
  );
}

interface TabItem {
  id: string;
  label: string;
  badge?: number;
}

interface TabBarProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  label?: string;
}

export function TabBar({ tabs, activeId, onChange, label = 'Section' }: TabBarProps) {
  return (
    <div className="admin-tab-bar">
      {label && <p className="admin-tab-label">{label}</p>}
      <nav className="flex gap-1 overflow-x-auto pb-px" style={{ gap: 'var(--space-xs)' }} aria-label={label}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-selected={activeId === tab.id}
            className="whitespace-nowrap"
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="admin-tab-badge inline-flex items-center justify-center ml-1.5">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
