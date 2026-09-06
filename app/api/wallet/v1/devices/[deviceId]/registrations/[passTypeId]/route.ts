import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/wallet-service";

/**
 * "ما الذي تغيّر عندك بعد هذا الوقت؟"
 *
 * يناديها الجهاز بعد كل إشعارٍ يوقظه، وعند كل فتحٍ للمحفظة. فيردّ
 * الخادم بأرقام البطاقات التي تغيّرت وحدها -- ثم يطلبها الجهاز واحدةً
 * واحدة.
 *
 * ولا مصادقة هنا: المسار لا يذكر بطاقةً بعينها فلا رمز لها يُقارَن،
 * وما يُرجعه أرقامٌ تسلسلية لأجهزةٍ سجّلت نفسها بالفعل. وPassKit لا
 * ترسل رأس مصادقة على هذه دون سواها.
 *
 * و204 حين لا جديد -- لا مصفوفة فارغة: آبل تفرّق بينهما.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params;
  const sb = serviceClient();
  if (!sb) return new NextResponse(null, { status: 500 });

  const since = request.nextUrl.searchParams.get("passesUpdatedSince");

  const { data: regs } = await sb
    .from("wallet_pass_registrations")
    .select("customer_id")
    .eq("device_library_id", deviceId);

  const ids = (regs || []).map(r => r.customer_id);
  if (ids.length === 0) return new NextResponse(null, { status: 204 });

  let q = sb
    .from("customers")
    .select("public_token, wallet_pass_updated_at")
    .in("id", ids);
  // الحدّ صارم لا متساهل: التساهل يعيد البطاقة التي أثارت هذا النداء
  // نفسه، فيدور الجهاز والخادم بلا نهاية.
  if (since) q = q.gt("wallet_pass_updated_at", since);

  const { data: rows } = await q;
  const changed = rows || [];
  if (changed.length === 0) return new NextResponse(null, { status: 204 });

  // lastUpdated وسمٌ يعيده الجهاز كما هو في النداء التالي، فيكفي أن
  // يكون أحدث ما رأيناه.
  const lastUpdated = changed
    .map(r => r.wallet_pass_updated_at as string)
    .sort()
    .pop() as string;

  return NextResponse.json({
    serialNumbers: changed.map(r => r.public_token as string),
    lastUpdated,
  });
}
