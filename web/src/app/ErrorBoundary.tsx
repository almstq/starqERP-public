/**
 * SERP-301 — frontend errors captured, reported, and never shown as a stack.
 *
 * WHAT WAS THERE. Nothing. There was no error boundary anywhere in this
 * application. React's default for an uncaught render error is to UNMOUNT THE
 * WHOLE TREE, so a single bad field access in one view left the user staring at
 * a white page — no message, no way back, and no report reaching anybody. On a
 * system people are supposed to run a business on, that is indistinguishable
 * from the browser crashing.
 *
 * THE TWO HALVES OF THE ACCEPTANCE CRITERION, WHICH PULL AGAINST EACH OTHER:
 * errors must be CAPTURED AND REPORTED, and stack traces must NOT REACH THE
 * USER. A stack trace in a support screenshot leaks file paths, internal route
 * names and sometimes the values that were in scope. So the user gets a calm
 * message and a CORRELATION ID; the id is what makes the report findable
 * without ever putting the detail on screen.
 *
 * WHAT IS DELIBERATELY NOT REPORTED: the error MESSAGE. A thrown message
 * routinely interpolates whatever was being processed — a customer name, an
 * invoice number, an amount — and telemetry's whole invariant is that it never
 * carries the client's business. Only the error's CONSTRUCTOR NAME goes out,
 * which is bounded and says what kind of failure it was without saying what it
 * was working on.
 */

import React from 'react';
import { telemetry } from '../services/telemetry';

function correlationId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Older browsers, or a non-secure context. An id that is merely unlikely to
    // collide still does the only job asked of it: matching a screenshot to a
    // report.
    return `fe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Bounded and non-sensitive. `error_kind`, never `name` — telemetry refuses `name`. */
function report(kind: string, id: string, boundary: string): void {
  try {
    telemetry.track('error_occurred', {
      error_kind: kind.slice(0, 64),
      correlation_id: id,
      boundary,
    });
  } catch {
    // Reporting an error must never itself throw into the render that is
    // already failing.
  }
}

interface Props {
  children: React.ReactNode;
  /** Names the region, so a report says which part of the app fell over. */
  boundary?: string;
}

interface State {
  failed: boolean;
  id: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false, id: '' };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true, id: correlationId() };
  }

  componentDidCatch(error: Error): void {
    // this.state.id is already set by getDerivedStateFromError, which React runs
    // first. Reading it here keeps one id across the render and the report — two
    // ids would mean the number on the user's screen matched nothing.
    report(error?.name ?? 'Error', this.state.id, this.props.boundary ?? 'root');
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div
        role="alert"
        className="min-h-[60vh] flex items-center justify-center px-8"
        style={{ color: 'var(--md-sys-color-on-surface)' }}
      >
        <div
          className="max-w-md w-full p-8 space-y-5 text-center"
          style={{
            background: 'var(--md-sys-color-surface-container)',
            border: '1px solid var(--md-sys-color-outline-variant)',
            borderRadius: 'var(--md-sys-shape-corner-large)',
          }}
        >
          <h1 className="text-base font-semibold">This screen could not be displayed</h1>
          <p className="text-sm" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
            Nothing you entered has been lost. The problem has been recorded and can be looked up
            with the reference below.
          </p>
          <p
            className="mono-num text-xs px-3 py-2 rounded select-all"
            style={{ background: 'var(--md-sys-color-surface-container-high)' }}
          >
            {this.state.id}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm font-medium px-5 py-2.5 rounded-full"
            style={{
              background: 'var(--md-sys-color-primary)',
              color: 'var(--md-sys-color-on-primary)',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

/**
 * Errors that never reach a boundary: those thrown outside React's render cycle
 * — in an event handler, a timer, or a rejected promise nobody awaited. A
 * boundary alone would leave the largest category of production errors
 * completely unobserved.
 *
 * These are recorded and NOT surfaced. The page is still usable; interrupting
 * somebody mid-invoice because a background fetch rejected would be a worse
 * experience than the failure itself.
 *
 * Returns a teardown so tests can install and remove it without leaking
 * listeners between cases.
 */
export function installGlobalErrorReporting(target: Window = window): () => void {
  const onError = (event: ErrorEvent) => {
    report(event?.error?.name ?? 'Error', correlationId(), 'window.onerror');
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event?.reason;
    report(
      reason instanceof Error ? reason.name : typeof reason,
      correlationId(),
      'unhandledrejection',
    );
  };

  target.addEventListener('error', onError as EventListener);
  target.addEventListener('unhandledrejection', onRejection as EventListener);
  return () => {
    target.removeEventListener('error', onError as EventListener);
    target.removeEventListener('unhandledrejection', onRejection as EventListener);
  };
}
