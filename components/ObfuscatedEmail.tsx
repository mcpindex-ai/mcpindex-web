'use client';

import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/** Assembles mailto at runtime so scrapers don't get a static mailto: in HTML. */
export function ObfuscatedEmail({
  user,
  domain,
  className,
  children,
}: {
  user: string;
  domain: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const address = `${user}@${domain}`;
  // Client-only href: server snapshot is false so SSR HTML has no mailto:.
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const href = isClient ? `mailto:${address}` : undefined;

  return (
    <a
      href={href}
      onClick={(e) => {
        if (!href) {
          e.preventDefault();
          window.location.href = `mailto:${address}`;
        }
      }}
      className={className}
    >
      {children ?? address}
    </a>
  );
}
