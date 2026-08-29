"use client";

import { useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import "./rakeen-book.css";
import { bookMarkup } from "./book-markup";

const SCRIPT_SRC = "/book/rakeen-book.js";

declare global {
  interface Window {
    supabaseClient?: ReturnType<typeof createBrowserClient>;
    RAKEEN_BOOK_SLUG?: string;
    __rakeenBookBooted?: boolean;
  }
}

export default function BookingPage({ slug }: { slug: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = bookMarkup;
    window.RAKEEN_BOOK_SLUG = slug;

    window.supabaseClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    document.body.appendChild(script);

    return () => {
      script.remove();
      delete window.__rakeenBookBooted;
      delete window.supabaseClient;
      delete window.RAKEEN_BOOK_SLUG;
      container.innerHTML = "";
    };
  }, [slug]);

  return <div ref={containerRef} style={{ display: "contents" }} />;
}
