// Small curated icon set for the "visits" loyalty card's stamp row — the
// owner picks one that matches what they sell (Settings → الولاء). Kept as
// raw SVG path markup (not a component) so both the server-rendered card
// page and the dashboard's vanilla-JS live preview can reuse the exact same
// strings without a shared build step between the two runtimes.
export const LOYALTY_ICON_PATHS: Record<string, string> = {
  generic:
    '<polygon points="12 2 15 9 22 9 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9 9 9"/>',
  coffee:
    '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="2" x2="6" y2="5"/><line x1="10" y1="2" x2="10" y2="5"/><line x1="14" y1="2" x2="14" y2="5"/>',
  burger:
    '<path d="M4 8c0-3 3.5-5 8-5s8 2 8 5"/><rect x="3" y="10" width="18" height="3" rx="1.5"/><line x1="4" y1="16" x2="20" y2="16"/><path d="M3 19c0 1.5 1 2 2 2h14c1 0 2-.5 2-2"/>',
  pizza:
    '<path d="M12 2 22 20 2 20Z"/><circle cx="9" cy="14" r="1"/><circle cx="14" cy="16" r="1"/><circle cx="12" cy="9.5" r="1"/>',
  pastry:
    '<path d="M3 15c2-6 6-10 9-10s7 4 9 10c-3-2-6-3-9-3s-6 1-9 3z"/><path d="M6.5 12.5c1-2 3-3.5 5.5-3.5s4.5 1.5 5.5 3.5"/>',
  dessert:
    '<path d="M12 2a5 5 0 0 1 5 5c0 1-.3 2-1 3H8c-.7-1-1-2-1-3a5 5 0 0 1 5-5z"/><path d="M8 10l4 12 4-12"/>',
  car:
    '<path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5"/><path d="M3 13v4a1 1 0 0 0 1 1h1"/><path d="M21 13v4a1 1 0 0 1-1 1h-1"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><line x1="9" y1="18" x2="15" y2="18"/>',
  pet:
    '<circle cx="12" cy="15.2" r="3.2"/><circle cx="6" cy="10" r="1.6"/><circle cx="18" cy="10" r="1.6"/><circle cx="9" cy="6.3" r="1.6"/><circle cx="15" cy="6.3" r="1.6"/>',
  salon:
    '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
  gym:
    '<line x1="7" y1="12" x2="17" y2="12"/><rect x="2" y="9" width="4" height="6" rx="1"/><rect x="18" y="9" width="4" height="6" rx="1"/><rect x="6" y="10.3" width="2" height="3.4"/><rect x="16" y="10.3" width="2" height="3.4"/>',
  retail:
    '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  padel:
    '<path d="M12 2c-3 0-5.2 2.2-5.2 5.5 0 4 2.2 6.8 5.2 6.8s5.2-2.8 5.2-6.8C17.2 4.2 15 2 12 2z"/><line x1="12" y1="14.3" x2="12" y2="22"/><circle cx="9.6" cy="6.8" r="0.6"/><circle cx="14.4" cy="6.8" r="0.6"/><circle cx="12" cy="9.5" r="0.6"/>',
  sports:
    '<path d="M8 3h8v4a4 4 0 0 1-8 0V3z"/><path d="M8 4.2H5.2A2.8 2.8 0 0 0 8 8.5"/><path d="M16 4.2h2.8A2.8 2.8 0 0 1 16 8.5"/><line x1="12" y1="11" x2="12" y2="16.5"/><path d="M8.5 21h7l-1-4.5h-5L8.5 21z"/>',
  spa:
    '<path d="M12 2.5c3.2 3.2 5.2 6.4 5.2 9.6a5.2 5.2 0 0 1-10.4 0c0-3.2 2-6.4 5.2-9.6z"/>',
  clinic:
    '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M11.2 8h1.6v3.2H16v1.6h-3.2V16h-1.6v-3.2H8v-1.6h3.2V8z"/>',
};

export const LOYALTY_ICON_LABELS: Record<string, string> = {
  generic: "نجمة",
  coffee: "قهوة",
  burger: "برجر",
  pizza: "بيتزا",
  pastry: "معجنات",
  dessert: "حلا",
  car: "غسيل سيارات",
  pet: "حيوانات أليفة",
  salon: "صالون / حلاقة",
  gym: "نادي رياضي",
  retail: "متجر",
  padel: "بادل",
  sports: "رياضة ونوادي",
  spa: "مساج وسبا",
  clinic: "عيادات ومستشفيات",
};

export function getContrastTextColor(hex: string): string {
  const c = (hex || "#C4FF2B").replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#171717" : "#FAFAF5";
}
