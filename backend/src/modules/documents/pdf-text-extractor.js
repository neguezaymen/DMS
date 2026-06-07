const pdfParse = require("pdf-parse");

let pdfJsModule = null;

async function loadPdfJs() {
  if (!pdfJsModule) {
    pdfJsModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfJsModule;
}

function normalizeExtractedText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractWithPdfParse(buffer) {
  const parsed = await pdfParse(buffer);
  return normalizeExtractedText(parsed.text || "");
}

async function extractWithPdfJs(buffer) {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  const parts = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => (typeof item.str === "string" ? item.str : ""))
      .join(" ")
      .trim();
    if (pageText) parts.push(pageText);
  }

  return normalizeExtractedText(parts.join("\n\n"));
}

/**
 * Extrait le texte d'un PDF : pdf-parse en premier, pdfjs-dist en secours.
 * Retient le résultat le plus complet (souvent pdfjs sur les PDF générés par pdf-lib).
 */
async function extractPdfText(buffer) {
  let parsedText = "";
  let pdfJsText = "";
  let parseError = null;
  let pdfJsError = null;

  try {
    parsedText = await extractWithPdfParse(buffer);
  } catch (error) {
    parseError = error;
  }

  try {
    pdfJsText = await extractWithPdfJs(buffer);
  } catch (error) {
    pdfJsError = error;
  }

  const best =
    pdfJsText.length > parsedText.length + 40 || parsedText.length < 80
      ? pdfJsText || parsedText
      : parsedText || pdfJsText;

  if (!best) {
    const message = parseError?.message || pdfJsError?.message || "Extraction PDF vide";
    const err = new Error(message);
    err.parseError = parseError;
    err.pdfJsError = pdfJsError;
    throw err;
  }

  return {
    text: best,
    engine:
      best === pdfJsText && pdfJsText.length > parsedText.length + 40 ? "pdfjs-dist" : "pdf-parse",
    lengths: { pdfParse: parsedText.length, pdfJs: pdfJsText.length },
  };
}

module.exports = {
  extractPdfText,
  normalizeExtractedText,
};
