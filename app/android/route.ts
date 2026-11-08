import { NextResponse } from "next/server";

// rakeenapp.com/android -- تحميل تطبيق ركين للأندرويد مباشرة، لمن لا يصله
// المتجر بعد (والسنمي وأجهزة الكاشير اللي فيها متجر قوقل كذلك).
//
// الملف نفسه في R2 لا في public/: حدّ Workers للملف الثابت 25MB، والتطبيق
// أكبر من ذلك. وmedia.rakeenapp.com يخدمه من المخزن مع
// cache-control: immutable، فكل نسخة تُرفع باسمٍ جديد ويتغيّر هنا اسمها
// وحده. والتحويل 302 لا 301 لهذا السبب: الرابط ثابت والملف وراءه يتبدّل.
//
// نسخة جديدة:
//   npx wrangler r2 object put rakeen-media/apps/<الاسم>.apk --remote \
//     --file react-native-poc/android/app/build/outputs/apk/release/app-release.apk \
//     --content-type application/vnd.android.package-archive \
//     --content-disposition 'attachment; filename="rakeen.apk"'
// ثم يتغيّر APK_KEY ويُنشر الموقع.
const APK_KEY = "apps/rakeen-android-1.6-20261108.apk";

export function GET() {
  return NextResponse.redirect(`https://media.rakeenapp.com/${APK_KEY}`, 302);
}
