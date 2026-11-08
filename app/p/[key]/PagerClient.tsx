"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface PagerStatus {
  found: boolean;
  order_id?: number;
  channel?: string;
  status?: string;
  created_at?: string;
  eta_at?: string | null;
  ready_at?: string | null;
  delivered_at?: string | null;
  delayed_at?: string | null;
  rung_at?: string | null;
  ring_count?: number;
  customer?: string | null;
  business?: {
    name?: string | null; logo?: string | null; accent?: string | null; surf?: string | null;
    card?: string | null; ink?: string | null; muted?: string | null; font?: string | null;
  };
  branch?: string | null;
  ready_msg?: string | null;
  tone?: string | null;
}

type Phase = "waiting" | "preparing" | "ready" | "collected" | "cancelled";
type NotifState = "idle" | "granted" | "denied" | "unsupported" | "ios-home";

const HEX = /^#[0-9a-f]{6}$/i;

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function phaseOf(s: PagerStatus | null): Phase {
  if (!s || !s.found) return "waiting";
  if (s.status === "cancelled" || s.status === "refunded" || s.status === "rejected") return "cancelled";
  if (s.delivered_at) return "collected";
  if (s.ready_at) return "ready";
  return "preparing";
}

function b64ToBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const TONES = new Set(["chime", "bell", "beep"]);

