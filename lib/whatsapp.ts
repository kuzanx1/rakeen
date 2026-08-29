// Thin wrapper around the WhatsApp Cloud API's /messages endpoint — the one
// place a reply (human today, AI later) actually leaves this server. Reused
// by the dashboard's manual-reply route, the admin panel's reply route, and
// the webhook's own automated replies, so the Graph API call shape only
// needs to be right once.
//
// fromPhoneNumberId lets a caller reply from a SPECIFIC number when Rakeen
// has more than one (e.g. a dedicated loyalty number alongside the main
// Rakeen/support number) — defaults to the main number so every existing
// call site keeps working unchanged. The one access token works across all
// numbers under the same WhatsApp Business Account; only the target
// phone_number_id in the URL path changes.
export type WhatsAppSendResult = { ok: boolean; messageId?: string; error?: string };

async function callWhatsAppApi(phoneNumberId: string | undefined, body: object): Promise<WhatsAppSendResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    return { ok: false, error: "WhatsApp not configured" };
  }

  const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string } } | null;
  if (!res.ok) {
    return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
  }
  return { ok: true, messageId: data?.messages?.[0]?.id };
}

export async function sendWhatsAppText(toPhone: string, body: string, fromPhoneNumberId?: string): Promise<WhatsAppSendResult> {
  return callWhatsAppApi(fromPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID, {
    messaging_product: "whatsapp",
    to: toPhone,
    type: "text",
    text: { body },
  });
}

export type WhatsAppButton = { id: string; title: string };

// Reply buttons (max 3) show inline under the message — nicer than a list
// for a small, fixed set of choices like the loyalty menu (issue / card /
// points), no extra tap to open anything.
export async function sendWhatsAppButtons(toPhone: string, bodyText: string, buttons: WhatsAppButton[], fromPhoneNumberId?: string): Promise<WhatsAppSendResult> {
  return callWhatsAppApi(fromPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID, {
    messaging_product: "whatsapp",
    to: toPhone,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: { buttons: buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })) },
    },
  });
}

export type WhatsAppListRow = { id: string; title: string; description?: string };

// The WhatsApp control-panel menu (registered client) and the prospect/
// support menu are both single-select lists — up to 10 rows, one section,
// no free text needed since every option's `id` self-describes the action
// (the webhook routes purely on that id, no server-side state to track).
export async function sendWhatsAppList(toPhone: string, bodyText: string, buttonLabel: string, rows: WhatsAppListRow[], fromPhoneNumberId?: string): Promise<WhatsAppSendResult> {
  return callWhatsAppApi(fromPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID, {
    messaging_product: "whatsapp",
    to: toPhone,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText },
      action: { button: buttonLabel, sections: [{ rows }] },
    },
  });
}
