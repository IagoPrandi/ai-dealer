"use client";

import { useEffect } from "react";

function canRegisterServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }

  const { hostname } = window.location;
  return (
    window.isSecureContext ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

export function PwaRegistrar() {
  useEffect(() => {
    if (!canRegisterServiceWorker()) {
      console.info(
        "[pwa] Service worker skipped. Installable PWA mode requires HTTPS or localhost.",
      );
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js")
      .catch((error: unknown) => {
        console.error("[pwa] Service worker registration failed.", error);
      });
  }, []);

  return null;
}
