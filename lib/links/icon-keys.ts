// مكتبة أيقونات «روابطك»: الأسماء والتصنيفات هنا (يقرؤها المحرّر والتحقق في
// normalizeConfig)، والرسم نفسه في app/l/icons.tsx. أي مفتاح يُضاف هنا
// لازم يكون له رسم هناك -- tsc يتأكد (Record<IconKey, string>).

export const ICON_LIBRARY = [
  {
    cat: "تواصل",
    items: [
      ["whatsapp", "واتساب"], ["phone", "اتصال"], ["chat", "محادثة"], ["email", "إيميل"], ["headset", "خدمة العملاء"],
      ["telegram", "تيليقرام"], ["megaphone", "إعلان"], ["bell", "تنبيه"], ["users", "عائلة"], ["briefcase", "وظائف"],
    ],
  },
  {
    cat: "سوشال",
    items: [
      ["instagram", "إنستقرام"], ["tiktok", "تيك توك"], ["snapchat", "سناب"], ["x", "إكس"], ["facebook", "فيسبوك"],
      ["youtube", "يوتيوب"], ["website", "موقع"], ["camera", "صور"], ["play", "فيديو"], ["music", "صوت"], ["custom", "رابط"],
    ],
  },
  {
    cat: "أكل وشرب",
    items: [
      ["utensils", "مطعم"], ["chef", "الشيف"], ["menu", "المنيو"], ["pot", "قدر"], ["bowl", "رز"], ["grill", "مشاوي"],
      ["drumstick", "دجاج"], ["burger", "برجر"], ["pizza", "بيتزا"], ["fish", "سمك"], ["bread", "مخبوزات"], ["chili", "حار"],
      ["leaf", "صحي"], ["fire", "على الفحم"], ["coffee", "قهوة"], ["tea", "شاي"], ["juice", "عصير"], ["cake", "كيك"],
      ["donut", "دونات"], ["icecream", "آيس كريم"], ["palm", "تمور"],
    ],
  },
  {
    cat: "طلب وتوصيل",
    items: [
      ["order", "اطلب"], ["cart", "سلة"], ["delivery", "توصيل"], ["scooter", "مندوب"], ["car", "سيارة"], ["booking", "حجز"],
      ["calendar", "تقويم"], ["clock", "الدوام"], ["receipt", "فاتورة"], ["card", "دفع"], ["wallet", "محفظة"], ["qr", "باركود"],
      ["gift", "هدية"], ["ticket", "كوبون"], ["percent", "خصم"], ["tag", "سعر"],
    ],
  },
  {
    cat: "المكان",
    items: [
      ["location", "الموقع"], ["map", "خريطة"], ["building", "فرع"], ["store", "المحل"], ["home", "البيت"],
      ["parking", "مواقف"], ["wifi", "واي فاي"], ["moon", "سهرة"], ["sun", "فطور"],
    ],
  },
  {
    cat: "مميزات",
    items: [
      ["review", "تقييم"], ["heart", "مفضّل"], ["crown", "مميز"], ["sparkle", "جديد"], ["trophy", "جائزة"], ["badge", "موثّق"],
      ["shield", "جودة"], ["thumbs", "أعجبني"], ["smile", "رضا"], ["info", "معلومة"], ["question", "سؤال"], ["download", "تحميل"],
    ],
  },
] as const;

export type IconKey = (typeof ICON_LIBRARY)[number]["items"][number][0];
export const ICON_KEYS: readonly IconKey[] = ICON_LIBRARY.flatMap((c) => c.items.map((i) => i[0]));
export const ICON_NAMES: Record<string, string> = Object.fromEntries(ICON_LIBRARY.flatMap((c) => c.items.map((i) => [i[0], i[1]])));
