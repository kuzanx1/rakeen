import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import QRCode from "qrcode";
import type { Metadata } from "next";
import CardActions from "./CardActions";
import { LOYALTY_ICON_PATHS, getContrastTextColor } from "./icons";

type Card = {
  customer_name: string;
  loyalty_points: number;
  business_name: string;
  logo_url: string | null;
  banner_url: string | null;
  accent_color: string;
  loyalty_system_type: "points" | "visits";
  loyalty_visits: number;
  loyalty_visits_threshold: number;
  loyalty_reward_label: string;
  loyalty_icon_style: string;
  loyalty_free_rewards: number;
  loyalty_pattern_style: string;
  loyalty_tier: string;
  loyalty_theme: string;
  loyalty_custom_icon_url: string | null;
  customer_since: string;
  total_saved: number;
};

const TIER_META: Record<string, { emoji: string; label: string }> = {
  Bronze: { emoji: "🥉", label: "Bronze" },
  Silver: { emoji: "🥈", label: "Silver" },
  Gold: { emoji: "🥇", label: "Gold" },
  Platinum: { emoji: "💎", label: "Platinum" },
};

// A relationship-length line ("معنا من سنتين") — Arabic number agreement is
// irregular for 1/2 vs 3-10 vs 11+, handled explicitly rather than a naive
// "${n} شهر" that would read wrong for most values.
function tenureLabel(since: string): string {
  const start = new Date(since).getTime();
  if (Number.isNaN(start)) return "";
  const days = Math.floor((Date.now() - start) / 86400000);
  if (days < 30) return "معنا من هالشهر";
  const months = Math.floor(days / 30);
  if (months < 12) {
    if (months === 1) return "معنا من شهر";
    if (months === 2) return "معنا من شهرين";
    if (months <= 10) return `معنا من ${months} أشهر`;
    return `معنا من ${months} شهرًا`;
  }
  const years = Math.floor(months / 12);
  if (years === 1) return "معنا من سنة";
  if (years === 2) return "معنا من سنتين";
  if (years <= 10) return `معنا من ${years} سنوات`;
  return `معنا من ${years} سنة`;
}

// The middle band's backdrop is always a light color — a light, bright
// accent (a lot of restaurant brand colors are, e.g. lime green) would be
// nearly invisible drawn at low opacity on a light background no matter how
// high we push the alpha. So patterns never draw with the raw accent — they
// draw with a lightness-capped version of it, so contrast holds regardless
// of how light the chosen accent is.
function patternDrawColor(hex: string): string {
  const c = (hex || "#C4FF2B").replace("#", "");
  let r = (parseInt(c.substring(0, 2), 16) || 0) / 255;
  let g = (parseInt(c.substring(2, 4), 16) || 0) / 255;
  let b = (parseInt(c.substring(4, 6), 16) || 0) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min);
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  const targetL = Math.min(l, 0.38);
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) {
    r = g = b = targetL;
  } else {
    const q = targetL < 0.5 ? targetL * (1 + s) : targetL + s - targetL * s;
    const p = 2 * targetL - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// "rings" is the showcase premium option: a soft two-ring ripple motif,
// understated but distinctly upscale next to plain geometric tiling.
function patternBackground(pattern: string, accent: string, iconPath: string): { backgroundImage: string; backgroundSize?: string } {
  const draw = patternDrawColor(accent);
  switch (pattern) {
    case "dots":
      return { backgroundImage: `radial-gradient(${draw}45 1.6px, transparent 1.8px)`, backgroundSize: "18px 18px" };
    case "diagonal":
      return { backgroundImage: `repeating-linear-gradient(45deg, ${draw}38, ${draw}38 1.5px, transparent 1.5px, transparent 16px)` };
    case "waves": {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='150' height='46' viewBox='0 0 150 46'><path d='M0 23 Q18.75 6 37.5 23 T75 23 T112.5 23 T150 23' fill='none' stroke='${draw}' stroke-width='1.5' opacity='0.4'/></svg>`;
      return { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, backgroundSize: "150px 46px" };
    }
    case "grid":
      return {
        backgroundImage: `repeating-linear-gradient(0deg, ${draw}38 0, ${draw}38 1px, transparent 1px, transparent 18px), repeating-linear-gradient(90deg, ${draw}38 0, ${draw}38 1px, transparent 1px, transparent 18px)`,
      };
    case "chevron": {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='34' height='19' viewBox='0 0 34 19'><path d='M0 2 L17 16 L34 2' fill='none' stroke='${draw}' stroke-width='1.5' opacity='0.38'/></svg>`;
      return { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, backgroundSize: "34px 19px" };
    }
    case "rings": {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'><circle cx='30' cy='30' r='9' fill='none' stroke='${draw}' stroke-width='1.4' opacity='0.4'/><circle cx='30' cy='30' r='19' fill='none' stroke='${draw}' stroke-width='1.4' opacity='0.25'/></svg>`;
      return { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, backgroundSize: "60px 60px" };
    }
    case "icons": {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='54' height='54' viewBox='0 0 24 24'><g transform='translate(3.5,3.5) scale(0.7)' fill='none' stroke='${draw}' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' opacity='0.32'>${iconPath}</g></svg>`;
      return { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, backgroundSize: "54px 54px" };
    }
    default:
      return { backgroundImage: "none" };
  }
}

async function getCard(token: string): Promise<Card | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  const sb = createClient(supabaseUrl, anonKey);
  const { data, error } = await sb.rpc("get_loyalty_card", { p_token: token }).single();
  if (error || !data) return null;
  return data as Card;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const card = await getCard(token);
  return {
    title: card ? `بطاقة الولاء — ${card.business_name}` : "بطاقة الولاء",
    manifest: `/loyalty-card/${token}/manifest.webmanifest`,
  };
}

