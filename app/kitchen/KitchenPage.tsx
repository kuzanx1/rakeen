"use client";

import { useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import "./rakeen-kitchen.css";
import { kitchenMarkup } from "./kitchen-markup";

const SCRIPT_SRC = "/kitchen/rakeen-kitchen.js";

declare global {
  interface Window {
    supabaseClient?: ReturnType<typeof createBrowserClient>;
  }
}

export default function KitchenPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = kitchenMarkup;

    window.supabaseClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    document.body.appendChild(script);

    return () => {
      script.remove();
      delete window.supabaseClient;
      container.innerHTML = "";
    };
  }, []);

  return <div ref={containerRef} style={{ display: "contents" }} />;
}
