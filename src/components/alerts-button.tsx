"use client";

import { Dialog } from "radix-ui";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ALERT_BANDS, ALERT_LEVELS, PROFILES, type AqiLevel } from "@/lib/bands";
import { titleCase } from "@/lib/format";
import { isIos } from "@/lib/platform";
import { useAreaChoice, useProfileChoice, useStoredChoice } from "@/lib/use-stored-choice";
import { AreaSelect } from "./area-select";
import { Segmented } from "./segmented";
import { chromeButton, pill } from "./styles";

const LEVELS = ALERT_BANDS.map((b) => ({
  value: b.level,
  label: (
    <>
      {b.label} <span className="opacity-70">{b.min}+</span>
    </>
  ),
}));

type Support = "yes" | "ios-install" | "no";
const detectSupport = (): Support =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "yes" : isIos() ? "ios-install" : "no";
const noSubscribe = () => () => {};

/** The VAPID public key as bytes, which every browser accepts as applicationServerKey. */
function keyBytes(base64url: string) {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration();
  return { reg, sub: (await reg?.pushManager.getSubscription()) ?? null };
}

async function callApi(method: "POST" | "DELETE", body: unknown) {
  const res = await fetch("/api/push", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "request failed");
}

/**
 * Header bell that opens the haze-alert settings: pick an area, the 1-hr AQI level to be alerted at,
 * and whose advice to show. Subscribing asks for notification permission and registers this
 * browser's push subscription with the server.
 */
export function AlertsButton({ vapidKey }: { vapidKey: string }) {
  const support = useSyncExternalStore(noSubscribe, detectSupport, () => null);
  const [region, setRegion] = useAreaChoice();
  const [level, setLevel] = useStoredChoice<AqiLevel>("hazelite:alert-level", ALERT_LEVELS, "unhealthy");
  const [profile, setProfile] = useProfileChoice();
  const [updates, setUpdates] = useStoredChoice("hazelite:update-alerts", ["on", "off"], "off");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (support !== "yes") return;
    currentSubscription()
      .then(({ sub }) => setSubscribed(!!sub))
      .catch(() => {});
  }, [support]);

  if (support === null) return null;

  const run = (task: () => Promise<string>) => async () => {
    setBusy(true);
    setStatus(null);
    try {
      setStatus(await task());
    } catch (err) {
      setStatus(err instanceof Error ? `Something went wrong: ${err.message}.` : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const turnOn = run(async () => {
    if ((await Notification.requestPermission()) !== "granted") {
      return "Notifications are blocked for this site. Allow them in your browser's site settings, then try again.";
    }
    const { reg, sub } = await currentSubscription();
    if (!reg) return "Alerts need the app's service worker, which isn't running. Reload the page and try again.";
    const subscription = sub ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
    await callApi("POST", { subscription: subscription.toJSON(), region, level, profile, updates: updates === "on" });
    setSubscribed(true);
    return `Alerts are on for ${titleCase(region)}.`;
  });

  const turnOff = run(async () => {
    const { sub } = await currentSubscription();
    if (sub) {
      await callApi("DELETE", { endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
    setSubscribed(false);
    return "Alerts are off.";
  });

  return (
    <Dialog.Root>
      <Dialog.Trigger
        aria-label={subscribed ? "Haze alerts (on)" : "Haze alerts"}
        title="Haze alerts"
        className={`relative grid size-9 place-items-center ${chromeButton}`}
      >
        <svg width="1.125rem" height="1.125rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {subscribed && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[var(--status-good)]" aria-hidden />}
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-surface p-5 text-sm text-ink shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-base font-semibold">Haze alerts</Dialog.Title>
            <Dialog.Close aria-label="Close" className={`grid size-8 place-items-center ${chromeButton}`}>
              <svg width="1rem" height="1rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-ink-2">
            The dragon will ping you when 1-hr AQI in your area reaches the level you choose, and again when it clears. 🐉🔔
          </Dialog.Description>

          {support === "ios-install" ? (
            <p className="mt-4 rounded-lg border border-border p-3">
              On iPhone and iPad, alerts work in the installed app: tap Share, choose &ldquo;Add to Home Screen&rdquo;, open Hazelite
              from your Home Screen, then turn alerts on here.
            </p>
          ) : support === "no" ? (
            <p className="mt-4 rounded-lg border border-border p-3">This browser doesn&apos;t support notifications.</p>
          ) : (
            <>
              <div className="mt-4 space-y-3">
                <AreaSelect value={region} onChange={setRegion} className="justify-between" />
                <div>
                  <div className="mb-1.5 text-ink-2">Alert me at</div>
                  <Segmented label="Alert level" value={level} options={LEVELS} onChange={setLevel} />
                </div>
                <div>
                  <div className="mb-1.5 text-ink-2">Advice for</div>
                  <Segmented label="Health profile" value={profile} options={PROFILES} onChange={setProfile} />
                </div>
                <label className="flex items-center gap-2 text-ink-2">
                  <input
                    type="checkbox"
                    checked={updates === "on"}
                    onChange={(e) => setUpdates(e.target.checked ? "on" : "off")}
                    className="size-4 accent-[var(--ink)]"
                  />
                  Also tell me when Hazelite is updated
                </label>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={turnOn} disabled={busy} className="rounded-full bg-ink px-4 py-1.5 font-medium text-page transition-opacity hover:opacity-90 disabled:opacity-60">
                  {subscribed ? "Save changes" : "Turn on alerts"}
                </button>
                {subscribed && (
                  <button type="button" onClick={turnOff} disabled={busy} className={`${pill(false)} disabled:opacity-60`}>
                    Turn off
                  </button>
                )}
              </div>
            </>
          )}

          <p className="mt-3 min-h-5 text-ink-2" role="status">
            {busy ? "Working…" : status}
          </p>
          <p className="mt-2 text-xs text-muted">
            Hazelite stores only your browser&apos;s push address and these choices, and checks readings hourly.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
