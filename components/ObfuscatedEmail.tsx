'use client';

import { useEffect, useState } from 'react';

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
  const [href, setHref] = useState<string | undefined>(undefined);

  useEffect(() => {
    setHref(`mailto:${user}@${domain}`);
  }, [user, domain]);

  return (
    <a
      href={href}
      onClick={(e) => {
        if (!href) {
          e.preventDefault();
          window.location.href = `mailto:${user}@${domain}`;
        }
      }}
      className={className}
    >
      {children ?? address}
    </a>
  );
}
