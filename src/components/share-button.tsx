"use client";

import { useState } from "react";

/** Shares a text summary and link via the native share sheet, or copies it where sharing isn't available. */
export function ShareButton({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = location.origin;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // The viewer closed the share sheet; nothing to do.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context); the button simply does nothing.
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-ink-2 transition-colors hover:bg-grid hover:text-ink focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
    >
      <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8" />
      </svg>
      <span aria-live="polite">{copied ? "Copied!" : "Share"}</span>
    </button>
  );
}
