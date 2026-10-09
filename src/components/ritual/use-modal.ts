"use client";

import { useEffect, useRef } from "react";

// Full-screen moments and sheets behave as dialogs: focus moves in, everything behind them
// is inert (no Tab, nothing read aloud), Escape closes only the top-most one, and focus
// goes back to whatever opened it. Live regions (the toast) stay reachable.
export function useModal<T extends HTMLElement>(onEscape?: () => void) {
  const ref = useRef<T>(null);
  const escape = useRef(onEscape);
  useEffect(() => { escape.current = onEscape; });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const hidden: Element[] = [];
    for (let element: Element = node; element.parentElement && element !== document.body; element = element.parentElement) {
      for (const sibling of Array.from(element.parentElement.children)) {
        if (sibling === element || sibling.hasAttribute("inert") || sibling.matches("script, style, [aria-live]")) continue;
        sibling.setAttribute("inert", "");
        hidden.push(sibling);
      }
    }
    // A field that focused itself keeps focus; otherwise the dialog itself takes it.
    if (!node.contains(document.activeElement)) {
      if (!node.hasAttribute("tabindex")) node.tabIndex = -1;
      node.focus({ preventScroll: true });
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !escape.current || node.closest("[inert]")) return;
      event.preventDefault();
      escape.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      for (const element of hidden) element.removeAttribute("inert");
      if (opener?.isConnected && !opener.closest("[inert]")) opener.focus({ preventScroll: true });
    };
  }, []);

  return ref;
}
