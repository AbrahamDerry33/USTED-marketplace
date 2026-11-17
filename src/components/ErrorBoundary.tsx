import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let displayMessage = 'Something went wrong while loading this page.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string };
      if (parsed && parsed.error) {
        displayMessage =
          parsed.error.includes('Missing or insufficient permissions')
            ? 'You do not have permission to perform this action. Verify your school email and try again.'
            : parsed.error;
      }
    } catch {
      if (error.message) {
        displayMessage = error.message;
      }
    }
    return { hasError: true, message: displayMessage };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-white border border-stone-200 rounded-xl p-6 text-center space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Unable to complete request</h2>
            <p className="text-sm text-zinc-600">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-950 transition-colors"
            >
              Return to Marketplace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
