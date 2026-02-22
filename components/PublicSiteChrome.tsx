'use client';

import { usePathname } from 'next/navigation';
import { HeaderLogo } from '@/components/landing/HeaderLogo';
import { HamburgerMenu } from '@/components/landing/HamburgerMenu';

/**
 * Renders the public site header and hamburger only when NOT on an admin route.
 * On /admin/* we hide these so the admin layout and its hamburger are the only chrome.
 */
export function PublicSiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <HeaderLogo />
      <HamburgerMenu visible />
      <div className="main-with-header" style={{ paddingTop: 'var(--header-height, 64px)' }}>
        {children}
      </div>
    </>
  );
}
