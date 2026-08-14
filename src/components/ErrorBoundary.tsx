import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors in the page below it so one bad page shows a
 * recoverable message instead of blanking the whole site. Rendered inside
 * Layout, so the header and nav survive and the reader can click away to
 * a working page.
 *
 * Has to be a class - there is no hook equivalent for componentDidCatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No error-reporting service wired up; the console is what we have.
    console.error("Page crashed:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
        <div>
          <p className="text-lg font-semibold text-primary">This page hit a snag</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Something broke while rendering. The rest of the site still works — try again, or
            pick another tab above.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-body transition-colors hover:bg-surface-2"
          >
            Reload page
          </button>
        </div>

        <details className="max-w-full px-4 text-left">
          <summary className="cursor-pointer text-xs text-muted hover:text-body">
            Technical details
          </summary>
          <pre className="mt-2 max-w-full overflow-x-auto rounded-lg border border-line bg-surface p-3 text-left text-xs text-muted">
            {error.message}
          </pre>
        </details>
      </div>
    );
  }
}
