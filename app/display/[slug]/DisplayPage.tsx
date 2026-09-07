"use client";

import { useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import "../../order/[slug]/rakeen-order.css";
import { orderMarkup } from "../../order/[slug]/order-markup";

/**
 * شاشة العميل: نفس المنيو، ورابطٌ مستقل.
 *
 * وضع العرض كان مفتاحاً داخل المتجر يُحفظ في localStorage. ولا يصلح
 * هناك: المتجر لا بدّ أن يُفتح من أي جهاز -- هذا هو الغرض منه -- وهذه
 * الشاشة لا بدّ أن تُقفل على جهاز واحد. شرطان متناقضان في رابطٍ واحد،
 * فانفصلا.
 *
 * والتصميم نفسه حرفياً -- المعلَم نفسه وCSS نفسه، لا نسخةٌ ثانية تفترق
 * عنه بعد شهر. والفرق في السلوك لا في الشكل: لا سلة، ولا طلب، ولا خيار
 * قناة. ولوحٌ للباركود فوقه.
 */

const SCRIPT_SRC = "/order/rakeen-order.js?b=" + (process.env.NEXT_PUBLIC_BUILD_ID || "dev");
const DISPLAY_SCRIPT_SRC = "/display/rakeen-display.js?b=" + (process.env.NEXT_PUBLIC_BUILD_ID || "dev");

declare global {
  interface Window {
    RAKEEN_DISPLAY_MODE?: boolean;
  }
}

export default function DisplayPage({ slug }: { slug: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = orderMarkup;
    window.RAKEEN_ORDER_SLUG = slug;
    // يقرؤه سكربت المتجر فيبدأ في وضع العرض بلا مفتاحٍ يُضغط ولا قيمةٍ
    // تُحفظ: الرابط نفسه هو القرار.
    window.RAKEEN_DISPLAY_MODE = true;

    window.supabaseClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    /**
     * عامل الخدمة: شرطُ التثبيت، والتثبيتُ شرطُ بقاء الاقتران.
     *
     * سفاري iOS تحذف تخزين المواقع بعد سبعة أيام بلا استعمال -- فتفقد
     * الشاشة سرّها بعد كل إجازة. والصفحة المثبَّتة على الشاشة الرئيسية
     * لا يشملها ذلك الحذف. فالتثبيت هنا ليس زينةً ولا ملءَ شاشة، هو ما
     * يُبقي الجهاز مقترناً.
     */
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/display-sw.js").catch(() => {});
    }

    const menu = document.createElement("script");
    menu.src = SCRIPT_SRC;
    document.body.appendChild(menu);

    // لوح الباركود يُحمَّل بعد المنيو: يعتمد على عرضه لا على منطقه.
    const overlay = document.createElement("script");
    overlay.src = DISPLAY_SCRIPT_SRC;
    overlay.defer = true;
    document.body.appendChild(overlay);

    return () => {
      menu.remove();
      overlay.remove();
      delete window.__rakeenOrderBooted;
      delete window.supabaseClient;
      delete window.RAKEEN_ORDER_SLUG;
      delete window.RAKEEN_DISPLAY_MODE;
      container.innerHTML = "";
    };
  }, [slug]);

  return <div ref={containerRef} style={{ display: "contents" }} />;
}
