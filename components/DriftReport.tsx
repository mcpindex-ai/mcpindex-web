import Link from 'next/link';
import type { Ledger } from '@/lib/ledger';
import { buildDigest } from '@/lib/driftDigest';

// The on-site Drift Report: a live, auto-publishing digest of this week's contract
// changes, computed server-side from the ledger the /ledger page already loads.
// Contract-diff, not a safety verdict. Fingerprinted: recomputable keyed hashes of registry names.

export function DriftReport({ ledger }: { ledger: Ledger }) {
  const { stat, events } = ledger;
  // On a /3 ledger `events` holds only tools that changed outside publisher-wide changes, so the
  // digest below describes that set, and the lede says so.
  const { standouts, benign } = buildDigest(events);
  const asOf = ledger.generated_at?.slice(0, 10) || '';
  const ind = stat.independent;
  const isV3 = ledger.fleet_events !== undefined;
  const overlap = ind
    ? Math.max(0, ind.tools_observed_drifting + ind.fleet_tools - stat.tools_observed_drifting)
    : 0;

  return (
    <section className="mt-12 rule-t pt-8">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        The Drift Report{asOf ? ` · as of ${asOf}` : ''}
      </div>
      {ind ? (
      <p className="mt-4 text-[15.5px] leading-[1.6] text-[var(--color-cite)] max-w-2xl">
        Since tracking began, the crawler has observed{' '}
        <strong className="text-[var(--color-ink)]">{ind.tools_observed_drifting.toLocaleString()}</strong>{' '}
        tools across{' '}
        <strong className="text-[var(--color-ink)]">{ind.servers.toLocaleString()}</strong> servers
        change their contract outside publisher-wide changes, {ind.safety_relevant.toLocaleString()} of
        them in a safety-relevant way.
        {typeof ind.silent_same_version === 'number' && (
          <>
            {' '}
            {ind.silent_same_version.toLocaleString()} of those{' '}
            {ind.tools_observed_drifting.toLocaleString()} drifting tools have only ever changed
            with their declared version unchanged, where version evidence exists.
          </>
        )}{' '}
        {`${ind.fleet_changes.toLocaleString()} publisher-wide tool change${ind.fleet_changes === 1 ? '' : 's'}`},
        each one publisher making a change of the same kind on at least 10 of its servers in one day,
        touched{' '}
        {ind.fleet_tools.toLocaleString()} tools
        {overlap > 0 ? `, ${overlap.toLocaleString()} of which also changed on their own` : ''}.
        Counting every tool, the totals are{' '}
        {stat.tools_observed_drifting.toLocaleString()} tools across {stat.servers.toLocaleString()}{' '}
        servers. Outside publisher-wide changes, {benign.toLocaleString()} tools added an optional
        parameter, which a gate should let through silently; not crying wolf on benign change is the
        point. Here are the ones that would actually surprise an agent mid-session.
      </p>
      ) : isV3 ? (
      // /3 whose twin failed validation: the totals are still true, but `events` (and so the
      // benign count and the standouts below) cover only tools outside publisher-wide changes,
      // so the "most drift is harmless" comparison against the totals is not made.
      <p className="mt-4 text-[15.5px] leading-[1.6] text-[var(--color-cite)] max-w-2xl">
        Since tracking began, the crawler has observed{' '}
        <strong className="text-[var(--color-ink)]">{stat.tools_observed_drifting.toLocaleString()}</strong>{' '}
        tools across{' '}
        <strong className="text-[var(--color-ink)]">{stat.servers.toLocaleString()}</strong> servers
        change their contract, including publisher-wide changes that touch many servers at once. The
        breakdown below covers only tools that changed outside those.
      </p>
      ) : (
      <p className="mt-4 text-[15.5px] leading-[1.6] text-[var(--color-cite)] max-w-2xl">
        Since tracking began, the crawler has observed{' '}
        <strong className="text-[var(--color-ink)]">{stat.tools_observed_drifting.toLocaleString()}</strong>{' '}
        tools across{' '}
        <strong className="text-[var(--color-ink)]">{stat.servers.toLocaleString()}</strong> servers
        change their contract, {stat.safety_relevant.toLocaleString()} of them in a safety-relevant way.
        {typeof stat.silent_same_version === 'number' && (
          <>
            {' '}
            {stat.silent_same_version.toLocaleString()} of the{' '}
            {stat.tools_observed_drifting.toLocaleString()} drifting tools have only ever changed
            with their declared version unchanged, where version evidence exists.
          </>
        )}
        Most drift is harmless: {benign.toLocaleString()} just added an optional parameter, and a gate
        should proceed silently on those. Not crying wolf on benign change is the point. Here are the
        ones that would actually surprise an agent mid-session.
      </p>
      )}

      {standouts.length > 0 && (
        <ul className="mt-6 space-y-3">
          {standouts.map((s) => (
            <li key={s.kind} className="text-[15px] leading-[1.55] text-[var(--color-cite)]">
              <strong className="font-mono text-[var(--color-ink)] tabular-nums">
                {s.count.toLocaleString()}
              </strong>{' '}
              tools {s.label}.
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-[15.5px] leading-[1.6] text-[var(--color-ink)] max-w-2xl">
        Auth is not built to catch this class of change. A server that edits a tool&rsquo;s contract
        keeps its API key, its allow-list entry, and its name in your config - access control answers
        who may call a tool, not whether the tool still does what it declared when you connected it.
        The failure mode with MCP is rarely &ldquo;I connected a bad server on day one.&rdquo; It is
        &ldquo;I connected a good server that changed on day 30.&rdquo;
      </p>

      <p className="mt-4 font-mono text-[11px] leading-[1.6] text-[var(--color-mute)] max-w-2xl">
        A contract diff, observed between snapshots. Not a safety verdict, not a claim any change is
        malicious, and not prevention: the ledger observes, the gate holds. Entries are fingerprints:
        keyed hashes of public registry names that anyone can recompute, so they identify a server
        without printing its name. Numbers update daily and are self-verifiable at{' '}
        <Link href="/api/v1/ledger" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
          /api/v1/ledger
        </Link>
        .
      </p>

      <div className="mt-5">
        <Link
          href="/demo"
          className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--color-ink)] border border-[var(--color-rule)] px-3 py-1.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
        >
          pin and HOLD drift in your setup →
        </Link>
      </div>
    </section>
  );
}