// One SVG icon per stamp — or, if the owner uploaded their own icon instead
// of picking a preset, that image instead. Kept as one small component so
// the "custom icon" branch only has to be written once.
function StampGlyph({ iconPath, customIconUrl, filled, accent, size }: { iconPath: string; customIconUrl: string | null; filled: boolean; accent: string; size: number }) {
  if (customIconUrl) {
    return (
      <img
        src={customIconUrl}
        alt=""
        style={{ width: size, height: size, objectFit: "contain", opacity: filled ? 1 : 0.32, filter: filled ? "none" : "grayscale(70%)" }}
      />
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? accent : "none"}
      stroke={filled ? accent : "#c9c4ba"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: iconPath }}
    />
  );
}

type ThemeProps = {
  card: Card;
  accent: string;
  onAccent: string;
  isVisits: boolean;
  iconPath: string;
  customIconUrl: string | null;
  tier: { emoji: string; label: string };
  tenure: string;
  savedLabel: string | null;
  qrSvg: string;
  middleBg: React.CSSProperties;
};

export default async function LoyaltyCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const card = await getCard(token);

  if (!card) {
    return (
      <div style={styles.notFoundPage}>
        <div style={styles.notFoundCard}>
          <p>ما قدرنا نلقى بطاقة الولاء هذي.</p>
        </div>
      </div>
    );
  }

  const headersList = await headers();
  const host = headersList.get("host") || "";
  const proto = headersList.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const cardUrl = `${proto}://${host}/loyalty-card/${token}`;
  const accent = card.accent_color || "#C4FF2B";
  const onAccent = getContrastTextColor(accent);
  const isVisits = card.loyalty_system_type === "visits";
  const customIconUrl = card.loyalty_icon_style === "custom" ? card.loyalty_custom_icon_url : null;
  const iconPath = LOYALTY_ICON_PATHS[card.loyalty_icon_style] || LOYALTY_ICON_PATHS.generic;
  const tier = TIER_META[card.loyalty_tier] || TIER_META.Bronze;
  const qrSvg = await QRCode.toString(cardUrl, { type: "svg", margin: 1, color: { dark: "#171717", light: "#00000000" } });
  const pattern = card.banner_url ? {} : patternBackground(card.loyalty_pattern_style, accent, customIconUrl ? "" : iconPath);
  const middleBg: React.CSSProperties = {
    ...pattern,
    ...(card.banner_url
      ? { backgroundImage: `linear-gradient(rgba(247,244,239,.8),rgba(247,244,239,.8)), url(${card.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" }
      : {}),
  };
  const tenure = tenureLabel(card.customer_since);
  const savedLabel = card.total_saved > 0 ? `وفرت معنا ${Math.round(card.total_saved).toLocaleString("ar-SA")} ر.س` : null;

  const themeProps: ThemeProps = { card, accent, onAccent, isVisits, iconPath, customIconUrl, tier, tenure, savedLabel, qrSvg, middleBg };

  return (
    <div style={styles.page}>
      <style dangerouslySetInnerHTML={{ __html: ".loyalty-qr-box svg { width: 100%; height: auto; display: block; }" }} />
      <CardActions token={token} />
      {card.loyalty_theme === "minimal" ? <MinimalTheme {...themeProps} /> : card.loyalty_theme === "bold" ? <BoldTheme {...themeProps} /> : <ClassicTheme {...themeProps} />}
    </div>
  );
}

function StampOrPoints({ card, isVisits, iconPath, customIconUrl, accent, stampSize }: Pick<ThemeProps, "card" | "isVisits" | "iconPath" | "customIconUrl" | "accent"> & { stampSize: number }) {
  if (isVisits) {
    return (
      <div style={styles.stampRow}>
        {Array.from({ length: card.loyalty_visits_threshold }).map((_, i) => (
          <StampGlyph key={i} iconPath={iconPath} customIconUrl={customIconUrl} filled={i < card.loyalty_visits} accent={accent} size={stampSize} />
        ))}
      </div>
    );
  }
  return (
    <div style={styles.pointsBlock}>
      <div style={{ ...styles.pointsHalo, background: `radial-gradient(circle, ${accent}33, transparent 70%)` }} />
      <svg viewBox="0 0 24 24" width="22" height="22" fill={accent} style={styles.pointsSparkle}>
        <path d="M12 2l1.8 5.6L19 9l-5.2 1.4L12 16l-1.8-5.6L5 9l5.2-1.4L12 2z" />
      </svg>
      <div style={styles.pointsLabel}>رصيد النقاط</div>
      <div style={{ ...styles.pointsValue, color: accent }}>{Math.round(card.loyalty_points).toLocaleString("ar-SA")}</div>
    </div>
  );
}

// ---------- Classic: the original 3-band colored header/footer layout ----------
function ClassicTheme({ card, accent, onAccent, isVisits, iconPath, customIconUrl, tier, tenure, savedLabel, qrSvg, middleBg }: ThemeProps) {
  return (
    <>
      <div style={{ ...styles.headerBand, background: accent, color: onAccent }}>
        <div style={styles.headerTop}>
          {card.logo_url ? (
            <img src={card.logo_url} alt="" style={styles.logoImg} />
          ) : (
            <div style={{ ...styles.logo, background: onAccent, color: accent }}>{card.business_name.trim().charAt(0)}</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.brandName}>{card.business_name}</div>
          </div>
          <div style={{ ...styles.tierChip, background: `${onAccent}22` }}>
            <span>{tier.emoji}</span>
            <span>{tier.label}</span>
          </div>
        </div>
        <div style={styles.customerName}>{card.customer_name}</div>
        {tenure && <div style={{ ...styles.tenureLine, color: `${onAccent}b3` }}>{tenure}</div>}
      </div>

      <div style={{ ...styles.middleBand, ...middleBg }}>
        <StampOrPoints card={card} isVisits={isVisits} iconPath={iconPath} customIconUrl={customIconUrl} accent={accent} stampSize={30} />
      </div>

      <div style={{ ...styles.footerBand, background: accent, color: onAccent }}>
        {savedLabel && (
          <div style={{ ...styles.savedBadge, background: `${onAccent}1f`, color: onAccent }}>
            <span>💰</span>
            <span>{savedLabel}</span>
          </div>
        )}
        {isVisits && (
          <div style={styles.statsRow}>
            <div style={styles.statBlock}>
              <div style={styles.statLabel}>متبقي لـ{card.loyalty_reward_label}</div>
              <div style={styles.statValue}>{Math.max(0, card.loyalty_visits_threshold - card.loyalty_visits)}</div>
            </div>
            <div style={styles.statDivider} />
            <div style={styles.statBlock}>
              <div style={styles.statLabel}>هدايا جاهزة</div>
              <div style={styles.statValue}>{card.loyalty_free_rewards}</div>
            </div>
          </div>
        )}
        <div className="loyalty-qr-box" style={styles.qrBox} dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <p style={styles.hint}>
          {isVisits ? `اعرض هذي البطاقة عند الكاشير — كل عملية شراء تقرّبك من ${card.loyalty_reward_label}.` : "اعرض هذي البطاقة عند الكاشير لتجميع واستبدال نقاط الولاء."}
        </p>
        <div style={styles.poweredBy}>مدعوم من ركين</div>
      </div>
    </>
  );
}

// ---------- Minimal: light throughout, accent used only as an accent — a
// quieter, boutique feel for spas/salons/upscale cafés. ----------
function MinimalTheme({ card, accent, isVisits, iconPath, customIconUrl, tier, tenure, savedLabel, qrSvg, middleBg }: ThemeProps) {
  return (
    <div style={styles.minimalPage}>
      <div style={{ ...styles.minimalTopBar, background: accent }} />
      <div style={styles.minimalHeader}>
        {card.logo_url ? (
          <img src={card.logo_url} alt="" style={{ ...styles.logoImg, border: `2px solid ${accent}` }} />
        ) : (
          <div style={{ ...styles.logo, background: "#F2F0EA", color: accent }}>{card.business_name.trim().charAt(0)}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...styles.brandName, color: "#171717" }}>{card.business_name}</div>
          <div style={{ ...styles.tierChip, background: "transparent", padding: 0, color: accent }}>
            <span>{tier.emoji} {tier.label}</span>
          </div>
        </div>
      </div>

      <div style={styles.minimalCustomerBlock}>
        <div style={{ ...styles.customerName, color: "#171717", fontSize: "26px" }}>{card.customer_name}</div>
        {tenure && <div style={{ ...styles.tenureLine, color: "#8a8477" }}>{tenure}</div>}
      </div>

      <div style={{ ...styles.minimalMiddle, ...middleBg }}>
        <StampOrPoints card={card} isVisits={isVisits} iconPath={iconPath} customIconUrl={customIconUrl} accent={accent} stampSize={28} />
      </div>

      {savedLabel && (
        <div style={{ ...styles.savedBadge, background: `${accent}18`, color: "#171717", margin: "0 auto 18px" }}>
          <span>💰</span>
          <span>{savedLabel}</span>
        </div>
      )}

      {isVisits && (
        <div style={{ ...styles.statsRow, color: "#171717", padding: "0 24px", marginBottom: "20px" }}>
          <div style={styles.statBlock}>
            <div style={{ ...styles.statLabel, opacity: 0.6 }}>متبقي لـ{card.loyalty_reward_label}</div>
            <div style={{ ...styles.statValue, color: accent }}>{Math.max(0, card.loyalty_visits_threshold - card.loyalty_visits)}</div>
          </div>
          <div style={{ ...styles.statDivider, background: "#e5e1d8" }} />
          <div style={styles.statBlock}>
            <div style={{ ...styles.statLabel, opacity: 0.6 }}>هدايا جاهزة</div>
            <div style={{ ...styles.statValue, color: accent }}>{card.loyalty_free_rewards}</div>
          </div>
        </div>
      )}

      <div style={styles.minimalFooter}>
        <div className="loyalty-qr-box" style={{ ...styles.qrBox, boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }} dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <p style={{ ...styles.hint, color: "#8a8477" }}>
          {isVisits ? `اعرض هذي البطاقة عند الكاشير — كل عملية شراء تقرّبك من ${card.loyalty_reward_label}.` : "اعرض هذي البطاقة عند الكاشير لتجميع واستبدال نقاط الولاء."}
        </p>
        <div style={{ ...styles.poweredBy, color: "#c9c4ba" }}>مدعوم من ركين</div>
      </div>
    </div>
  );
}

// ---------- Bold: the accent washes the whole page, content floats on a
// white card — punchier, made for vibrant/energetic brands. ----------
function BoldTheme({ card, accent, onAccent, isVisits, iconPath, customIconUrl, tier, tenure, savedLabel, qrSvg }: ThemeProps) {
  return (
    <div style={{ ...styles.boldPage, background: accent }}>
      <div style={styles.boldHeader}>
        {card.logo_url ? (
          <img src={card.logo_url} alt="" style={{ ...styles.logoImg, border: `2px solid ${onAccent}88` }} />
        ) : (
          <div style={{ ...styles.logo, background: onAccent, color: accent }}>{card.business_name.trim().charAt(0)}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...styles.brandName, color: onAccent }}>{card.business_name}</div>
        </div>
        <div style={{ ...styles.tierChip, background: `${onAccent}26`, color: onAccent }}>
          <span>{tier.emoji}</span>
          <span>{tier.label}</span>
        </div>
      </div>
      <div style={{ ...styles.customerName, color: onAccent, textAlign: "center" }}>{card.customer_name}</div>
      {tenure && <div style={{ ...styles.tenureLine, color: `${onAccent}b3`, textAlign: "center" }}>{tenure}</div>}

      <div style={styles.boldCard}>
        <StampOrPoints card={card} isVisits={isVisits} iconPath={iconPath} customIconUrl={customIconUrl} accent={accent} stampSize={30} />
        {savedLabel && (
          <div style={{ ...styles.savedBadge, background: `${accent}14`, color: "#171717" }}>
            <span>💰</span>
            <span>{savedLabel}</span>
          </div>
        )}
        {isVisits && (
          <div style={{ ...styles.statsRow, color: "#171717" }}>
            <div style={styles.statBlock}>
              <div style={{ ...styles.statLabel, opacity: 0.6 }}>متبقي لـ{card.loyalty_reward_label}</div>
              <div style={{ ...styles.statValue, color: accent }}>{Math.max(0, card.loyalty_visits_threshold - card.loyalty_visits)}</div>
            </div>
            <div style={{ ...styles.statDivider, background: "#e5e1d8" }} />
            <div style={styles.statBlock}>
              <div style={{ ...styles.statLabel, opacity: 0.6 }}>هدايا جاهزة</div>
              <div style={{ ...styles.statValue, color: accent }}>{card.loyalty_free_rewards}</div>
            </div>
          </div>
        )}
      </div>

      <div style={styles.boldFooter}>
        <div className="loyalty-qr-box" style={styles.qrBoxOnAccent} dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <p style={{ ...styles.hint, color: `${onAccent}a6` }}>
          {isVisits ? `اعرض هذي البطاقة عند الكاشير — كل عملية شراء تقرّبك من ${card.loyalty_reward_label}.` : "اعرض هذي البطاقة عند الكاشير لتجميع واستبدال نقاط الولاء."}
        </p>
        <div style={{ ...styles.poweredBy, color: `${onAccent}59` }}>مدعوم من ركين</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    direction: "rtl",
    background: "#F7F4EF",
  },
  headerBand: {
    padding: "calc(16px + env(safe-area-inset-top)) 22px 18px",
    flexShrink: 0,
  },
  headerTop: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  logo: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: "17px",
    flexShrink: 0,
  },
  logoImg: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    objectFit: "cover",
    flexShrink: 0,
    border: "2px solid rgba(255,255,255,0.5)",
  },
  brandName: {
    fontWeight: 800,
    fontSize: "15.5px",
    letterSpacing: "0.01em",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  tierChip: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "5px 10px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 800,
    flexShrink: 0,
  },
  customerName: {
    fontWeight: 800,
    fontSize: "22px",
    marginTop: "16px",
  },
  tenureLine: {
    fontSize: "11.5px",
    fontWeight: 600,
    marginTop: "4px",
  },
  middleBand: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "28px 24px",
    minHeight: "140px",
  },
  stampRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "16px",
    justifyContent: "center",
    maxWidth: "320px",
  },
  pointsBlock: {
    textAlign: "center",
    position: "relative",
  },
  pointsHalo: {
    position: "absolute",
    width: "220px",
    height: "220px",
    borderRadius: "50%",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: 0,
    pointerEvents: "none",
  },
  pointsSparkle: {
    position: "relative",
    zIndex: 1,
    display: "block",
    margin: "0 auto 6px",
  },
  pointsLabel: {
    position: "relative",
    zIndex: 1,
    fontSize: "12px",
    fontWeight: 700,
    color: "#8a8477",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  pointsValue: {
    position: "relative",
    zIndex: 1,
    fontSize: "68px",
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1.1,
    marginTop: "6px",
  },
  footerBand: {
    padding: "20px 22px calc(20px + env(safe-area-inset-bottom))",
    flexShrink: 0,
  },
  savedBadge: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    width: "fit-content",
    padding: "6px 14px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
    margin: "0 auto 14px",
  },
  statsRow: {
    display: "flex",
    alignItems: "center",
    marginBottom: "18px",
  },
  statBlock: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "3px",
  },
  statDivider: {
    width: "1px",
    alignSelf: "stretch",
    background: "rgba(255,255,255,0.25)",
    margin: "0 12px",
  },
  statLabel: {
    fontSize: "10.5px",
    fontWeight: 700,
    opacity: 0.75,
  },
  statValue: {
    fontSize: "26px",
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
  },
  qrBox: {
    background: "#FAFAF5",
    borderRadius: "12px",
    padding: "14px",
    width: "112px",
    margin: "0 auto",
  },
  qrBoxOnAccent: {
    background: "#FFFFFF",
    borderRadius: "12px",
    padding: "14px",
    width: "112px",
    margin: "0 auto",
    boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
  },
  hint: {
    color: "rgba(255,255,255,0.65)",
    fontSize: "11.5px",
    fontWeight: 600,
    marginTop: "14px",
    textAlign: "center",
  },
  poweredBy: {
    color: "rgba(255,255,255,0.35)",
    fontSize: "9.5px",
    fontWeight: 700,
    marginTop: "10px",
    textAlign: "center",
  },
  notFoundPage: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0d0d0d",
    padding: "24px",
    direction: "rtl",
  },
  notFoundCard: {
    background: "#171717",
    color: "#FAFAF5",
    padding: "24px",
    borderRadius: "14px",
    fontWeight: 600,
  },
  // ---------- minimal theme ----------
  minimalPage: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    background: "#FDFCFA",
  },
  minimalTopBar: {
    height: "6px",
    flexShrink: 0,
  },
  minimalHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "calc(20px + env(safe-area-inset-top)) 24px 0",
  },
  minimalCustomerBlock: {
    padding: "20px 24px 0",
  },
  minimalMiddle: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    minHeight: "140px",
  },
  minimalFooter: {
    padding: "0 24px calc(24px + env(safe-area-inset-bottom))",
    textAlign: "center",
  },
  // ---------- bold theme ----------
  boldPage: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: "calc(18px + env(safe-area-inset-top)) 20px calc(18px + env(safe-area-inset-bottom))",
  },
  boldHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  boldCard: {
    flex: 1,
    background: "#FDFCFA",
    borderRadius: "22px",
    margin: "18px 0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "26px 20px",
    boxShadow: "0 20px 48px rgba(0,0,0,0.16)",
  },
  boldFooter: {
    flexShrink: 0,
  },
};
