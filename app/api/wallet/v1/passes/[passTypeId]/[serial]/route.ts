import { NextRequest, NextResponse } from "next/server";
import { authorizePass, loadWalletRow, renderPass, serviceClient } from "@/lib/wallet-service";

/**
 * البطاقة المحدّثة.
 *
 * آخر حلقة: الرصيد تغيّر، فأيقظ الخادمُ الجهازَ بإشعار، فسأل الجهاز
 * "ما الذي تغيّر؟"، فأُعطي رقم هذه البطاقة، فطلبها هنا. وما يُردّ هو
 * البندل نفسه الذي يُبنى عند الإضافة -- لا نسخةٌ ثانية منه تُصان على
 * حدة وتفترق عنه بعد شهر.
 *
 * وIf-Modified-Since يُحترم: الجهاز يسأل أحياناً عمّا لم يتغيّر، و304
 * توفّر بناء بطاقة كاملة وتوقيعها بلا فائدة.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serial: string }> },
) {
  const { serial } = await params;
  if (!(await authorizePass(request.headers.get("authorization"), serial))) {
    return new NextResponse(null, { status: 401 });
  }
  const sb = serviceClient();
  if (!sb) return new NextResponse(null, { status: 500 });

  const row = await loadWalletRow(sb, serial);
  if (!row) return new NextResponse(null, { status: 404 });

  const updatedAt = new Date(row.updatedAt);
  const ims = request.headers.get("if-modified-since");
  if (ims) {
    const since = new Date(ims);
    // بالثانية لا بالملّي: ترويسة HTTP لا تحمل أدقّ من ذلك، والمقارنة
    // الأدقّ منها تُرجع "تغيّر" على فرقٍ لا وجود له في الترويسة.
    if (!Number.isNaN(since.getTime()) && Math.floor(updatedAt.getTime() / 1000) <= Math.floor(since.getTime() / 1000)) {
      return new NextResponse(null, { status: 304 });
    }
  }

  const pkpass = await renderPass(row, serial);
  if (!pkpass) return new NextResponse(null, { status: 500 });

  return new NextResponse(pkpass as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Last-Modified": updatedAt.toUTCString(),
      "Cache-Control": "no-store",
    },
  });
}
