import type { ReactNode } from "react";
import { createPortal } from "react-dom";

// Rendered on <body>: a dialog opened from inside the translucent order panel would otherwise be
// clipped to it, because backdrop-filter makes the panel the containing block for fixed children.
export function Dialog({ title, children }: { title: string; children: ReactNode }) {
  return createPortal(
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dialog-panel">
        <h2 className="t-title">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
