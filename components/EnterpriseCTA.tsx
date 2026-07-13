'use client';

import { useState } from 'react';

// The ONE gated conversation the (ungated, public) whitepaper earns: an
// enterprise / procurement CTA. Sits at the bottom of /whitepaper. Submits to
// /api/enterprise, which reuses the Brevo lead plumbing (tagged source
// `enterprise_procurement`) and is fail-soft - a degraded Brevo degrades to
// "logged", never an error to the visitor.
//
// Amber discipline: this is a neutral block carrying the brand via a single
// amber accent dot. The form is plain Ink/Rule; no amber fill/flood.
export function EnterpriseCTA({
  title = 'Request the security & procurement pack',
  blurb = 'Talk to us about enterprise: the multi-tenant in-path gateway, SLA + DPA, sub-processor list, and the security review band from the whitepaper. Tell us where to reach you and what you are evaluating.',
}: {
  title?: string;
  blurb?: string;
}) {
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState('submitting');
    try {
      const res = await fetch('/api/enterprise', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: fd.get('email'),
          company: fd.get('company'),
          message: fd.get('message'),
        }),
      });
      setState(res.ok ? 'success' : 'error');
    } catch {
      setState('error');
    }
  }

  return (
    <section className="rule-t rule-b rule-l rule-r bg-white p-6 sm:p-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" aria-hidden="true" />
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          Enterprise
        </div>
      </div>
      <h2 className="t-h4 font-medium text-[var(--color-ink)]">{title}</h2>

      {state === 'success' ? (
        <p className="mt-4 text-[14px] leading-[1.6] text-[var(--color-cite)]">
          Thanks. We have your request and will be in touch with the security &amp; procurement
          pack shortly. The whitepaper itself is free above &mdash; no wall.
        </p>
      ) : (
        <>
          <p className="mt-3 text-[14px] leading-[1.55] text-[var(--color-cite)]">
            {blurb}
          </p>
          <form onSubmit={onSubmit} className="mt-6 grid gap-3 sm:grid-cols-2">
            <Field label="Work email" name="email" type="email" required placeholder="you@company.com" />
            <Field label="Company" name="company" placeholder="Acme Inc." />
            <div className="sm:col-span-2">
              <Field
                label="What are you evaluating?"
                name="message"
                textarea
                placeholder="Hosts in use, tenant count, the procurement timeline, anything specific."
              />
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={state === 'submitting'}
                className="font-mono text-[12px] uppercase tracking-[0.16em] text-white bg-[var(--color-ink)] px-6 py-3 hover:bg-[var(--color-accent)] transition-colors disabled:opacity-60"
              >
                {state === 'submitting' ? <>Sending&hellip;</> : <>Request the pack &rarr;</>}
              </button>
              {state === 'error' && (
                <p className="font-mono text-[12px] text-[var(--color-cite)]">
                  Something went wrong. Try again, or email{' '}
                  <a
                    href="mailto:hello@mcpindex.ai"
                    className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
                  >
                    hello@mcpindex.ai
                  </a>
                  .
                </p>
              )}
              <span className="font-mono text-[11px] text-[var(--color-mute)]">
                No email wall on the paper &mdash; this is only for procurement / design-partner access.
              </span>
            </div>
          </form>
        </>
      )}
    </section>
  );
}

function Field({
  label,
  name,
  type = 'text',
  required,
  textarea,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  textarea?: boolean;
  placeholder?: string;
}) {
  const cls =
    'mt-1 w-full rule-t rule-b rule-l rule-r px-3 py-2 font-mono text-[13px] text-[var(--color-ink)] ' +
    'placeholder-[var(--color-mute)] outline-none bg-white focus:border-[var(--color-accent)]';
  return (
    <label className="block">
      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
        {label}
      </span>
      {textarea ? (
        <textarea name={name} required={required} placeholder={placeholder} rows={3} className={cls} />
      ) : (
        <input name={name} type={type} required={required} placeholder={placeholder} className={cls} />
      )}
    </label>
  );
}
