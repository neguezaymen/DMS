const fs = require("fs/promises");
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");

function rowTruthy(v) {
  if (v === true) return true;
  if (v === 1) return true;
  if (Number(v) === 1) return true;
  if (v && typeof v.readUInt8 === "function" && v.length >= 1 && v.readUInt8(0) === 1) return true;
  return false;
}

/**
 * PDF uniquement : filigrane si document privé ou option watermark_enabled.
 */
function shouldWatermarkPdfDownload(docRow) {
  const mime = String(docRow.mime_type || "").toLowerCase();
  if (mime !== "application/pdf") return false;
  const vis = String(docRow.visibility || "private").toLowerCase();
  if (vis === "private") return true;
  return rowTruthy(docRow.watermark_enabled);
}

/** Texte compatible polices standard PDF (Latin-1 approx.). */
function toPdfSafeAscii(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

function buildWatermarkText(fullName) {
  const name = toPdfSafeAscii(fullName || "User");
  const dateStr = new Date().toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `CONFIDENTIEL - ${name} - ${dateStr}`;
}

/**
 * @param {Buffer} buffer
 * @param {string} fullName
 * @returns {Promise<Buffer>}
 */
async function applyPdfWatermarkToBuffer(buffer, fullName) {
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: false });
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const text = buildWatermarkText(fullName);
  const pages = pdfDoc.getPages();
  const fontSize = 40;
  const opacity = 0.3;
  const color = rgb(0.45, 0.45, 0.45);

  for (const page of pages) {
    const { width, height } = page.getSize();
    const stepX = 260;
    const stepY = 200;
    for (let x = -height; x < width + height; x += stepX) {
      for (let y = -120; y < height + width; y += stepY) {
        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
          color,
          opacity,
          rotate: degrees(45),
        });
      }
    }
  }
  const out = await pdfDoc.save();
  return Buffer.from(out);
}

async function applyPdfWatermarkFromFile(absolutePath, fullName) {
  const raw = await fs.readFile(absolutePath);
  return applyPdfWatermarkToBuffer(raw, fullName);
}

module.exports = {
  shouldWatermarkPdfDownload,
  applyPdfWatermarkFromFile,
  applyPdfWatermarkToBuffer,
  buildWatermarkText,
};
