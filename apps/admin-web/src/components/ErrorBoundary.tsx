import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  failed: boolean;
}

// Keeps a render error inside one page: without this, React unmounts the whole app and leaves an empty screen.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page crashed", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="p-4">
        <div className="empty-state bg-surface" role="alert">
          <p className="text-lg font-bold text-foreground">Halaman ini gagal ditampilkan</p>
          <p className="max-w-md text-sm">Data dari server tidak sesuai dengan aplikasi. Pastikan API sudah versi terbaru, lalu coba lagi.</p>
          <button
            type="button"
            className="mt-2 min-h-11 rounded-full bg-primary px-5 font-bold text-primary-foreground hover:bg-primary-pressed"
            onClick={() => this.setState({ failed: false })}
          >
            Coba lagi
          </button>
        </div>
      </div>
    );
  }
}
