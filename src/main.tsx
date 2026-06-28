import { Component, StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Umbrella Parade Writer crashed", error);
  }

  resetStorage = () => {
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith("umbrella-parade-writer:"))
        .forEach((key) => localStorage.removeItem(key));
    } catch (error) {
      console.warn("Unable to clear local app storage", error);
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="app-error">
        <h1>Umbrella Parade Writer</h1>
        <p>保存データの読み込みで問題が起きました。画像が大きすぎる場合は、保存データをリセットすると開けます。</p>
        <button onClick={this.resetStorage}>保存データをリセットして開く</button>
      </main>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
