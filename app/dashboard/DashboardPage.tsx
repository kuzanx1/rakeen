"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { Worker as TesseractWorker, Line as TesseractLine } from "tesseract.js";
import "./rakeen-dashboard.css";
import "./rakeen-dashboard-responsive.css";
import { dashboardMarkup } from "./dashboard-markup";

const SCRIPT_SRC = "/dashboard/rakeen-dashboard.js";

export interface ReportPayload {
  businessName: string;
  reportTitle: string;
  generatedAt: string;
  stats: { label: string; value: string; total?: boolean }[];
  table?: { headers: string[]; rows: (string | number)[][] };
}

export interface ZatcaInvoiceData {
  sellerName?: string;
  vatNumber?: string;
  timestamp?: string;
  total?: number;
  vatTotal?: number;
}

export interface OcrTextResult {
  text: string;
  meanConfidence: number;
  // word/line bounding-box geometry, passed through as-is from Tesseract —
  // the deterministic parser (rakeen-dashboard.js) reconstructs table rows
  // from pixel position and reading direction instead of trusting the
  // flattened `text` string's token order, which isn't reliable (see the
  // comment above parseInvoiceLines in rakeen-dashboard.js for why).
  lines: TesseractLine[];
}

// One column spec drives both the generated .xlsx template (header text,
// width, in-sheet dropdown) and the uploaded-file parser (which cell maps to
// which key) — the classic script builds this once per section so the two
// bridge functions below never need section-specific knowledge.
export interface BulkImportColumn {
  key: string;
  header: string;
  width?: number;
  type?: "text" | "number" | "list";
  options?: string[];
  // list column whose dropdown is a suggestion, not a hard constraint
  // (e.g. menu categories — typing a new one is valid, just offer the existing ones)
  loose?: boolean;
  required?: boolean;
}

export interface BulkImportSpec {
  sheetTitle: string;
  fileName: string;
  businessName: string;
  instructions: string;
  columns: BulkImportColumn[];
  exampleRow: (string | number)[];
}

export interface BulkImportParsedRow {
  __row: number;
  [key: string]: string | number;
}

declare global {
  interface Window {
    supabaseClient?: ReturnType<typeof createBrowserClient>;
    generateReportExcel?: (payload: ReportPayload) => Promise<void>;
    downloadBulkImportTemplate?: (spec: BulkImportSpec) => Promise<void>;
    parseBulkImportFile?: (file: File, columns: BulkImportColumn[]) => Promise<BulkImportParsedRow[]>;
    enableOwnerPushNotifications?: () => Promise<void>;
    scanZatcaInvoiceQr?: (file: File) => Promise<ZatcaInvoiceData | null>;
    scanInvoiceOcrText?: (file: File) => Promise<OcrTextResult | null>;
    preprocessInvoiceImage?: (file: File) => Promise<Blob | null>;
  }
}

// Excel cells can hold plain values, rich-text runs, hyperlink objects, or
// formula results — normalize all of them to the primitive the classic
// script's validators expect.
function cellToPrimitive(raw: unknown): string | number {
  if (raw == null) return "";
  if (typeof raw === "object") {
    const obj = raw as { richText?: { text: string }[]; result?: unknown; text?: unknown };
    if (Array.isArray(obj.richText)) return obj.richText.map((rt) => rt.text).join("");
    if ("result" in obj) return (obj.result as string | number) ?? "";
    if ("text" in obj) return (obj.text as string | number) ?? "";
    return "";
  }
  return raw as string | number;
}

