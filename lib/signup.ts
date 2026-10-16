// Self-serve sign-up is off for now: every "start" on the site goes to the
// owner's WhatsApp, and accounts are added from the admin panel. Flip this to
// true to reopen /signup and /api/auth/signup.
export const SELF_SIGNUP_OPEN = false;

export const START_WHATSAPP = "966557444227";
export const startWhatsAppLink = (text = "السلام عليكم، أبي أبدأ مع ركين") =>
  `https://wa.me/${START_WHATSAPP}?text=${encodeURIComponent(text)}`;
