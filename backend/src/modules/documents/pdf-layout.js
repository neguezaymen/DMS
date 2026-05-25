const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = { top: 56, bottom: 48, left: 48, right: 48 };

const COLORS = {
  primary: rgb(0.12, 0.23, 0.54),
  accent: rgb(0.23, 0.51, 0.96),
  accentSoft: rgb(0.91, 0.95, 1),
  text: rgb(0.11, 0.13, 0.17),
  muted: rgb(0.42, 0.45, 0.5),
  border: rgb(0.86, 0.88, 0.92),
  white: rgb(1, 1, 1),
  success: rgb(0.09, 0.52, 0.31),
  headerBg: rgb(0.12, 0.23, 0.54),
};

function wrapText(text, font, size, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

class ModernPdfBuilder {
  constructor() {
    this.doc = null;
    this.regular = null;
    this.bold = null;
    this.page = null;
    this.y = 0;
    this.pageIndex = 0;
    this.footerLabel = "DMS Workspace — Document de démonstration";
  }

  async init({ footerLabel } = {}) {
    this.doc = await PDFDocument.create();
    this.regular = await this.doc.embedFont(StandardFonts.Helvetica);
    this.bold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    if (footerLabel) this.footerLabel = footerLabel;
    this.newPage();
    return this;
  }

  contentWidth() {
    return PAGE_W - MARGIN.left - MARGIN.right;
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pageIndex += 1;
    this.y = PAGE_H - MARGIN.top;
    this.drawFooter();
  }

  ensureSpace(needed) {
    if (this.y - needed < MARGIN.bottom + 24) {
      this.newPage();
    }
  }

  drawFooter() {
    const footerY = 28;
    this.page.drawLine({
      start: { x: MARGIN.left, y: footerY + 14 },
      end: { x: PAGE_W - MARGIN.right, y: footerY + 14 },
      thickness: 0.5,
      color: COLORS.border,
    });
    this.page.drawText(this.footerLabel, {
      x: MARGIN.left,
      y: footerY,
      size: 8,
      font: this.regular,
      color: COLORS.muted,
    });
    this.page.drawText(`Page ${this.pageIndex}`, {
      x: PAGE_W - MARGIN.right - 40,
      y: footerY,
      size: 8,
      font: this.regular,
      color: COLORS.muted,
    });
  }

  drawBrandHeader({ eyebrow, title, subtitle, badge, meta = [] }) {
    const headerH = 88;
    this.page.drawRectangle({
      x: 0,
      y: PAGE_H - headerH,
      width: PAGE_W,
      height: headerH,
      color: COLORS.headerBg,
    });
    this.page.drawRectangle({
      x: 0,
      y: PAGE_H - headerH,
      width: 6,
      height: headerH,
      color: COLORS.accent,
    });

    if (eyebrow) {
      this.page.drawText(String(eyebrow).toUpperCase(), {
        x: MARGIN.left,
        y: PAGE_H - 34,
        size: 8,
        font: this.bold,
        color: rgb(0.75, 0.82, 0.98),
      });
    }

    this.page.drawText(String(title || "Document"), {
      x: MARGIN.left,
      y: PAGE_H - 54,
      size: 18,
      font: this.bold,
      color: COLORS.white,
    });

    if (subtitle) {
      this.page.drawText(String(subtitle), {
        x: MARGIN.left,
        y: PAGE_H - 70,
        size: 10,
        font: this.regular,
        color: rgb(0.85, 0.9, 0.98),
      });
    }

    if (badge) {
      const badgeText = String(badge);
      const badgeW = this.bold.widthOfTextAtSize(badgeText, 8) + 16;
      this.page.drawRectangle({
        x: PAGE_W - MARGIN.right - badgeW,
        y: PAGE_H - 42,
        width: badgeW,
        height: 18,
        color: COLORS.accent,
        borderRadius: 4,
      });
      this.page.drawText(badgeText, {
        x: PAGE_W - MARGIN.right - badgeW + 8,
        y: PAGE_H - 37,
        size: 8,
        font: this.bold,
        color: COLORS.white,
      });
    }

    this.y = PAGE_H - headerH - 28;

    if (meta.length > 0) {
      this.drawMetaRow(meta);
    }
  }

  drawMetaRow(items) {
    const cols = Math.min(items.length, 3);
    const colW = this.contentWidth() / cols;
    const boxH = 52;
    this.ensureSpace(boxH + 12);

    for (let i = 0; i < items.length; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = MARGIN.left + col * colW + (col > 0 ? 6 : 0);
      const yBox = this.y - row * (boxH + 8);
      const w = colW - (col < cols - 1 ? 6 : 0);

      this.page.drawRectangle({
        x,
        y: yBox - boxH,
        width: w,
        height: boxH,
        color: COLORS.accentSoft,
        borderColor: COLORS.border,
        borderWidth: 0.5,
      });
      this.page.drawText(String(items[i].label || "").toUpperCase(), {
        x: x + 10,
        y: yBox - 16,
        size: 7,
        font: this.bold,
        color: COLORS.muted,
      });
      const valueLines = wrapText(items[i].value, this.bold, 10, w - 20).slice(0, 2);
      valueLines.forEach((line, li) => {
        this.page.drawText(line, {
          x: x + 10,
          y: yBox - 30 - li * 12,
          size: 10,
          font: this.bold,
          color: COLORS.text,
        });
      });
    }

    const rows = Math.ceil(items.length / cols);
    this.y -= rows * (boxH + 8) + 8;
  }

  drawSectionTitle(text, { numbered } = {}) {
    this.ensureSpace(36);
    const label = numbered ? String(text) : String(text).toUpperCase();
    this.page.drawRectangle({
      x: MARGIN.left,
      y: this.y - 2,
      width: 4,
      height: 18,
      color: COLORS.accent,
    });
    this.page.drawText(label, {
      x: MARGIN.left + 12,
      y: this.y,
      size: numbered ? 12 : 10,
      font: this.bold,
      color: numbered ? COLORS.text : COLORS.primary,
    });
    this.y -= 26;
  }

  drawParagraph(text, { size = 10, indent = 0, muted = false } = {}) {
    const lines = wrapText(text, this.regular, size, this.contentWidth() - indent);
    for (const line of lines) {
      this.ensureSpace(size * 1.5);
      this.page.drawText(line, {
        x: MARGIN.left + indent,
        y: this.y,
        size,
        font: this.regular,
        color: muted ? COLORS.muted : COLORS.text,
      });
      this.y -= size * 1.45;
    }
    this.y -= 4;
  }

  drawBulletList(items, { indent = 12 } = {}) {
    for (const item of items) {
      this.ensureSpace(16);
      this.page.drawCircle({
        x: MARGIN.left + indent + 4,
        y: this.y + 3,
        size: 2.5,
        color: COLORS.accent,
      });
      const lines = wrapText(item, this.regular, 10, this.contentWidth() - indent - 16);
      for (let i = 0; i < lines.length; i += 1) {
        this.ensureSpace(14);
        this.page.drawText(lines[i], {
          x: MARGIN.left + indent + 14,
          y: this.y,
          size: 10,
          font: this.regular,
          color: COLORS.text,
        });
        this.y -= 14;
      }
      this.y -= 2;
    }
    this.y -= 4;
  }

  drawDivider() {
    this.ensureSpace(16);
    this.page.drawLine({
      start: { x: MARGIN.left, y: this.y },
      end: { x: PAGE_W - MARGIN.right, y: this.y },
      thickness: 0.75,
      color: COLORS.border,
    });
    this.y -= 16;
  }

  drawTable(headers, rows, { colWidths } = {}) {
    const widths =
      colWidths ||
      headers.map(() => this.contentWidth() / headers.length);
    const rowH = 22;
    const headerH = 24;
    this.ensureSpace(headerH + rows.length * rowH + 8);

    let x = MARGIN.left;
    headers.forEach((h, i) => {
      this.page.drawRectangle({
        x,
        y: this.y - headerH,
        width: widths[i],
        height: headerH,
        color: COLORS.primary,
      });
      this.page.drawText(String(h), {
        x: x + 8,
        y: this.y - 16,
        size: 9,
        font: this.bold,
        color: COLORS.white,
      });
      x += widths[i];
    });
    this.y -= headerH;

    rows.forEach((row, ri) => {
      x = MARGIN.left;
      const bg = ri % 2 === 0 ? COLORS.white : COLORS.accentSoft;
      row.forEach((cell, ci) => {
        this.page.drawRectangle({
          x,
          y: this.y - rowH,
          width: widths[ci],
          height: rowH,
          color: bg,
          borderColor: COLORS.border,
          borderWidth: 0.25,
        });
        this.page.drawText(String(cell).slice(0, 48), {
          x: x + 8,
          y: this.y - 15,
          size: 9,
          font: this.regular,
          color: COLORS.text,
        });
        x += widths[ci];
      });
      this.y -= rowH;
    });
    this.y -= 10;
  }

  drawTotals(lines, { highlightLast = true } = {}) {
    const boxW = 220;
    const x = PAGE_W - MARGIN.right - boxW;
    const lineH = 18;
    const boxH = lines.length * lineH + 16;
    this.ensureSpace(boxH + 8);

    this.page.drawRectangle({
      x,
      y: this.y - boxH,
      width: boxW,
      height: boxH,
      color: COLORS.accentSoft,
      borderColor: COLORS.border,
      borderWidth: 0.5,
    });

    lines.forEach((line, i) => {
      const isLast = highlightLast && i === lines.length - 1;
      this.page.drawText(line.label, {
        x: x + 12,
        y: this.y - 18 - i * lineH,
        size: isLast ? 10 : 9,
        font: isLast ? this.bold : this.regular,
        color: COLORS.muted,
      });
      this.page.drawText(line.value, {
        x: x + boxW - 12 - this.bold.widthOfTextAtSize(line.value, isLast ? 10 : 9),
        y: this.y - 18 - i * lineH,
        size: isLast ? 10 : 9,
        font: isLast ? this.bold : this.regular,
        color: isLast ? COLORS.primary : COLORS.text,
      });
    });
    this.y -= boxH + 12;
  }

  drawSignatureBlock(lines) {
    this.ensureSpace(80);
    this.y -= 12;
    for (const line of lines) {
      this.page.drawText(line, {
        x: MARGIN.left,
        y: this.y,
        size: 10,
        font: this.regular,
        color: COLORS.text,
      });
      this.y -= 28;
    }
  }

  drawTagRow(tags) {
    if (!tags?.length) return;
    this.ensureSpace(24);
    let x = MARGIN.left;
    for (const tag of tags) {
      const t = String(tag);
      const w = this.regular.widthOfTextAtSize(t, 8) + 14;
      if (x + w > PAGE_W - MARGIN.right) {
        x = MARGIN.left;
        this.y -= 20;
        this.ensureSpace(20);
      }
      this.page.drawRectangle({
        x,
        y: this.y - 14,
        width: w,
        height: 16,
        color: COLORS.accentSoft,
        borderColor: COLORS.accent,
        borderWidth: 0.5,
      });
      this.page.drawText(t, {
        x: x + 7,
        y: this.y - 10,
        size: 8,
        font: this.regular,
        color: COLORS.primary,
      });
      x += w + 6;
    }
    this.y -= 28;
  }

  async toBuffer() {
    return Buffer.from(await this.doc.save());
  }
}

/** PDF batch / génération IA — mise en page professionnelle à partir de texte brut */
async function buildModernTextPdf({ title, subtitle, body, badge, footerLabel }) {
  const pdf = await new ModernPdfBuilder().init({ footerLabel });
  pdf.drawBrandHeader({
    eyebrow: "DMS Workspace · Génération IA",
    title: title || "Document généré",
    subtitle: subtitle || new Date().toLocaleDateString("fr-FR"),
    badge: badge || "DÉMO",
  });

  pdf.drawDivider();

  const paragraphs = String(body || "").split(/\n/);
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      pdf.y -= 6;
      continue;
    }
    if (/^[-•*]\s/.test(trimmed)) {
      pdf.drawBulletList([trimmed.replace(/^[-•*]\s*/, "")]);
    } else if (/^(article|section|\d+\.)\s/i.test(trimmed) || /^[A-ZÉÈÊÀÙ\s]{4,}$/.test(trimmed)) {
      pdf.drawSectionTitle(trimmed, { numbered: /^\d+\./.test(trimmed) });
    } else if (/^objet\s*:/i.test(trimmed)) {
      pdf.drawSectionTitle("Objet");
      pdf.drawParagraph(trimmed.replace(/^objet\s*:\s*/i, ""), { size: 11 });
    } else {
      pdf.drawParagraph(trimmed);
    }
  }

  pdf.drawDivider();
  pdf.drawParagraph(
    "Document produit automatiquement par DMS Workspace (mode démonstration).",
    { size: 8, muted: true }
  );

  return pdf.toBuffer();
}

module.exports = {
  ModernPdfBuilder,
  buildModernTextPdf,
  COLORS,
  wrapText,
};
