import type { Citation } from '@/lib/citations';

/**
 * Dark mono BibTeX block — same visual language as /methodology "Cite this".
 * Authors paste into .bib; no JS copy button (keeps the surface static).
 */
export function CiteBibtex({
  citation,
  className = '',
}: {
  citation: Citation;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-mute)] mb-2">
        BibTeX · {citation.label}
      </div>
      <pre className="bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12px] overflow-x-auto leading-snug whitespace-pre">
        <code>{citation.bibtex}</code>
      </pre>
    </div>
  );
}
