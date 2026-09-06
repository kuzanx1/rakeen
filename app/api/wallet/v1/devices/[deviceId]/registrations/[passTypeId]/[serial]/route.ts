import { NextRequest, NextResponse } from "next/server";
import { authorizePass, loadWalletRow, serviceClient } from "@/lib/wallet-service";

/**
 * تسجيل جهازٍ لبطاقة، وإلغاؤه.
 *
 * تناديهما آبل من الجهاز نفسه: الأولى حين يضيف صاحبه البطاقة، والثانية
 * حين يحذفها. والمسار بشكله هذا -- بأجزائه الأربعة وأسمائها -- تفرضه
 * PassKit ولا يُختار.
 *
 * والمصادقة بـauthenticationToken المكتوب داخل البطاقة: الجهاز يسأل
 * نيابةً عن صاحبه وقد يسأل والهاتف مقفل، فليس ثمّ جلسةٌ تُقرأ.
 *
 * ورموز الردّ ليست تفصيلاً: 201 تسجيلٌ جديد، و200 تسجيلٌ قائم -- وآبل
 * تفرّق بينهما، وتعيد المحاولة على ما سواهما.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string; passTypeId: string; serial: string }> },
) {
  const { deviceId, serial } = await params;
  if (!(await authorizePass(request.headers.get("authorization"), serial))) {
    return new NextResponse(null, { status: 401 });
  }
  const sb = serviceClient();
  if (!sb) return new NextResponse(null, { status: 500 });

  let pushToken = "";
  try {
    const body = (await request.json()) as { pushToken?: string };
    pushToken = body?.pushToken || "";
  } catch { /* جسمٌ فارغ = طلبٌ ناقص */ }
  if (!pushToken) return new NextResponse(null, { status: 400 });

  const row = await loadWalletRow(sb, serial);
  if (!row) return new NextResponse(null, { status: 404 });

  // موجودٌ من قبل؟ يُحدَّث رمزه ويُردّ 200 -- الجهاز يعيد التسجيل بعد
  // كل استعادة نسخة احتياطية، ورمزه يتغيّر معها.
  const { data: existing } = await sb
    .from("wallet_pass_registrations")
    .select("id")
    .eq("device_library_id", deviceId)
    .eq("customer_id", row.customerId)
    .maybeSingle();

  if (existing) {
    await sb
      .from("wallet_pass_registrations")
      .update({ push_token: pushToken, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return new NextResponse(null, { status: 200 });
  }

  const { error } = await sb.from("wallet_pass_registrations").insert({
    customer_id: row.customerId,
    business_id: row.businessId,
    device_library_id: deviceId,
    push_token: pushToken,
  });
  if (error) return new NextResponse(null, { status: 500 });
  return new NextResponse(null, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string; serial: string }> },
) {
  const { deviceId, serial } = await params;
  if (!(await authorizePass(request.headers.get("authorization"), serial))) {
    return new NextResponse(null, { status: 401 });
  }
  const sb = serviceClient();
  if (!sb) return new NextResponse(null, { status: 500 });

  const row = await loadWalletRow(sb, serial);
  // بطاقةٌ لم تعد معروفة تُعدّ محذوفة: الجهاز يريد التخلص منها، ولا
  // يُطالَب بإعادة المحاولة على شيءٍ لا وجود له.
  if (!row) return new NextResponse(null, { status: 200 });

  await sb
    .from("wallet_pass_registrations")
    .delete()
    .eq("device_library_id", deviceId)
    .eq("customer_id", row.customerId);

  return new NextResponse(null, { status: 200 });
}
