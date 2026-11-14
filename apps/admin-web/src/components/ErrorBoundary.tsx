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
      <div className="p-4 md:p-6">
        <div className="empty-state bg-surface" role="alert">
          <p className="t-title text-foreground">Halaman ini gagal ditampilkan</p>
          <p className="max-w-md text-sm">Data dari server tidak sesuai dengan aplikasi. Pastikan API sudah versi terbaru, lalu coba lagi.</p>
          <button type="button" className="btn btn-primary mt-2" onClick={() => this.setState({ failed: false })}>
            Coba lagi
          </button>
        </div>
      </div>
    );
  }
}
