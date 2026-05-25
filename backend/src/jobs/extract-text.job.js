const fs = require("fs/promises");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const { updateExtractedText } = require("../modules/documents/documents.service");
const { queueDocumentEmbedding } = require("../modules/documents/embedding.service");

async function extractFromFile(filePath, mimeType, originalName) {
  const lowerName = (originalName || "").toLowerCase();
  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    const buffer = await fs.readFile(filePath);
    try {
      const parsed = await pdfParse(buffer);
      return parsed.text || "";
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`PDF parse failed for ${originalName}:`, error.message);
      return "";
    }
  }
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const parsed = await mammoth.extractRawText({ path: filePath });
    return parsed.value || "";
  }
  if (mimeType?.startsWith("text/") || lowerName.endsWith(".txt")) {
    return await fs.readFile(filePath, "utf8");
  }
  return "";
}

function queueTextExtraction({ documentId, filePath, mimeType, originalName }) {
  setImmediate(async () => {
    try {
      const text = await extractFromFile(filePath, mimeType, originalName);
      await updateExtractedText(documentId, text.slice(0, 200000));
      queueDocumentEmbedding(documentId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`Text extraction failed for document ${documentId}:`, error.message);
    }
  });
}

async function extractAndStoreText({ documentId, filePath, mimeType, originalName }) {
  const text = await extractFromFile(filePath, mimeType, originalName);
  await updateExtractedText(documentId, text.slice(0, 200000));
  return text;
}

module.exports = { queueTextExtraction, extractFromFile, extractAndStoreText };
