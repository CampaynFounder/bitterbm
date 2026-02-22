'use client';

import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: string;
  badge?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, icon, badge, actions }: PageHeaderProps) {
  return (
    <div className="bg-white border-b border-gray-200 shadow-sm w-full">
      <div className="w-full py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            {icon && (
              <div className="hidden sm:flex w-14 h-14 bg-blue-600 rounded-2xl items-center justify-center shadow-lg flex-shrink-0">
                <span className="text-3xl">{icon}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">
                  {title}
                </h1>
                {badge && (
                  <span className="px-3 py-1.5 text-xs font-bold bg-green-600 text-white rounded-full">
                    {badge}
                  </span>
                )}
              </div>
              {description && (
                <p className="mt-2 text-sm sm:text-base text-gray-700">
                  {description}
                </p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex-shrink-0 w-full sm:w-auto">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface StatsGridProps {
  children: ReactNode;
}

export function StatsGrid({ children }: StatsGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
      {children}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'indigo';
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
  };
  onClick?: () => void;
}

export function StatCard({ title, value, icon, color, trend, onClick }: StatCardProps) {
  const colors = {
    blue: {
      bg: 'from-blue-50 to-blue-100',
      border: 'border-blue-200',
      text: 'text-blue-700',
      icon: 'bg-blue-500/20 text-blue-600'
    },
    green: {
      bg: 'from-green-50 to-green-100',
      border: 'border-green-200',
      text: 'text-green-700',
      icon: 'bg-green-500/20 text-green-600'
    },
    yellow: {
      bg: 'from-yellow-50 to-yellow-100',
      border: 'border-yellow-200',
      text: 'text-yellow-700',
      icon: 'bg-yellow-500/20 text-yellow-600'
    },
    red: {
      bg: 'from-red-50 to-red-100',
      border: 'border-red-200',
      text: 'text-red-700',
      icon: 'bg-red-500/20 text-red-600'
    },
    purple: {
      bg: 'from-purple-50 to-purple-100',
      border: 'border-purple-200',
      text: 'text-purple-700',
      icon: 'bg-purple-500/20 text-purple-600'
    },
    indigo: {
      bg: 'from-indigo-50 to-indigo-100',
      border: 'border-indigo-200',
      text: 'text-indigo-700',
      icon: 'bg-indigo-500/20 text-indigo-600'
    }
  };

  const colorScheme = colors[color];
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`
        bg-gradient-to-br ${colorScheme.bg} border-2 ${colorScheme.border} rounded-2xl p-4 sm:p-5 lg:p-6 shadow-sm
        min-h-[100px] sm:min-h-[110px]
        ${onClick ? 'hover:shadow-lg active:scale-[0.99] cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500' : 'hover:shadow-md'}
        transition-all duration-200
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className={`text-sm font-semibold ${colorScheme.text} opacity-80 mb-2`}>
            {title}
          </p>
          <p className={`text-3xl sm:text-4xl font-bold ${colorScheme.text}`}>
            {value}
          </p>
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <span className={`text-xs font-semibold ${
                trend.direction === 'up' ? 'text-green-600' : 
                trend.direction === 'down' ? 'text-red-600' : 
                'text-gray-600'
              }`}>
                {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'} {trend.value}
              </span>
            </div>
          )}
        </div>
        <div className={`w-12 h-12 sm:w-14 sm:h-14 ${colorScheme.icon} rounded-xl sm:rounded-2xl flex items-center justify-center flex-shrink-0`}>
          <span className="text-2xl sm:text-3xl">{icon}</span>
        </div>
      </div>
    </Component>
  );
}

interface ContentCardProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function ContentCard({ children, className = '', noPadding = false }: ContentCardProps) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 ${noPadding ? '' : 'p-4 sm:p-6'} ${className}`}>
      {children}
    </div>
  );
}

interface SectionProps {
  children: ReactNode;
  className?: string;
}

export function Section({ children, className = '' }: SectionProps) {
  return (
    <div className={`w-full py-6 sm:py-8 ${className}`}>
      {children}
    </div>
  );
}

interface TabsProps {
  tabs: Array<{
    id: string;
    label: string;
    badge?: number;
  }>;
  activeTab: string;
  onChange: (tab: string) => void;
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div className="border-b border-gray-200 bg-gray-100 px-3 sm:px-4 py-3">
      <nav className="flex gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-thin" aria-label="Section tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            type="button"
            className={`
              relative min-h-[44px] sm:min-h-[48px] px-4 sm:px-6 py-3 font-semibold text-sm rounded-xl transition-all duration-200 whitespace-nowrap
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }
            `}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[22px] h-5 px-1.5 bg-red-600 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

export function Button({ 
  children, 
  onClick, 
  variant = 'primary', 
  size = 'md', 
  icon,
  disabled = false,
  type = 'button',
  className = ''
}: ButtonProps) {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 border border-blue-700 shadow-md hover:shadow-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
    secondary: 'bg-white border-2 border-gray-300 text-gray-800 hover:bg-gray-50 hover:border-gray-400 focus:ring-2 focus:ring-gray-400 focus:ring-offset-2',
    success: 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800 border border-green-700 shadow-md focus:ring-2 focus:ring-green-500 focus:ring-offset-2',
    danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 border border-red-700 shadow-md focus:ring-2 focus:ring-red-500 focus:ring-offset-2',
    ghost: 'text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-gray-300 focus:ring-offset-2'
  };

  const sizes = {
    sm: 'px-4 py-2.5 text-sm min-h-[40px]',
    md: 'px-5 py-3 text-sm min-h-[44px] sm:min-h-[48px]',
    lg: 'px-6 py-3.5 text-base min-h-[48px] sm:min-h-[52px]'
  };

  const useDesignSystem = variant === 'primary' || variant === 'secondary';
  const baseClass = variant === 'primary' ? 'btn-primary' : variant === 'secondary' ? 'btn-secondary' : '';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={useDesignSystem
        ? `${baseClass} ${sizes[size]} disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${className}`
        : `font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 outline-none ${variants[variant]} ${sizes[size]} ${className}`
      }
      style={variant === 'success' ? { background: 'var(--accent-cyan)', color: 'var(--bg-primary)', border: 'none' } : undefined}
    >
      {icon && <span>{icon}</span>}
      {children}
    </button>
  );
}
