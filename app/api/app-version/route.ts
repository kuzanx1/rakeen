import { NextResponse } from "next/server";
import { ANDROID_RELEASE } from "@/lib/appRelease";

// التطبيق يسأل هنا عند الفتح وعند الرجوع له (بلا مؤقّت): نسخة الرابط
// المباشر أحدث من نسخته؟ يطلع للكاشير «فيه تحديث جديد». نسخ قوقل بلاي
// وأبل تتحدّث من متاجرها، فما تسأل.
export function GET() {
  return NextResponse.json(
    {
      android: {
        versionName: ANDROID_RELEASE.versionName,
        versionCode: ANDROID_RELEASE.versionCode,
        url: "https://rakeenapp.com/android",
      },
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
