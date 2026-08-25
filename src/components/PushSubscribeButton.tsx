"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

type SubscriptionState = "idle" | "loading" | "subscribed" | "unsupported" | "denied" | "error";

/**
 * Botn de suscripcin a notificaciones push del navegador.
 * Se registra como Service Worker y usa la Push API para suscribirse.
 * Enva la suscripcin al backend (POST /api/notifications/push-subscribe).
 */
export function PushSubscribeButton() {
  const [state, setState] = useState<SubscriptionState>("idle");
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  // ── Initialize on mount ─────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      // 1. Check browser support
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }

      // 2. Check notification permission
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }

      try {
        // 3. Register service worker
        const reg = await navigator.serviceWorker.register("/sw.js");
        setSwRegistration(reg);

        // 4. Fetch VAPID public key from server
        const res = await fetch("/api/notifications/push-subscribe");
        const data = await res.json();
        setPublicKey(data.publicKey);

        if (!data.publicKey) {
          setState("unsupported");
          return;
        }

        // 5. Check if already subscribed
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setState("subscribed");
        } else {
          setState("idle");
        }
      } catch {
        setState("error");
      }
    }

    init();
  }, []);

  // ── Subscribe ───────────────────────────────────────────────────────
  const subscribe = useCallback(async () => {
    if (!swRegistration || !publicKey) return;

    setState("loading");

    try {
      const keyBytes = urlBase64ToUint8Array(publicKey);

      const subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes as unknown as BufferSource,
      });

      // Send subscription to our server
      const res = await fetch("/api/notifications/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to register subscription on server");
      }

      setState("subscribed");
    } catch (err) {
      console.error("[PushSubscribe] Subscribe failed:", err);
      setState("error");
    }
  }, [swRegistration, publicKey]);

  // ── Unsubscribe ─────────────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    if (!swRegistration) return;

    setState("loading");

    try {
      const sub = await swRegistration.pushManager.getSubscription();
      if (sub) {
        // Tell our server to deactivate
        await fetch("/api/notifications/push-subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });

        // Unsubscribe from browser
        await sub.unsubscribe();
      }

      setState("idle");
    } catch (err) {
      console.error("[PushSubscribe] Unsubscribe failed:", err);
      setState("error");
    }
  }, [swRegistration]);

  // ── Render ──────────────────────────────────────────────────────────

  // States that don't render a button
  if (state === "unsupported") {
    return (
      <div className="flex items-center gap-2 text-2xs text-muted-fg/70">
        <BellOff size={14} />
        Push no soportado en este navegador
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="flex items-center gap-2 text-2xs text-chart-warning/80">
        <BellOff size={14} />
        Notificaciones bloqueadas
      </div>
    );
  }

  return (
    <button
      onClick={state === "subscribed" ? unsubscribe : subscribe}
      disabled={state === "loading" || state === "error"}
      className={`flex items-center gap-2 text-xs px-4 py-2 rounded-lg border transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        state === "subscribed"
          ? "bg-chart-success/10 border-chart-success/30 text-chart-success hover:bg-chart-success/15"
          : "bg-muted/30 border-border/60 text-muted-fg hover:bg-muted/50 hover:text-foreground"
      }`}
    >
      {state === "loading" ? (
        <Loader2 size={14} className="animate-spin" />
      ) : state === "subscribed" ? (
        <Bell size={14} />
      ) : (
        <BellOff size={14} />
      )}
      {state === "loading"
        ? "Configurando..."
        : state === "subscribed"
        ? "Notificaciones activas"
        : state === "error"
        ? "Error, reintentar"
        : "Activar notificaciones"}
    </button>
  );
}

// ─── Helper: Convert base64url string to Uint8Array ───────────────────
// Required by pushManager.subscribe() for the applicationServerKey

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
