import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import BookingPage from "./BookingPage";

async function getBusiness(slug: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  const sb = createClient(supabaseUrl, anonKey);
  const { data } = await sb
    .from("businesses")
    .select("name, logo_url")
    .eq("online_menu_slug", slug)
    .eq("online_booking_enabled", true)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const business = await getBusiness(slug);
  return {
    title: business ? `${business.name} — احجز موعدك` : "الحجز غير متاح",
    description: business ? `احجز موعدك مباشرة عند ${business.name} — بدون اتصال، بدون انتظار.` : undefined,
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@500;600;700;800&display=swap"
      />
      <BookingPage slug={slug} />
    </>
  );
}
