'use client';

import { ReactNode } from 'react';

/**
 * Admin component library
 * Use for: page structure, hints, empty states, overview cards, tabs.
 * Optimized for: clarity, primary actions, hint text, mobile-responsive layout.
 */

// =============================================================================
// Page structure
// =============================================================================

interface TitleBlockProps {
  title: string;
  /** Short, scannable description. One line preferred. */
  description?: string;
  /** Optional badge shown after title (e.g. "New", "Beta") */
  badge?: string;
  /** Primary action for this page (one main button) */
  primaryAction?: ReactNode;
  /** Optional icon left of title */
  icon?: string;
}

export function TitleBlock({ title, description, badge, primaryAction, icon }: TitleBlockProps) {
  return (
    <header className="border-b border-gray-200 pb-6 sm:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          {icon && (
            <div
              className="hidden sm:flex w-12 h-12 rounded-xl bg-blue-600 text-white items-center justify-center flex-shrink-0 text-2xl"
              aria-hidden
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
              {title}
              {badge && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {badge}
                </span>
              )}
            </h1>
            {description && (
              <p className="mt-1.5 text-sm text-gray-700 max-w-2xl">
                {description}
              </p>
            )}
          </div>
        </div>
        {primaryAction && (
          <div className="flex-shrink-0 w-full sm:w-auto">
            {primaryAction}
          </div>
        )}
      </div>
    </header>
  );
}

// =============================================================================
// Hint / helper text
// =============================================================================

interface HintProps {
  children: ReactNode;
  /** Optional icon (emoji or icon name) */
  icon?: string;
  className?: string;
}

export function Hint({ children, icon = '💡', className = '' }: HintProps) {
  return (
    <div
      className={`flex gap-3 p-4 rounded-xl bg-amber-100 border border-amber-300 text-sm text-amber-950 ${className}`}
      role="status"
    >
      <span className="flex-shrink-0 text-base" aria-hidden>{icon}</span>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}

// =============================================================================
// Empty state
// =============================================================================

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon = '📭', title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 sm:p-10 text-center ${className}`}
    >
      <div className="text-4xl sm:text-5xl mb-4" aria-hidden>{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-700 max-w-sm mx-auto mb-6">{description}</p>
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  );
}

// =============================================================================
// Section with optional title and description
// =============================================================================

interface SectionBlockProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function SectionBlock({ title, description, children, className = '' }: SectionBlockProps) {
  return (
    <section className={`pt-6 sm:pt-8 ${className}`}>
      {(title || description) && (
        <div className="mb-4">
          {title && <h2 className="text-base font-semibold text-gray-900">{title}</h2>}
          {description && <p className="mt-1 text-sm text-gray-700">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

// =============================================================================
// Stat card with optional hint (for pipeline/overview cards)
// =============================================================================

interface OverviewCardProps {
  title: string;
  /** Short hint: what this number means (e.g. "Court sources configured") */
  hint?: string;
  value: string | number;
  icon: string;
  onClick?: () => void;
  /** Visual emphasis: blue = primary, others for status */
  variant?: 'blue' | 'green' | 'amber' | 'red' | 'gray';
}

const overviewVariants = {
  blue: 'bg-blue-50 border-blue-300 text-blue-900',
  green: 'bg-emerald-50 border-emerald-300 text-emerald-900',
  amber: 'bg-amber-50 border-amber-300 text-amber-900',
  red: 'bg-red-50 border-red-300 text-red-900',
  gray: 'bg-gray-100 border-gray-300 text-gray-900',
};

export function OverviewCard({ title, hint, value, icon, onClick, variant = 'gray' }: OverviewCardProps) {
  const styles = overviewVariants[variant];
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`
        w-full text-left rounded-xl border-2 p-4 sm:p-5 transition-all
        ${styles}
        ${onClick ? 'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer' : ''}
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          {hint && <p className="text-xs mt-0.5 opacity-90">{hint}</p>}
          <p className="text-2xl sm:text-3xl font-bold mt-2">{value}</p>
        </div>
        <span className="text-2xl sm:text-3xl flex-shrink-0" aria-hidden>{icon}</span>
      </div>
    </Wrapper>
  );
}

// =============================================================================
// Card container
// =============================================================================

interface CardProps {
  children: ReactNode;
  noPadding?: boolean;
  className?: string;
}

export function Card({ children, noPadding = false, className = '' }: CardProps) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 shadow-sm ${noPadding ? '' : 'p-4 sm:p-6'} ${className}`}
    >
      {children}
    </div>
  );
}

// =============================================================================
// Tabs (for workflow steps)
// =============================================================================

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
    <div className="border-b border-gray-200">
      {label && (
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">{label}</p>
      )}
      <nav className="flex gap-1 overflow-x-auto pb-px" aria-label={label}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-selected={activeId === tab.id}
            className={`
              relative min-h-[44px] px-4 py-2.5 font-medium text-sm rounded-t-lg whitespace-nowrap
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              ${activeId === tab.id
                ? 'bg-white text-blue-700 border border-b-0 border-gray-200 -mb-px'
                : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50 border border-transparent'
              }
            `}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-semibold">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
