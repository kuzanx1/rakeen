import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import OrderStatusActions from "./OrderStatusActions";

export type OrderStatus = {
  order_id: number;
  channel: "dine_in" | "pickup" | "delivery";
  status: "pending" | "completed" | "cancelled" | "refunded" | "rejected" | "awaiting_payment";
  ready_at: string | null;
  scheduled_for: string | null;
  created_at: string;
  total: number;
  customer_name: string;
  business_name: string;
  business_logo_url: string | null;
  theme_color: string | null;
  contact_whatsapp: string | null;
  rejection_reason: string | null;
  online_customer_note: string | null;
  items: { name: string; qty: number; line_total: number; note: string | null }[];
};

async function getOrderStatus(token: string): Promise<OrderStatus | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  const sb = createClient(supabaseUrl, anonKey);
  const { data, error } = await sb.rpc("get_order_status", { p_token: token }).maybeSingle();
  if (error || !data) return null;
  return data as OrderStatus;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const order = await getOrderStatus(token);
  return { title: order ? `تتبع طلبك — ${order.business_name}` : "طلب غير موجود" };
}

export default async function OrderStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = await getOrderStatus(token);

  if (!order) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;600;700;800&display=swap" />
        <div style={styles.notFoundPage}>
          <div style={styles.notFoundCard}>
            <p>ما قدرنا نلقى هذا الطلب — الرابط قد يكون غير صحيح.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@600;700;800&display=swap" />
      <OrderStatusActions token={token} initial={order} />
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  notFoundPage: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#F7F5EF",
    padding: "24px",
    direction: "rtl",
    fontFamily: "system-ui, sans-serif",
  },
  notFoundCard: {
    background: "#ffffff",
    color: "#18170F",
    padding: "24px",
    borderRadius: "18px",
    fontWeight: 600,
    textAlign: "center",
    maxWidth: "320px",
  },
};
