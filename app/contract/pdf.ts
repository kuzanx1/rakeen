// Client-only: turns a rendered <ContractDocument> into an A4 PDF.
//
// Arabic shaping in PDF libraries is unreliable, so the browser renders the
// text (with the real Thmanyah fonts, computed styles inlined by
// modern-screenshot) and each [data-pdf-block] is
// rasterised separately, then packed onto A4 pages — a page break only
// ever falls between blocks, never through a line. Both libraries are
// dynamically imported so they never load until a PDF is actually made.

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const FOOTER = 8;

export async function contractPdfBlob(root: HTMLElement, contractNumber: string): Promise<Blob> {
  const [{ domToCanvas }, { jsPDF }] = await Promise.all([import("modern-screenshot"), import("jspdf")]);
  await document.fonts.ready;

  // Render at a fixed A4-ish width regardless of the phone's screen width.
  const host = document.createElement("div");
  host.className = "cdoc-print-host";
  host.appendChild(root.cloneNode(true));
  document.body.appendChild(host);

  try {
    const blocks = Array.from(host.querySelectorAll<HTMLElement>("[data-pdf-block]"));
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const contentW = PAGE_W - MARGIN * 2;
    const bottom = PAGE_H - MARGIN - FOOTER;
    let y = MARGIN;

    for (const block of blocks) {
      const canvas = await domToCanvas(block, { scale: 2, backgroundColor: "#ffffff" });
      const h = (canvas.height * contentW) / canvas.width;
      if (y + h > bottom && y > MARGIN) {
        pdf.addPage();
        y = MARGIN;
      }
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", MARGIN, y, contentW, h, undefined, "FAST");
      y += h + 2;
    }

    const pages = pdf.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(140);
      pdf.text(`${contractNumber}  ·  ${i} / ${pages}  ·  rakeenapp.com`, PAGE_W / 2, PAGE_H - MARGIN / 2, { align: "center" });
    }
    return pdf.output("blob");
  } finally {
    host.remove();
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
