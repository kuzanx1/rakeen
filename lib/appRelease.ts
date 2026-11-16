/**
 * آخر نسخة أندرويد على الرابط المباشر (rakeenapp.com/android) -- مكان واحد.
 *
 * يقرأه مساران: /android (يحوّل للملف) و /api/app-version (التطبيق يسأله
 * عند الفتح، ولو نسخته أقدم يطلع للكاشير «فيه تحديث جديد»).
 *
 * نسخة جديدة: ارفع الملف لـ R2 (الأمر في app/android/route.ts)، وغيّر
 * الثلاثة هنا مع versionCode/versionName في android/app/build.gradle، وانشر.
 */
export const ANDROID_RELEASE = {
  versionName: "1.28",
  versionCode: 30,
  apkKey: "apps/rakeen-android-1.28-20261116.apk",
} as const;
