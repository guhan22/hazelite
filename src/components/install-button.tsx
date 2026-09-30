"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isIos, isStandalone } from "@/lib/platform";
import { chromeButton } from "./styles";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "installed" | "ios" | "other";

const detectPlatform = (): Platform => (isStandalone() ? "installed" : isIos() ? "ios" : "other");

const noSubscribe = () => () => {};

/**
 * "Install" in the header. Chrome, Edge and Android offer a native prompt; iOS Safari has none, so it
 * shows the Share → Add to Home Screen steps instead. Hidden once running as an installed app.
 */
export function InstallButton() {
  // null on the server and during hydration; the real platform is known after.
  const platform = useSyncExternalStore(noSubscribe, detectPlatform, () => null);
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it for our button instead of the browser's mini-infobar
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || platform === null || platform === "installed" || (platform === "other" && !prompt)) return null;

  const onClick = async () => {
    if (!prompt) return setShowSteps((s) => !s);
    await prompt.prompt();
    if ((await prompt.userChoice).outcome === "accepted") setInstalled(true);
    setPrompt(null); // a prompt can only be used once
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        aria-expanded={prompt ? undefined : showSteps}
        className={`inline-flex h-9 items-center gap-1.5 px-3 text-sm ${chromeButton}`}
      >
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
        Install
      </button>
      {showSteps && (
        <div role="dialog" aria-label="Add to Home Screen" className="absolute right-0 top-11 z-20 w-64 rounded-lg border border-border bg-surface p-3 text-sm shadow-lg">
          <p className="font-medium">Add Hazelite to your Home Screen</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-ink-2">
            <li>
              Tap the Share button{" "}
              <svg className="inline" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share">
                <path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8" />
              </svg>{" "}
              in Safari
            </li>
            <li>Choose &ldquo;Add to Home Screen&rdquo;</li>
          </ol>
        </div>
      )}
    </div>
  );
}
