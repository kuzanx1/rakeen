"use client";

import { useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import "./rakeen-pos.css";
import "./rakeen-pos-additions.css";
import { posMarkup } from "./pos-markup";

const SCRIPT_SRC = "/pos/rakeen-pos.js";

declare global {
  interface Window {
    supabaseClient?: ReturnType<typeof createBrowserClient>;
  }
}

export default function POSPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    document.documentElement.setAttribute("data-theme", "light");
    container.innerHTML = posMarkup;

    window.supabaseClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    document.body.appendChild(script);

    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker
          .register("/pos-sw.js")
          .then((reg) => reg.update())
          .catch(() => {
            // installability/offline shell caching is a progressive enhancement — a
            // failed registration shouldn't block the POS itself from working
          });
      } else {
        // dev mode: an old production SW from a previous build can otherwise
        // keep serving a stale app shell under Turbopack's dev server
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((reg) => reg.unregister());
        });
      }
    }

    return () => {
      script.remove();
      delete (window as unknown as { __rakeenPosBooted?: boolean }).__rakeenPosBooted;
      delete window.supabaseClient;
      container.innerHTML = "";
    };
  }, []);

  return <div ref={containerRef} style={{ display: "contents" }} />;
}
