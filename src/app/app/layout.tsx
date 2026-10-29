import type { ReactNode } from "react";

/**
 * Workspace layout. Toasts live on the root layout so we do not nest two
 * providers (the inner one would swallow notifications from the outer).
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return children;
}
