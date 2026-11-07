// «جديد ركين»: كل ميزة أو تحديث ينزل يضاف هنا بوست، الأحدث أول.
// اللوحة تعرض أحدث بوست ما شافه صاحب الحساب كبنر فخم أعلى الرئيسية،
// وزر «جديد» في الشريط العلوي يفتح كل البوستات. «شافه» محفوظ في الجهاز
// (localStorage) حسب id، فلا تغيّر id بوست بعد نشره.
//
// cta.screen = data-screen في القائمة الجانبية، cta.tab = التبويب داخل
// الشاشة، cta.focus = عنصر ينزل له بعد الفتح. لو الشاشة مو متاحة للحساب
// (صلاحية/باقة) الزر يختفي لحاله.
export type RakeenUpdate = {
  id: string;
  date: string; // YYYY-MM-DD
  tag: "ميزة جديدة" | "تحسين" | "إصلاح";
  title: string;
  body: string;
  points?: { title: string; text: string }[];
  image?: string;
  cta?: { label: string; screen: string; tab?: string; focus?: string };
};

export const RAKEEN_UPDATES: RakeenUpdate[] = [
  {
    id: "2026-11-store-luxe",
    date: "2026-11-07",
    tag: "ميزة جديدة",
    title: "متجرك صار أفخم ويبيع أكثر",
    body: "ثلاث إضافات جديدة للمتجر الإلكتروني، تبين لعميلك أول ما يفتح متجرك.",
    points: [
      { title: "شكل «واجهة»", text: "غلاف كبير بمقاس صورتك يعرض مطعمك بفخامة، وتقدر تخفي الشعار والاسم لو الغلاف فيه هم." },
      { title: "العروض", text: "بطاقات بالصور والسعر قبل وبعد الخصم، تتقلّب لحالها ويسحبها عميلك، وتفتح الصنف بضغطة." },
      { title: "المناسبات", text: "بنر اليوم الوطني ويوم التأسيس ورمضان والعيد، أو صورة من مصممك، يطلع ويختفي بالتاريخ." },
    ],
    image: "/dashboard/updates/2026-11-store.jpg",
    cta: { label: "جرّبها الحين", screen: "onlineMenu", tab: "design", focus: "storeOffersSection" },
  },
];
