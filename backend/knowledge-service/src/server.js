const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const knowledgePath = path.join(__dirname, "..", "data", "knowledge.json");
let knowledgeBase = [];

function loadKnowledge() {
  try {
    const raw = fs.readFileSync(knowledgePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      knowledgeBase = parsed;
    } else {
      console.warn("Knowledge base file does not contain an array. Using empty base.");
      knowledgeBase = [];
    }
  } catch (error) {
    console.error("Failed to load knowledge base:", error);
    knowledgeBase = [];
  }
}

function normaliseToken(token) {
  return token
    .toLowerCase()
    .replace(/["'`.,!?;:()\[\]{}<>]+/g, "")
    .trim();
}

function tokenize(text) {
  if (!text) {
    return [];
  }
  return text
    .split(/\s+/)
    .map(normaliseToken)
    .filter((token) => token.length > 0);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function computeScore(tokens, text) {
  if (!tokens.length) {
    return 0;
  }

  const haystack = text.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (!token) {
      continue;
    }
    const matcher = new RegExp(escapeRegExp(token), "g");
    const matches = haystack.match(matcher);
    if (matches && matches.length > 0) {
      score += 1 + matches.length * 0.05;
    }
  }

  return Number(score.toFixed(4));
}

function createSnippet(content, tokens, maxLength = 240) {
  const cleanContent = content.replace(/\s+/g, " ").trim();
  if (cleanContent.length <= maxLength) {
    return cleanContent;
  }

  const lowerContent = cleanContent.toLowerCase();
  let bestIndex = 0;

  for (const token of tokens) {
    if (!token) {
      continue;
    }
    const index = lowerContent.indexOf(token);
    if (index !== -1) {
      bestIndex = index;
      break;
    }
  }

  const start = Math.max(0, bestIndex - Math.floor(maxLength / 2));
  const end = Math.min(cleanContent.length, start + maxLength);
  let snippet = cleanContent.slice(start, end).trim();

  if (start > 0) {
    snippet = `…${snippet}`;
  }
  if (end < cleanContent.length) {
    snippet = `${snippet}…`;
  }

  return snippet;
}

app.get("/knowledge/search", (req, res) => {
  const query = (req.query.q || req.query.query || "").toString().trim();
  const limit = Math.max(1, Math.min(10, Number.parseInt(req.query.limit, 10) || 3));

  if (!query) {
    return res.json({ query: "", documents: [] });
  }

  const tokens = Array.from(new Set(tokenize(query)));
  const ranked = knowledgeBase
    .map((doc) => {
      const combined = `${doc.title}\n${doc.content}`;
      const score = computeScore(tokens, combined);
      return {
        score,
        document: doc,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.document.title.localeCompare(b.document.title, "ru");
    })
    .slice(0, limit)
    .map((entry) => ({
      id: entry.document.id,
      title: entry.document.title,
      source: entry.document.source,
      content: entry.document.content,
      snippet: createSnippet(entry.document.content, tokens),
      score: entry.score,
    }));

  res.json({ query, documents: ranked });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", documents: knowledgeBase.length });
});

loadKnowledge();

app.listen(PORT, () => {
  console.log(`Knowledge service listening on port ${PORT}`);
});

