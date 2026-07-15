/** Shared progressive-disclosure - matches homepage/docs mono summary style. */
export function Disclose({
  summary,
  children,
  className = '',
}: {
  summary: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details
      className={`text-[13px] leading-[1.55] text-[var(--color-mute)] ${className}`.trim()}
    >
      <summary className="cursor-pointer font-mono text-[11.5px] uppercase tracking-[0.12em] text-[var(--color-cite)] hover:text-[var(--color-ink)] list-outside pl-1">
        {summary}
      </summary>
      <div className="mt-4 text-[14.5px] leading-[1.55] text-[var(--color-cite)]">{children}</div>
    </details>
  );
}
