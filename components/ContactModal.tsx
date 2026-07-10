'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Shared in-browser contact modal. Replaces mailto: CTAs (which launch the OS
// mail app and dead-end webmail users) across the site: the pricing Enterprise
// tier and the footer "Contact". Submits to /api/waitlist, which routes the
// lead into Brevo (contact + welcome email + operator notification).
export type ContactVariant = 'enterprise' | 'contact';

const COPY: Record<ContactVariant, { title: string; blurb: string }> = {
  enterprise: {
    title: 'Contact sales',
    blurb: 'Tell us about your use case and we will be in touch.',
  },
  contact: {
    title: 'Contact us',
    blurb: 'Tell us what you need and we will get back to you.',
  },
};

// A trigger button that owns the modal's open state. className lets callers style
// it as a pricing button or a plain footer link. The modal is mounted only while
// open, so each open starts from fresh state.
export function ContactTrigger({
  variant,
  className,
  children,
}: {
  variant: ContactVariant;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus(); // restore focus to the trigger
  }, []);

  return (
    <>
      <button ref={triggerRef} type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <ContactModal variant={variant} onClose={close} />}
    </>
  );
}

function ContactModal({ variant, onClose }: { variant: ContactVariant; onClose: () => void }) {
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const emailRef = useRef<HTMLInputElement>(null);
  const titleId = `contact-${variant}-title`;
  const { title, blurb } = COPY[variant];

  useEffect(() => {
    const t = setTimeout(() => emailRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden'; // scroll lock
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState('submitting');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: fd.get('email'),
          company: fd.get('company'),
          message: fd.get('message'),
          variant,
        }),
      });
      setState(res.ok ? 'success' : 'error');
    } catch {
      setState('error');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(); // backdrop click closes
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[440px] bg-white rule-t rule-b rule-l rule-r p-6 sm:p-8"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
              {variant}
            </div>
            <h2 id={titleId} className="mt-2 t-h4 font-medium text-[var(--color-ink)]">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="font-mono text-[18px] leading-none text-[var(--color-mute)] hover:text-[var(--color-ink)]"
          >
            &times;
          </button>
        </div>

        {state === 'success' ? (
          <p className="mt-6 text-[14px] leading-[1.55] text-[var(--color-cite)]">
            {'Thanks - we will be in touch shortly. Check your inbox for a confirmation.'}
          </p>
        ) : (
          <>
            <p className="mt-2 text-[13px] leading-[1.5] text-[var(--color-cite)]">{blurb}</p>
            <form onSubmit={onSubmit} className="mt-5 space-y-3">
              <Field
                label="Email"
                name="email"
                type="email"
                required
                placeholder="you@company.com"
                inputRef={emailRef}
              />
              <Field label="Company" name="company" placeholder="Acme Inc." />
              <Field label="Message" name="message" textarea placeholder="What are you building?" />
              {state === 'error' && (
                <p className="font-mono text-[12px] text-[var(--color-accent)]">
                  {'Something went wrong. Try again, or email hello@mcpindex.ai.'}
                </p>
              )}
              <button
                type="submit"
                disabled={state === 'submitting'}
                className="w-full font-mono text-[12px] uppercase tracking-[0.16em] text-white bg-[var(--color-ink)] px-5 py-3 hover:bg-[var(--color-accent)] transition-colors disabled:opacity-60"
              >
                {state === 'submitting' ? <>Sending...</> : <>Request &rarr;</>}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = 'text',
  required,
  textarea,
  placeholder,
  inputRef,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  textarea?: boolean;
  placeholder?: string;
  inputRef?: React.Ref<HTMLInputElement>;
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
        <input
          ref={inputRef}
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </label>
  );
}