export default function PagerClient({ uuid, pageKey, initial }: { uuid: string; pageKey: string; initial: PagerStatus | null }) {
  const [s, setS] = useState<PagerStatus | null>(initial);
  const [now, setNow] = useState(() => Date.now());
  const [armed, setArmed] = useState(false);
  const [notif, setNotif] = useState<NotifState>("idle");
  const [alarm, setAlarm] = useState(false);
  const [offline, setOffline] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  // «تبي صوت؟» تطلع أول ما تنفتح الصفحة -- الضغطة نفسها هي اللي تفتح الصوت
  // (المتصفح ما يسمح بصوتٍ بلا ضغطة). «بدون صوت»: هزّ وإشعار وشاشة فقط.
  const [asked, setAsked] = useState(false);
  const [silent, setSilent] = useState(false);
  const silentRef = useRef(false);
  // «استلمت طلبي»: الزبون يقفل البيجر عنده بنفسه -- ما يغيّر شي عند الكاشير.
  const [selfDone, setSelfDone] = useState(false);
  const selfDoneRef = useRef(false);

  const sbRef = useRef<SupabaseClient | null>(null);
  // البثّ متصل؟ ما دام متصلاً لا سؤال أبداً.
  const liveRef = useRef(false);
  const keepRef = useRef<HTMLAudioElement | null>(null);
  const toneRef = useRef<HTMLAudioElement | null>(null);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  const alarmTimers = useRef<number[]>([]);
  const lastRing = useRef<number>(initial?.ring_count || 0);
  const lastPhase = useRef<Phase>(phaseOf(initial));
  const armedRef = useRef(false);
  const swRef = useRef<ServiceWorkerRegistration | null>(null);

  const phase = phaseOf(s);
  const biz = s?.business || {};
  const tone = TONES.has(String(s?.tone)) ? String(s?.tone) : "chime";

  // ── الهوية: ألوان المتجر، وإلا هوية ركين.
  const theme = useMemo(() => {
    const surf = HEX.test(biz.surf || "") ? biz.surf! : "#121212";
    const accent = HEX.test(biz.accent || "") ? biz.accent! : "#C4FF2B";
    const card = HEX.test(biz.card || "") ? biz.card! : (lum(surf) > 0.5 ? "#FFFFFF" : "#1E1E1E");
    let ink = HEX.test(biz.ink || "") ? biz.ink! : (lum(surf) > 0.5 ? "#141414" : "#FBFAF5");
    // نصٌّ بلون الإبراز على خلفيةٍ قريبةٍ منه لا يُقرأ.
    if (Math.abs(lum(ink) - lum(surf)) < 0.3) ink = lum(surf) > 0.5 ? "#141414" : "#FBFAF5";
    const muted = HEX.test(biz.muted || "") ? biz.muted! : (lum(surf) > 0.5 ? "#6B6B6B" : "#A3A3A3");
    const onAccent = lum(accent) > 0.55 ? "#111111" : "#FFFFFF";
    return { surf, accent, card, ink, muted, onAccent };
  }, [biz.surf, biz.accent, biz.card, biz.ink, biz.muted]);

  // ── الجلب
  const fetchStatus = useCallback(async () => {
    if (!sbRef.current) return;
    try {
      const { data, error } = await sbRef.current.rpc("get_pager_status", { p_key: uuid });
      if (error) throw error;
      setOffline(false);
      if (data) setS(data as PagerStatus);
    } catch {
      setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    }
  }, [uuid]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return;
    const sb = createClient(url, anon, { auth: { persistSession: false } });
    sbRef.current = sb;
    // البثُّ اللحظيّ: القاعدة نفسها تبثّ عند كل تغيّر في الطلب (وصل،
    // جاهز، رنّة، تأجيل، استُلم) فيصل هنا في نصف ثانية -- ولا سؤال دوري.
    // وكل (إعادة) اشتراك يجلب مرّة: ما فات والاتصال مقطوع لا يضيع.
    // جلبةٌ أولى دائماً لو ما جاب الخادم الحالة -- ولو البثّ محجوب.
    if (!initial) void fetchStatus();
    let first = true;
    const ch = sb.channel(`pager:${uuid}`)
      .on("broadcast", { event: "pager" }, () => { void fetchStatus(); })
      .subscribe((status) => {
        liveRef.current = status === "SUBSCRIBED";
        if (status !== "SUBSCRIBED") return;
        // أول اشتراك بعد جلبةٍ لتوّها: لا داعي. وكل اشتراكٍ غيره (رجع
        // الاتصال، أو بين تحميل الخادم والاشتراك): جلبة واحدة.
        if (first && !initial) { first = false; return; }
        first = false;
        void fetchStatus();
      });
    return () => { try { sb.removeChannel(ch); } catch { /* أُغلقت */ } };
  }, [uuid, fetchStatus, initial]);

  // ولا سؤالَ كل ثوانٍ: يُجلب لما يرجع الزبون للصفحة أو يرجع النت (والبثّ
  // يعيد الاشتراك وحده، وأعلاه يجلب عند كل اشتراك). والسؤال الدوري احتياطٌ
  // لا يشتغل إلا والبثّ مقطوع (شبكةٌ تحجب الاتصال اللحظي) -- وفي العادة
  // لا يشتغل أبداً.
  useEffect(() => {
    if (phase === "collected" || phase === "cancelled") return;
    const vis = () => { if (document.visibilityState === "visible") void fetchStatus(); };
    const t = window.setInterval(() => { if (!liveRef.current) void fetchStatus(); }, 20000);
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("online", vis);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", vis); window.removeEventListener("online", vis); };
  }, [phase, fetchStatus]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // ── الشاشةُ لا تنطفئ ما دام البيجر شغّالاً.
  const holdScreen = useCallback(async () => {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (wl && document.visibilityState === "visible") wakeRef.current = await wl.request("screen");
    } catch { /* رُفض: البطارية منخفضة أو المتصفح لا يدعم */ }
  }, []);

  useEffect(() => {
    const again = () => { if (armedRef.current && document.visibilityState === "visible") void holdScreen(); };
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, [holdScreen]);

  // ── «قيد التشغيل» على شاشة القفل: اسمُ المحل ورقمُ الطلب وحالتُه.
  const setNowPlaying = useCallback((title: string) => {
    try {
      const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
      if (!ms || typeof MediaMetadata === "undefined") return;
      ms.metadata = new MediaMetadata({
        title,
        artist: biz.name || "بيجر ركين",
        album: "بيجر ركين",
        artwork: biz.logo && /^https:\/\//.test(biz.logo) ? [{ src: biz.logo, sizes: "512x512" }] : [],
      });
    } catch { /* لا يدعم */ }
  }, [biz.name, biz.logo]);

  // ── الإشعار: يُطلب مرّةً بضغطة الزبون. رفض؟ نكمل بالصوت والشاشة.
  const askNotifications = useCallback(async () => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setNotif(ios && !standalone ? "ios-home" : "unsupported");
      return;
    }
    try {
      const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      if (perm !== "granted") { setNotif("denied"); return; }
      const reg = await navigator.serviceWorker.register("/pager-sw.js", { scope: "/p/" });
      swRef.current = reg;
      setNotif("granted");
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapid) return;
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapid) as BufferSource });
      const j = sub.toJSON();
      if (j.endpoint && j.keys?.p256dh && j.keys?.auth && sbRef.current) {
        await sbRef.current.rpc("subscribe_pager_push", {
          p_key: uuid, p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
        });
      }
    } catch {
      // الإذن أُعطي لكن الاشتراك فشل (شبكة مثلاً): يبقى الصوت والإشعار المحلّي.
      if (Notification.permission === "granted") setNotif("granted");
    }
  }, [uuid]);

  // ── «شغّل البيجر»: ضغطةٌ واحدة تفتح الصوت والاهتزاز وتمسك الشاشة وتطلب الإشعار.
  const arm = useCallback(async (withSound = true) => {
    setAsked(true);
    silentRef.current = !withSound;
    setSilent(!withSound);
    if (armedRef.current) return;
    armedRef.current = true;
    setArmed(true);
    try {
      const keep = new Audio("/pager/keepalive.wav");
      keep.loop = true;
      keepRef.current = keep;
      void keep.play().catch(() => {});
      const t = new Audio(`/pager/${tone}.wav`);
      t.preload = "auto";
      toneRef.current = t;
      // يُفتح داخل الضغطة نفسها -- وإلا رفض المتصفح تشغيله لاحقاً.
      t.muted = true;
      void t.play().then(() => { t.pause(); t.currentTime = 0; t.muted = false; }).catch(() => { t.muted = false; });
      if (withSound) {
        const ok = new Audio("/pager/armed.wav");
        void ok.play().catch(() => {});
      }
    } catch { /* لا صوت */ }
    try { navigator.vibrate?.(80); } catch { /* لا اهتزاز */ }
    setNowPlaying(s?.order_id ? `طلب #${s.order_id} — يتجهز` : "طلبك — بانتظار التأكيد");
    void holdScreen();
    try { sessionStorage.setItem("rk-pager-armed:" + uuid, "1"); } catch { /* خاصّ */ }
    void askNotifications();
  }, [tone, setNowPlaying, holdScreen, askNotifications, uuid, s?.order_id]);

  // ── الرنين
  const stopAlarm = useCallback(() => {
    setAlarm(false);
    alarmTimers.current.forEach(id => window.clearInterval(id));
    alarmTimers.current = [];
    try { toneRef.current?.pause(); } catch { /* */ }
    try { navigator.vibrate?.(0); } catch { /* */ }
    document.title = document.title.replace(/^🔔 /, "");
  }, []);

  const startAlarm = useCallback((again: boolean) => {
    setAlarm(true);
    alarmTimers.current.forEach(id => window.clearInterval(id));
    alarmTimers.current = [];
    const t = toneRef.current || new Audio(`/pager/${tone}.wav`);
    toneRef.current = t;
    t.loop = true;
    t.currentTime = 0;
    if (!silentRef.current) void t.play().catch(() => {});
    const buzz = () => { try { navigator.vibrate?.([500, 180, 500, 180, 900]); } catch { /* */ } };
    buzz();
    alarmTimers.current.push(window.setInterval(buzz, 3000));
    const base = document.title.replace(/^🔔 /, "");
    let on = false;
    alarmTimers.current.push(window.setInterval(() => { on = !on; document.title = on ? "🔔 " + base : base; }, 900));
    // يكفّ وحده بعد دقيقة ونصف -- ورنّةُ الكاشير الثانية تعيده.
    const stopAt = window.setTimeout(() => stopAlarm(), 90000);
    alarmTimers.current.push(stopAt as unknown as number);
    setNowPlaying(`طلبك #${s?.order_id ?? ""} جاهز!`);
    // الصفحةُ في الخلفية والإذنُ معطى: إشعارٌ محلّي احتياطاً لإشعار الخادم.
    if (document.visibilityState !== "visible" && swRef.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
      void swRef.current.showNotification(biz.name || "ركين", {
        body: again ? `طلبك #${s?.order_id} ينتظرك! تفضّل استلمه` : `طلبك #${s?.order_id} جاهز! تفضّل استلمه`,
        tag: `pager-${s?.order_id}`, dir: "rtl", lang: "ar", requireInteraction: true,
        icon: biz.logo || "/pos-icon-192.png", data: { url: `/p/${pageKey}` },
        ...({ renotify: true, vibrate: [500, 180, 500, 180, 900] } as Record<string, unknown>),
      }).catch(() => {});
    }
  }, [tone, stopAlarm, setNowPlaying, s?.order_id, biz.name, biz.logo, pageKey]);

  // الحالةُ تغيّرت: جاهز؟ رنّة ثانية؟ استُلم؟
  useEffect(() => {
    const prev = lastPhase.current;
    lastPhase.current = phase;
    const ring = s?.ring_count || 0;
    if (selfDoneRef.current) { /* قفله بنفسه: لا رنين */ }
    else if (phase === "ready" && prev !== "ready") startAlarm(false);
    else if (phase === "ready" && ring > lastRing.current) startAlarm(true);
    else if (phase !== "ready" && alarm) stopAlarm();
    lastRing.current = ring;
    if (phase === "collected" || phase === "cancelled") {
      try { keepRef.current?.pause(); } catch { /* */ }
      try { void wakeRef.current?.release(); } catch { /* */ }
      setNowPlaying(phase === "collected" ? "بالعافية عليك" : "انلغى الطلب");
    } else if (phase === "preparing" && armedRef.current) {
      setNowPlaying(`طلب #${s?.order_id} — يتجهز`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, s?.ring_count]);

  useEffect(() => {
    try { if (localStorage.getItem("rk-pager-done:" + uuid)) { selfDoneRef.current = true; setSelfDone(true); } } catch { /* خاصّ */ }
  }, [uuid]);
  const markSelfDone = useCallback(() => {
    selfDoneRef.current = true;
    setSelfDone(true);
    stopAlarm();
    try { keepRef.current?.pause(); } catch { /* */ }
    try { void wakeRef.current?.release(); } catch { /* */ }
    try { localStorage.setItem("rk-pager-done:" + uuid, "1"); } catch { /* خاصّ */ }
  }, [uuid, stopAlarm]);

  // الخادم ردّ برسالة من عامل الخدمة والصفحة مفتوحة.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "pager-push") void fetchStatus(); };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [fetchStatus]);

  // ── الوقت
  const created = s?.created_at ? Date.parse(s.created_at) : now;
  const eta = s?.eta_at ? Date.parse(s.eta_at) : null;
  const leftMin = eta ? Math.ceil((eta - now) / 60000) : null;
  const progress = eta && eta > created ? Math.max(0.04, Math.min(1, (now - created) / (eta - created))) : 0.35;
  const etaText = phase !== "preparing" ? "" : eta == null
    ? "نجهزه لك الحين"
    : leftMin! > 1 ? `متوقع يجهز خلال ${leftMin} دقايق`
    : leftMin === 1 ? "متوقع يجهز خلال دقيقة"
    : "على وشك يجهز…";

  const R = 118;
  const C = 2 * Math.PI * R;
  const num = s?.order_id != null ? String(s.order_id) : "…";
  const numSize = num.length > 6 ? "pg-num pg-num-s" : num.length > 4 ? "pg-num pg-num-m" : "pg-num";

  const style = {
    "--pg-surf": theme.surf, "--pg-accent": theme.accent, "--pg-card": theme.card,
    "--pg-ink": theme.ink, "--pg-muted": theme.muted, "--pg-on-accent": theme.onAccent,
  } as React.CSSProperties;

  const logo = biz.logo && /^https:\/\//.test(biz.logo) ? biz.logo : null;

  const header = (
    <header className="pg-head">
      {logo ? <img className="pg-logo" src={logo} alt="" /> : <span className="pg-logo pg-logo-txt">{(biz.name || "ر").trim().charAt(0)}</span>}
      <div className="pg-head-txt">
        <b>{biz.name || "طلبك"}</b>
        {s?.branch ? <span>{s.branch}</span> : null}
      </div>
    </header>
  );

  if (phase === "ready" && !selfDone) {
    return (
      <main className={"pg-root pg-ready" + (alarm ? " pg-ringing" : "")} style={style} dir="rtl">
        {header}
        <div className="pg-burst" aria-hidden="true"><i /><i /><i /></div>
        <section className="pg-ready-core">
          <span className="pg-label">رقم طلبك</span>
          <span className={numSize}>{num}</span>
        </section>
        <h1 className="pg-ready-title">طلبك جاهز!</h1>
        <p className="pg-ready-sub">{s?.ready_msg || "تفضّل استلمه من الكاونتر"}</p>
        {(s?.ring_count || 0) > 0 ? <p className="pg-again">نناديك مرة ثانية — طلبك ينتظرك</p> : null}
        <div className="pg-ready-acts">
          {alarm
            ? <button className="pg-btn pg-btn-dark" onClick={stopAlarm}>{silent ? "شفته، وقّف الهزّ" : "شفته، وقّف الصوت"}</button>
            : !armed ? <button className="pg-btn pg-btn-dark" onClick={() => { void arm(true); }}>شغّل الصوت</button> : null}
          <button className="pg-btn pg-btn-ghost" onClick={markSelfDone}>استلمت طلبي ✓</button>
        </div>
        <footer className="pg-foot">بيجر ركين</footer>
      </main>
    );
  }

  if (phase === "collected" || phase === "cancelled" || (phase === "ready" && selfDone)) {
    return (
      <main className="pg-root pg-done" style={style} dir="rtl">
        {header}
        <section className="pg-done-core">
          <div className="pg-done-mark" aria-hidden="true">{phase === "cancelled" ? "×" : "✓"}</div>
          <h1>{phase === "cancelled" ? "انلغى الطلب" : "بالعافية عليك"}</h1>
          <p>{phase === "cancelled" ? "لو عندك سؤال كلّم الكاشير." : `استلمت طلبك #${num}. نشوفك مرة ثانية!`}</p>
        </section>
        <footer className="pg-foot">بيجر ركين</footer>
      </main>
    );
  }

  return (
    <main className="pg-root" style={style} dir="rtl">
      {header}
      <p className="pg-hi">{phase === "waiting" ? "طلبك في الطريق لنا…" : s?.customer ? `هلا ${s.customer}، طلبك عندنا` : "هلا، طلبك عندنا"}</p>

      <section className="pg-ring" aria-label={`رقم طلبك ${num}`}>
        <svg viewBox="0 0 260 260" aria-hidden="true">
          <circle cx="130" cy="130" r={R} className="pg-ring-track" />
          <circle cx="130" cy="130" r={R} className="pg-ring-fill"
            strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - progress)).toFixed(1)} />
        </svg>
        <div className="pg-ring-in">
          <span className="pg-label">رقم طلبك</span>
          <span className={numSize}>{phase === "waiting" ? "…" : num}</span>
        </div>
        {armed ? <span className="pg-pulse" aria-hidden="true" /> : null}
      </section>

      <p className="pg-eta">{phase === "waiting" ? "أول ما يوصل للنظام تظهر حالته هنا" : etaText}</p>
      {s?.delayed_at && phase === "preparing" ? <p className="pg-delay">تأخرنا عليك شوي، سامحنا — نجهزه لك الحين</p> : null}

      <ol className="pg-steps">
        <li className={phase !== "waiting" ? "on" : ""}><i />استلمناه</li>
        <li className={phase === "preparing" ? "on now" : ""}><i />يتجهز</li>
        <li><i />جاهز</li>
      </ol>

      {!armed ? (
        <button className="pg-arm" onClick={() => { void arm(true); }}>
          <span className="pg-arm-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          </span>
          <span className="pg-arm-txt">
            <b>شغّل البيجر</b>
            <small>عشان نرن ونهز جوالك أول ما يجهز طلبك</small>
          </span>
        </button>
      ) : (
        <div className="pg-armed">
          <span className="pg-armed-dot" aria-hidden="true" />
          <div>
            <b>{silent ? "البيجر شغّال — بدون صوت" : "البيجر شغّال"}</b>
            <small>
              {silent
                ? "بنهزّ جوالك ونطلّع لك تنبيه أول ما يجهز."
                : notif === "granted"
                ? "بيوصلك تنبيه حتى لو قفلت الجوال."
                : "خلّ الصفحة مفتوحة وحط الجوال قدامك — بنرن ونهزّه لما يجهز."}
            </small>
            {silent ? (
              <button className="pg-link" onClick={() => { silentRef.current = false; setSilent(false); try { void new Audio("/pager/armed.wav").play().catch(() => {}); } catch { /* */ } }}>شغّل الصوت</button>
            ) : null}
            {notif === "ios-home" ? (
              <button className="pg-link" onClick={() => setShowIosHelp(v => !v)}>تبي التنبيه وجوالك مقفول؟</button>
            ) : null}
            {showIosHelp ? (
              <small className="pg-ios">في سفاري: زر المشاركة ← «إضافة إلى الشاشة الرئيسية»، وافتحه من هناك وشغّل البيجر.</small>
            ) : null}
          </div>
        </div>
      )}

      {!armed && !asked && (phase === "preparing" || phase === "waiting") ? (
        <div className="pg-ask" role="dialog" aria-modal="true" aria-labelledby="pg-ask-t">
          <div className="pg-ask-card">
            <span className="pg-arm-ic pg-ask-ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            </span>
            <b id="pg-ask-t">نرن جوالك لما يجهز طلبك؟</b>
            <small>اضغط «موافق» ونشغّل لك الصوت. خلّ الصفحة مفتوحة أو بالخلفية.</small>
            <button className="pg-ask-yes" onClick={() => { void arm(true); }}>موافق، شغّل الصوت</button>
            <button className="pg-ask-no" onClick={() => { void arm(false); }}>بدون صوت — هزّ بس</button>
          </div>
        </div>
      ) : null}

      {offline ? <p className="pg-offline">النت عندك مقطوع — أول ما يرجع نكمل، وتقدر تتابع رقمك على شاشة المحل.</p> : null}
      <footer className="pg-foot">بيجر ركين</footer>
    </main>
  );
}
