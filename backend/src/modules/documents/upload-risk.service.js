const fs = require("fs");

/**
 * Phrases longues en premier pour éviter les correspondances partielles abusives (ex. « secret » vs « top secret »).
 * Inclut les catégories : confidentialité, secret, interne, restriction, légal/RGPD, financier, médical, divers.
 */
const SENSITIVE_KEYWORDS = [
  // Confidentialité
  "strictement confidentiel",
  "diffusion confidentielle",
  "à diffusion confidentielle",
  "confidentielle",
  "confidentiel",
  // Secret
  "top secret",
  "hautement secret",
  "secret défense",
  "secret professionnel",
  "très secret",
  "secret",
  // Interne
  "usage interne",
  "document interne",
  "diffusion interne",
  "réservé au personnel",
  "personnel uniquement",
  "interne",
  // Restriction
  "ne pas diffuser",
  "ne pas partager",
  "ne pas divulguer",
  "interdit à la diffusion",
  "réservé à l'équipe",
  "diffusion restreinte",
  // Légal / RGPD
  "clause de confidentialité",
  "accord de confidentialité",
  "non-divulgation",
  "information confidentielle",
  "données personnelles",
  "données sensibles",
  "information personnelle",
  // Financier
  "information financière",
  "résultat non publié",
  "confidentiel financier",
  "secret bancaire",
  // Médical
  "dossier médical",
  "secret médical",
  "information santé",
  // Divers
  "privé et confidentiel",
  "à ne pas ouvrir",
  "lu par vous seul",
  "personnel",
  "privé",
];

function checkSensitiveContent(text) {
  const lowerText = (text || "").toLowerCase();
  for (const keyword of SENSITIVE_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return { isRisky: true, matchedKeyword: keyword };
    }
  }
  return { isRisky: false };
}

/**
 * Sondage minimal du fichier + métadonnées pour mots-clés sensibles.
 */
function buildUploadProbeText({ title, description, tags, originalname }, filePath) {
  let out = `${title || ""} ${description || ""} ${tags || ""} ${originalname || ""}\n`;
  try {
    const buf = fs.readFileSync(filePath);
    const n = Math.min(buf.length, 65536);
    out += buf.slice(0, n).toString("utf8");
    out += buf.slice(0, n).toString("latin1");
  } catch (_) {
    // ignore read errors
  }
  return out;
}

/**
 * Analyse upload : titre, description, nom de fichier + début du contenu binaire (UTF-8 / latin1).
 * @returns {{ isRisky: boolean, matchedKeyword?: string }}
 */
function detectSensitiveInUpload({ title, description, tags, originalname }, filePath) {
  const probe = buildUploadProbeText({ title, description, tags, originalname }, filePath);
  return checkSensitiveContent(probe);
}

module.exports = {
  SENSITIVE_KEYWORDS,
  checkSensitiveContent,
  buildUploadProbeText,
  detectSensitiveInUpload,
};
