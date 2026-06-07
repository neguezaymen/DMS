const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

function geminiModelPath(model) {
  const m = String(model || "gemini-2.0-flash-lite").trim();
  return m.startsWith("models/") ? m : `models/${m}`;
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

async function callGeminiChat({ apiKey, model, systemPrompt, userPrompt }) {
  const modelPath = geminiModelPath(model);
  const url = `${GEMINI_API_BASE}/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: String(userPrompt || "") }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 8192,
    },
  };
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: String(systemPrompt) }] };
  }

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    const err = new Error(`Erreur Gemini: ${txt.slice(0, 500)}`);
    err.statusCode = 502;
    throw err;
  }
  const data = await r.json();
  const content =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join("") || "";
  const tokensUsed = Number(
    data.usageMetadata?.totalTokenCount ||
      estimateTokens(systemPrompt) + estimateTokens(content),
  );
  const modelLabel = modelPath.replace(/^models\//, "");
  return { content, tokensUsed, model: modelLabel };
}

async function createGeminiEmbedding({ apiKey, text, dimensions = 384 }) {
  const embedModel = "gemini-embedding-001";
  const url = `${GEMINI_API_BASE}/models/${embedModel}:embedContent?key=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${embedModel}`,
      content: { parts: [{ text: String(text || "").slice(0, 8000) }] },
      outputDimensionality: dimensions,
    }),
  });
  if (!r.ok) {
    const errBody = await r.text().catch(() => "");
    const err = new Error(`Gemini embeddings: ${r.status} ${errBody.slice(0, 200)}`);
    err.statusCode = 502;
    throw err;
  }
  const json = await r.json();
  const emb = json?.embedding?.values;
  if (!Array.isArray(emb) || emb.length !== dimensions) {
    const err = new Error("Réponse embedding Gemini invalide");
    err.statusCode = 502;
    throw err;
  }
  let sum = 0;
  const vec = emb.map(Number);
  for (let i = 0; i < vec.length; i += 1) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  return vec.map((v) => v / norm);
}

async function callOpenAIChat({ apiKey, model, systemPrompt, userPrompt }) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    const err = new Error(`Erreur OpenAI: ${txt.slice(0, 500)}`);
    err.statusCode = 502;
    throw err;
  }
  const data = await r.json();
  const content = data.choices?.[0]?.message?.content || "";
  const tokensUsed = Number(
    data.usage?.total_tokens || estimateTokens(content),
  );
  return { content, tokensUsed, model };
}

async function createOpenAIEmbedding({ apiKey, text, dimensions = 384 }) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: String(text || "").slice(0, 8000),
      dimensions,
    }),
  });
  if (!r.ok) {
    const errBody = await r.text().catch(() => "");
    const err = new Error(`OpenAI embeddings: ${r.status} ${errBody.slice(0, 200)}`);
    err.statusCode = 502;
    throw err;
  }
  const json = await r.json();
  const emb = json?.data?.[0]?.embedding;
  if (!Array.isArray(emb) || emb.length !== dimensions) {
    const err = new Error("Réponse embedding OpenAI invalide");
    err.statusCode = 502;
    throw err;
  }
  let sum = 0;
  const vec = emb.map(Number);
  for (let i = 0; i < vec.length; i += 1) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  return vec.map((v) => v / norm);
}

module.exports = {
  callGeminiChat,
  createGeminiEmbedding,
  callOpenAIChat,
  createOpenAIEmbedding,
  geminiModelPath,
};
