"use client";

import { useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import "./rakeen-order.css";
import { orderMarkup } from "./order-markup";

const SCRIPT_SRC = "/order/rakeen-order.js";

declare global {
  interface Window {
    supabaseClient?: ReturnType<typeof createBrowserClient>;
    RAKEEN_ORDER_SLUG?: string;
    __rakeenOrderBooted?: boolean;
  }
}

export default function OrderMenuPage({ slug }: { slug: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = orderMarkup;
    window.RAKEEN_ORDER_SLUG = slug;

    window.supabaseClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    document.body.appendChild(script);

    return () => {
      script.remove();
      delete window.__rakeenOrderBooted;
      delete window.supabaseClient;
      delete window.RAKEEN_ORDER_SLUG;
      container.innerHTML = "";
    };
  }, [slug]);

  return <div ref={containerRef} style={{ display: "contents" }} />;
}