// Saudi tax invoices are legally required (ZATCA e-invoicing) to carry a QR
// code holding TLV-encoded fields: 1=seller name, 2=VAT number, 3=timestamp,
// 4=invoice total, 5=VAT total. Decoding that QR needs no AI/external API —
// it's a fixed, documented binary format any invoice photo already contains.
function parseZatcaTlv(base64: string): ZatcaInvoiceData {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const decoder = new TextDecoder("utf-8");
  const result: ZatcaInvoiceData = {};
  let i = 0;
  while (i + 1 < bytes.length) {
    const tag = bytes[i];
    const len = bytes[i + 1];
    const value = decoder.decode(bytes.slice(i + 2, i + 2 + len));
    i += 2 + len;
    if (tag === 1) result.sellerName = value;
    else if (tag === 2) result.vatNumber = value;
    else if (tag === 3) result.timestamp = value;
    else if (tag === 4) result.total = parseFloat(value);
    else if (tag === 5) result.vatTotal = parseFloat(value);
  }
  return result;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function DashboardPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // fresh boot each mount — cleanup below resets the flag so a remount
    // (React Strict Mode's dev-only mount->cleanup->mount) re-initializes cleanly.
    // "checking" (not "login") because the markup's default-visible screen is
    // now #sessionCheckScreen, not the login form — see restoreSession() in
    // rakeen-dashboard.js for the flash-of-login-page fix this is part of.
    document.body.dataset.stage = "checking";
    container.innerHTML = dashboardMarkup;

    // created before the classic script boots, so it's already available as
    // window.supabaseClient by the time rakeen-dashboard.js runs
    //
    // Named cookie is deliberate: without it, createBrowserClient falls back
    // to a name derived only from the Supabase project URL — identical on
    // /dashboard, /pos and /kitchen since they share one project. All three
    // run real owner/employee sign-ins (POS/kitchen device pairing signs in
    // with the owner's own email; the cashier PIN flow calls setSession())
    // directly against window.supabaseClient, so on the same origin they'd
    // silently overwrite each other's session cookie — an owner mid-session
    // on the dashboard would find themselves running as whatever account a
    // POS/kitchen tab last touched, producing exactly the symptoms reported:
    // "تعذر الحفظ" permission errors while logged in as the owner, and a
    // broken auto-restored session showing the wrong account. Each surface
    // now gets its own isolated cookie/session.
    window.supabaseClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookieOptions: { name: 'sb-rakeen-dashboard-auth' } }
    );

    // jsqr is dynamically imported for the same reason as exceljs below —
    // only fetched the first time someone actually scans an invoice photo.
    // Pure client-side QR decode, no network call, no AI/vision API.
    window.scanZatcaInvoiceQr = async (file) => {
      const jsQR = (await import("jsqr")).default;
      const imageUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = imageUrl;
      });
      const maxDim = 1600;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
      if (!code) return null;
      try {
        return parseZatcaTlv(code.data);
      } catch {
        return null;
      }
    };

    // Shared by both the local OCR pass below and the vision-Gemini upload
    // (see preprocessInvoiceImage) — grayscale + per-image histogram stretch
    // (the canvas equivalent of sharp's .normalize(), benchmarked against
    // real invoice photos as meaningfully better than a fixed CSS
    // contrast()/brightness() filter: thermal receipts vary too much in
    // exposure for a fixed boost to help consistently; a fixed boost blows
    // out already-bright receipts and does too little for dim ones, while
    // stretching each photo's own actual min/max range adapts to both).
    // maxDim caps resolution rather than upscaling — 3200px is already
    // confirmed sufficient to keep a receipt's line-item table legible, and
    // capping (not enlarging) it also means a raw multi-megapixel phone
    // photo gets *smaller*, not bigger, before it ever reaches a paid API —
    // directly relevant to image-token cost on the vision-Gemini tier,
    // which used to receive the untouched original file.
    async function enhanceInvoiceImageCanvas(file: File, maxDim: number): Promise<HTMLCanvasElement | null> {
      const imageUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = imageUrl;
      });
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = imgData.data;
      const gray = new Uint8ClampedArray(px.length / 4);
      let lo = 255, hi = 0;
      for (let i = 0, j = 0; i < px.length; i += 4, j++) {
        const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        gray[j] = g;
        if (g < lo) lo = g;
        if (g > hi) hi = g;
      }
      const range = hi - lo || 1;
      for (let i = 0, j = 0; i < px.length; i += 4, j++) {
        const stretched = ((gray[j] - lo) / range) * 255;
        px[i] = px[i + 1] = px[i + 2] = stretched;
      }
      ctx.putImageData(imgData, 0, 0);
      return canvas;
    }

    // Available to the invoice-scan flow (rakeen-dashboard.js) so the same
    // clarity pass Tesseract already benefits from also applies before a
    // photo is uploaded to the vision-Gemini tier, which previously sent
    // the raw, unprocessed file.
    window.preprocessInvoiceImage = async (file) => {
      const canvas = await enhanceInvoiceImageCanvas(file, 3200);
      if (!canvas) return null;
      return new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92));
    };

    // tesseract.js is dynamically imported for the same reason as jsqr above
    // — only fetched the first time someone actually scans an invoice photo.
    // Assets (worker script, WASM core, ara/eng traineddata) are self-hosted
    // under public/tesseract/ rather than Tesseract's default jsDelivr CDN,
    // matching how jsqr/exceljs ship as real deps rather than runtime
    // third-party fetches. The worker is created once per dashboard session
    // (WASM+traineddata init is the expensive part) and reused across scans.
    // PSM.SINGLE_COLUMN was chosen after benchmarking real invoice photos —
    // it reads the full receipt including the line-item table, where the
    // default AUTO mode often only detects a small high-contrast region.
    let ocrWorkerPromise: Promise<TesseractWorker> | null = null;
    window.scanInvoiceOcrText = async (file) => {
      const { createWorker, PSM } = await import("tesseract.js");
      if (!ocrWorkerPromise) {
        // tesseract.js wraps the worker script in a Blob URL internally, and
        // root-relative paths ("/tesseract/...") don't resolve against a
        // blob: URL base — must be fully-qualified absolute URLs (same as
        // every workerPath/corePath/langPath example in tesseract.js's own
        // docs, which are always absolute CDN URLs, never root-relative).
        const base = window.location.origin;
        ocrWorkerPromise = createWorker(["ara", "eng"], undefined, {
          workerPath: `${base}/tesseract/worker.min.js`,
          corePath: `${base}/tesseract/core`,
          langPath: `${base}/tesseract/lang-data`,
        }).catch((e) => {
          ocrWorkerPromise = null;
          throw e;
        });
      }
      const worker = await ocrWorkerPromise;
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN });

      // OCR wants more resolution than the QR decode above (3200px long edge
      // vs 1600px) — confirmed against real invoice photos that the line-item
      // table gets lost at lower resolutions.
      const canvas = await enhanceInvoiceImageCanvas(file, 3200);
      if (!canvas) return null;

      const { data } = await worker.recognize(canvas);
      return { text: data.text, meanConfidence: data.confidence, lines: data.lines };
    };

    // exceljs is dynamically imported so it never lands in the initial
    // dashboard bundle — only fetched the first time someone actually
    // exports a report. The classic script (rakeen-dashboard.js) has the
    // real report data already loaded; this just turns it into a styled
    // .xlsx and triggers a download, entirely client-side.
    window.generateReportExcel = async (payload) => {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Rakeen";
      wb.created = new Date();
      const ws = wb.addWorksheet(payload.reportTitle.slice(0, 30) || "تقرير", {
        views: [{ rightToLeft: true }],
      });
      ws.columns = [{ width: 32 }, { width: 20 }, { width: 20 }, { width: 20 }];

      const titleRow = ws.addRow([`ركين — ${payload.businessName}`]);
      titleRow.font = { bold: true, size: 14, color: { argb: "FF111111" } };
      ws.mergeCells(titleRow.number, 1, titleRow.number, 4);

      const subRow = ws.addRow([payload.reportTitle]);
      subRow.font = { bold: true, size: 12, color: { argb: "FF555555" } };
      ws.mergeCells(subRow.number, 1, subRow.number, 4);

      const dateRow = ws.addRow([`تاريخ الإصدار: ${payload.generatedAt}`]);
      dateRow.font = { size: 10, color: { argb: "FF888888" } };
      ws.mergeCells(dateRow.number, 1, dateRow.number, 4);

      ws.addRow([]);

      if (payload.stats.length > 0) {
        payload.stats.forEach((s) => {
          const row = ws.addRow([s.label, s.value]);
          row.font = { bold: !!s.total, size: s.total ? 12 : 11 };
          if (s.total) row.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2FFD1" } }));
        });
        ws.addRow([]);
      }

      if (payload.table) {
        const headerRow = ws.addRow(payload.table.headers);
        headerRow.eachCell((c) => {
          c.font = { bold: true, color: { argb: "FFFFFFFF" } };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111111" } };
        });
        payload.table.rows.forEach((r, i) => {
          const row = ws.addRow(r);
          if (i % 2 === 1) row.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAFA" } }));
        });
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${payload.reportTitle} - ${payload.businessName}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    };

    // Bulk-onboarding template generator — one branded, Rakeen-identity .xlsx
    // per Rakeen section (stock/menu/modifiers), built entirely from the
    // column spec the classic script passes in. Uses only widely-supported
    // OOXML features (fills, fonts, list data validation, frozen panes) so
    // the file opens cleanly in both Microsoft Excel and Google Sheets — no
    // Excel-only constructs. A hidden marker column after the declared
    // columns flags the built-in example row so the parser can skip it even
    // if the person filling it in forgets to delete it.
    window.downloadBulkImportTemplate = async (spec) => {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Rakeen";
      wb.created = new Date();
      const ws = wb.addWorksheet(spec.sheetTitle.slice(0, 30) || "قالب");

      const colCount = spec.columns.length;
      const markerColIndex = colCount + 1;
      ws.columns = [...spec.columns.map((c) => ({ width: c.width || 20 })), { width: 2 }];

      const titleRow = ws.addRow([`ركين — ${spec.businessName}`]);
      titleRow.height = 26;
      titleRow.font = { bold: true, size: 15, color: { argb: "FF111111" } };
      titleRow.alignment = { vertical: "middle", horizontal: "right" };
      ws.mergeCells(titleRow.number, 1, titleRow.number, colCount);
      titleRow.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC4FF2B" } }));

      const subRow = ws.addRow([spec.sheetTitle]);
      subRow.font = { bold: true, size: 12, color: { argb: "FF555555" } };
      ws.mergeCells(subRow.number, 1, subRow.number, colCount);

      const instrRow = ws.addRow([spec.instructions]);
      instrRow.font = { size: 10.5, color: { argb: "FF666666" }, italic: true };
      instrRow.alignment = { wrapText: true, vertical: "top", horizontal: "right" };
      instrRow.height = 34;
      ws.mergeCells(instrRow.number, 1, instrRow.number, colCount);

      const legendRow = ws.addRow([
        "الأعمدة المميزة بـ (*) إلزامية — الباقي اختياري. لا تحذف صف العناوين ولا تغيّر ترتيب الأعمدة، واحذف صف المثال قبل ما ترفع الملف.",
      ]);
      legendRow.font = { size: 9.5, color: { argb: "FF999999" } };
      ws.mergeCells(legendRow.number, 1, legendRow.number, colCount);

      ws.addRow([]);

      const headerRow = ws.addRow(spec.columns.map((c) => c.header + (c.required ? " *" : "")));
      headerRow.height = 22;
      headerRow.eachCell((cell, colNum) => {
        if (colNum > colCount) return;
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111111" } };
        cell.alignment = { horizontal: "right", vertical: "middle" };
      });
      const headerRowNumber = headerRow.number;

      const exampleRow = ws.addRow([...spec.exampleRow]);
      exampleRow.eachCell((cell, colNum) => {
        if (colNum > colCount) return;
        cell.font = { italic: true, color: { argb: "FFAAAAAA" }, size: 10.5 };
      });
      exampleRow.getCell(markerColIndex).value = "مثال";
      ws.getColumn(markerColIndex).hidden = true;

      const lastDataRow = headerRowNumber + 200;
      for (let r = headerRowNumber + 1; r <= lastDataRow; r++) {
        spec.columns.forEach((col, i) => {
          const cell = ws.getCell(r, i + 1);
          if (col.type === "number") cell.numFmt = "0.00";
          if (col.type === "list" && col.options && col.options.length > 0) {
            cell.dataValidation = {
              type: "list",
              allowBlank: !col.required,
              formulae: [`"${col.options.join(",")}"`],
              showErrorMessage: !col.loose,
              errorStyle: "warning",
              errorTitle: "قيمة غير موجودة بالقائمة",
              error: "اختر قيمة من القائمة المنسدلة اللي تظهر بالخلية.",
            };
          }
        });
      }

      ws.views = [{ rightToLeft: true, state: "frozen", ySplit: headerRowNumber }];

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${spec.fileName}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    };

    // Reads a filled-in bulk-import template back. Locates the header row by
    // matching the first column's label (robust to the person adding blank
    // rows above it), then walks every row after it, skipping the hidden
    // example-row marker and fully-blank rows. Returns raw cell values —
    // validation (required fields, name-collision checks, unit/category
    // mapping) stays in the classic script, which already owns that logic
    // for the manual add-item forms.
    window.parseBulkImportFile = async (file, columns) => {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      await wb.xlsx.load(buffer);
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("الملف فاضي أو تالف");

      const firstHeader = columns[0].header;
      let headerRowNumber = -1;
      ws.eachRow((row, rowNumber) => {
        if (headerRowNumber !== -1) return;
        const text = String(cellToPrimitive(row.getCell(1).value)).trim();
        if (text === firstHeader || text === firstHeader + " *") headerRowNumber = rowNumber;
      });
      if (headerRowNumber === -1) {
        throw new Error("ما قدرنا نلقى صف العناوين — لا تعدّل أسماء الأعمدة أو ترتيبها بالقالب");
      }

      const markerColIndex = columns.length + 1;
      const results: BulkImportParsedRow[] = [];
      // ws.actualRowCount undercounts in some ExcelJS-written files (it can
      // miss the last row that actually has data) — ws.rowCount is the true
      // upper bound and costs nothing extra since blank rows are filtered
      // below anyway.
      const lastRow = ws.rowCount;
      for (let r = headerRowNumber + 1; r <= lastRow; r++) {
        const row = ws.getRow(r);
        if (cellToPrimitive(row.getCell(markerColIndex).value) !== "") continue;
        let hasAny = false;
        const obj: BulkImportParsedRow = { __row: r };
        columns.forEach((col, i) => {
          const val = cellToPrimitive(row.getCell(i + 1).value);
          if (val !== "") hasAny = true;
          obj[col.key] = val;
        });
        if (hasAny) results.push(obj);
      }
      return results;
    };

    // real Web Push subscribe flow for the owner/manager themselves — same
    // VAPID pipeline as the customer loyalty card, but the subscription row
    // is written via a direct authenticated insert (RLS-gated to the caller's
    // own profile_id), not an anon security-definer RPC.
    window.enableOwnerPushNotifications = async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("المتصفح ما يدعم الإشعارات");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("تم رفض إذن الإشعارات");
      }
      const reg = await navigator.serviceWorker.register("/dashboard-sw.js");
      await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const subJson = sub.toJSON();
      const sb = window.supabaseClient!;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("جلسة غير صالحة");
      const { data: profile } = await sb.from("profiles").select("business_id").eq("id", user.id).single();
      if (!profile) throw new Error("الحساب غير موجود");
      const { error } = await sb.from("owner_push_subscriptions").upsert(
        {
          business_id: profile.business_id,
          profile_id: user.id,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys!.p256dh,
          auth: subJson.keys!.auth,
        },
        { onConflict: "endpoint" }
      );
      if (error) throw error;
    };

    // registering itself needs no permission prompt (only actually subscribing
    // to push does, inside enableOwnerPushNotifications above) — so it's safe
    // to always register, which is what lets "Add to Home Screen" behave like
    // an installed app right away instead of only after the owner opts into
    // push notifications for the first time.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/dashboard-sw.js").catch(() => {});
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    document.body.appendChild(script);

    // closes the mobile sidebar drawer after picking a screen — purely additive,
    // doesn't touch rakeen-dashboard.js's own click handling for the same buttons
    const onNavClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(".nav-item")) setSidebarOpen(false);
    };
    container.addEventListener("click", onNavClick);

    return () => {
      container.removeEventListener("click", onNavClick);
      script.remove();
      delete (window as unknown as { __rakeenDashboardBooted?: boolean }).__rakeenDashboardBooted;
      delete (window as unknown as { __rakeenDeepLinkHandled?: boolean }).__rakeenDeepLinkHandled;
      if (ocrWorkerPromise) {
        ocrWorkerPromise.then((w) => w.terminate()).catch(() => {});
        ocrWorkerPromise = null;
      }
      delete window.supabaseClient;
      delete window.generateReportExcel;
      delete window.downloadBulkImportTemplate;
      delete window.parseBulkImportFile;
      delete window.scanZatcaInvoiceQr;
      delete window.scanInvoiceOcrText;
      delete window.enableOwnerPushNotifications;
      container.innerHTML = "";
      delete document.body.dataset.stage;
      document.body.classList.remove("rk-sidebar-open");
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("rk-sidebar-open", sidebarOpen);
  }, [sidebarOpen]);

  return (
    <>
      {/* display:contents so this wrapper never becomes a flex item of <body> itself —
          rakeen-dashboard.css expects .auth-screen/.app-shell to be body's direct children */}
      <div ref={containerRef} style={{ display: "contents" }} />
      <button
        type="button"
        className={`rk-hamburger-btn${sidebarOpen ? " rk-open" : ""}`}
        aria-label="فتح القائمة"
        onClick={() => setSidebarOpen((v) => !v)}
      >
        <span />
        <span />
        <span />
      </button>
      <div
        className={`rk-sidebar-backdrop${sidebarOpen ? " rk-open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      {/* Mobile bottom nav — the 5 screens an owner/manager actually needs
          mid-shift (see the mobile UX plan). "المزيد" opens the same drawer
          as the hamburger rather than duplicating a second overflow
          mechanism. Buttons just forward to the existing .nav-item click
          handlers in rakeen-dashboard.js — no screen-switching logic is
          duplicated here. */}
      <nav className="rk-bottom-nav" aria-label="التنقل الرئيسي">
        <button type="button" className="rk-bn-item" onClick={() => document.querySelector<HTMLButtonElement>('.nav-item[data-screen="home"]')?.click()}>
          <span className="rk-bn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg></span>
          <span>الرئيسية</span>
        </button>
        <button type="button" className="rk-bn-item" onClick={() => document.querySelector<HTMLButtonElement>('.nav-item[data-screen="orders"]')?.click()}>
          <span className="rk-bn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg></span>
          <span>الطلبات</span>
        </button>
        <button type="button" className="rk-bn-item" onClick={() => document.querySelector<HTMLButtonElement>('.nav-item[data-screen="inventory"]')?.click()}>
          <span className="rk-bn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg></span>
          <span>المخزون</span>
        </button>
        <button type="button" className="rk-bn-item" onClick={() => document.querySelector<HTMLButtonElement>('.nav-item[data-screen="purchases"]')?.click()}>
          <span className="rk-bn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg></span>
          <span>المشتريات</span>
        </button>
        {/* Opens the same drawer as the hamburger — deliberately a grid icon,
            not more hamburger bars, so it doesn't read as a second, redundant
            menu trigger next to the real one. */}
        <button type="button" className="rk-bn-item" onClick={() => setSidebarOpen(true)}>
          <span className="rk-bn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg></span>
          <span>المزيد</span>
        </button>
      </nav>
      {/* Context-aware primary action — content (icon/label/target) is set
          per-screen by rakeen-dashboard.js's nav-item handler, not here, so
          it can reuse each screen's existing "add" action instead of
          duplicating business logic. Hidden by default; JS reveals it only
          on screens that actually have a fast-path action. */}
      <button type="button" className="rk-fab hidden" id="rkFab" aria-label="إجراء سريع" />
    </>
  );
}
