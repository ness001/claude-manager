// Top-level React error boundary — see spec §17 (error states).
//
// Without this, an unhandled render error in any section blanks the entire
// window with no user-facing feedback. The fallback shows the error message
// and a Reload button so users can recover without restarting the app.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("Unhandled render error:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div
          data-testid="error-boundary-fallback"
          role="alert"
          className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
        >
          <h1 className="text-xl font-semibold text-text-primary">
            Something went wrong
          </h1>
          <p className="max-w-md text-sm text-text-secondary">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="error-boundary-retry"
              onClick={this.reset}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
            >
              Try again
            </button>
            <button
              type="button"
              data-testid="error-boundary-reload"
              onClick={() => window.location.reload()}
              className="rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
