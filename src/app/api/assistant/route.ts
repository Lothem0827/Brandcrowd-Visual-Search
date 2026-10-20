import { z } from "zod";
import { serverTemplateRepository } from "@/lib/data-server";
import {
  ASSISTANT_NOTHING,
  designFacetsFromModel,
  designsReply,
} from "@/lib/assistant";
import { moodboardSource } from "@/lib/brief";
import { getInterpretCache, getMoodboardTitlesCache, setInterpretCache, setMoodboardTitlesCache } from "@/lib/llm-cache";
import { buildAiVocab, buildInterpretPrompt, interpretationKey, shouldInterpret } from "@/lib/llm";
import {
  buildMoodboardTitlePrompt,
  fillMoodboardTitles,
  sanitizeMoodboardTitles,
} from "@/lib/moodboard-titles";
import { buildVocab, chipsToSelection, parseQuery } from "@/lib/query";
import { mergeSelections } from "@/lib/facets";

/**
 * Titles, and design phrasing the vocabulary cannot parse.
 *
 * The browser gate decides the intent. This route does not classify free chat:
 * a body without `intent` is rejected, and a design phrase that is already
 * vocabulary never calls the model.
 *
 *   LLM_BASE_URL  default https://api.openai.com/v1
 *   LLM_MODEL     default gpt-4o-mini
 */
const Body = z.object({
  intent: z.enum(["title", "designs"]),
  keyword: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(80),
  vague: z.string().trim().max(200).optional(),
});

const TIMEOUT_MS = 15_000;

class LlmHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function callModel(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  jsonMode: boolean;
  temperature: number;
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
  };
  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new LlmHttpError(res.status, `LLM ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

function parseJsonLoose(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ status: "error", message: "Invalid JSON body" }, 400);
  }
  const parsedBody = Body.safeParse(payload);
  if (!parsedBody.success) {
    return json({ status: "error", message: "intent and keyword are required" }, 400);
  }

  const { intent, keyword, category, vague } = parsedBody.data;
  const base = serverTemplateRepository().all().filter((template) => template.category === category);
  if (!base.length) return json({ status: "empty", reply: ASSISTANT_NOTHING });

  if (intent === "title") return titleResponse(base, keyword);

  const vocab = buildVocab(base);
  const keywordFacets = chipsToSelection(parseQuery(keyword, vocab).chips);
  const vagueParsed = vague ? parseQuery(vague, vocab) : null;
  const local = mergeSelections(keywordFacets, vagueParsed ? chipsToSelection(vagueParsed.chips) : {});
  if (!vague || !vagueParsed || !shouldInterpret(vague, vagueParsed)) {
    if (!Object.keys(local).length) return json({ status: "empty", reply: ASSISTANT_NOTHING });
    return json({
      status: "ok",
      intent: "designs",
      reply: designsReply(local, keyword),
      facets: local,
      text: "",
      keyword,
    });
  }
  return designResponse(category, vocab, keyword, vague, local);
}

async function titleResponse(templates: Parameters<typeof moodboardSource>[0], keyword: string) {
  const source = moodboardSource(templates, keyword);
  if (!source) return json({ status: "empty", reply: ASSISTANT_NOTHING });

  const cacheKey = keyword.trim().toLowerCase().replace(/\s+/g, " ");
  const cached = await getMoodboardTitlesCache(cacheKey);
  if (cached?.length) {
    return json({
      status: "ok",
      intent: "title",
      reply: `Titles for ${source.match.label}.`,
      titles: cached,
      keyword,
    });
  }

  const catalogue = () =>
    json({
      status: "ok",
      intent: "title",
      reply: `Titles for ${source.match.label}.`,
      titles: source.fallbackTitles,
      keyword,
    });

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return catalogue();

  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  const { system, user } = buildMoodboardTitlePrompt(source.match.label, source.commonTitles);

  try {
    let content: string;
    try {
      content = await callModel({ baseUrl, apiKey, model, system, user, jsonMode: true, temperature: 0.4 });
    } catch (err) {
      if (err instanceof LlmHttpError && err.status >= 400 && err.status < 500) {
        content = await callModel({ baseUrl, apiKey, model, system, user, jsonMode: false, temperature: 0.4 });
      } else {
        throw err;
      }
    }
    const cleaned = sanitizeMoodboardTitles(parseJsonLoose(content), source.commonTitles);
    const filled = fillMoodboardTitles(cleaned, source.fallbackTitles);
    if (!filled.titles.length) return catalogue();
    if (filled.source !== "catalogue") void setMoodboardTitlesCache(cacheKey, filled.titles);
    return json({
      status: "ok",
      intent: "title",
      reply: `Titles for ${source.match.label}.`,
      titles: filled.titles,
      keyword,
    });
  } catch {
    return catalogue();
  }
}

async function designResponse(
  category: string,
  vocab: ReturnType<typeof buildVocab>,
  keyword: string,
  vague: string,
  local: ReturnType<typeof chipsToSelection>,
) {
  const allowed = buildAiVocab(vocab);
  const query = `${keyword} ${vague}`.trim();
  const cacheKey = interpretationKey(category, query);
  const cached = await getInterpretCache(cacheKey);
  if (cached) {
    const merged = designFacetsFromModel(cached, allowed, local);
    return json({
      status: "ok",
      intent: "designs",
      reply: cached.reason || designsReply(merged.facets, keyword),
      facets: merged.facets,
      text: merged.text,
      keyword,
    });
  }

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    if (!Object.keys(local).length) return json({ status: "empty", reply: ASSISTANT_NOTHING });
    return json({
      status: "ok",
      intent: "designs",
      reply: designsReply(local, keyword),
      facets: local,
      text: "",
      keyword,
    });
  }

  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  const { system, user } = buildInterpretPrompt(query, category, allowed);

  try {
    let content: string;
    try {
      content = await callModel({ baseUrl, apiKey, model, system, user, jsonMode: true, temperature: 0 });
    } catch (err) {
      if (err instanceof LlmHttpError && err.status >= 400 && err.status < 500) {
        content = await callModel({ baseUrl, apiKey, model, system, user, jsonMode: false, temperature: 0 });
      } else {
        throw err;
      }
    }
    const raw = parseJsonLoose(content);
    const merged = designFacetsFromModel(raw, allowed, local);
    if (!Object.keys(merged.facets).length && !merged.text) {
      return json({ status: "empty", reply: ASSISTANT_NOTHING });
    }
    const modelOnly = designFacetsFromModel(raw, allowed, {});
    if (Object.keys(modelOnly.facets).length || modelOnly.text) {
      void setInterpretCache(cacheKey, { facets: modelOnly.facets, text: modelOnly.text, reason: "" });
    }
    return json({
      status: "ok",
      intent: "designs",
      reply: designsReply(merged.facets, keyword),
      facets: merged.facets,
      text: merged.text,
      keyword,
    });
  } catch (err) {
    if (Object.keys(local).length) {
      return json({
        status: "ok",
        intent: "designs",
        reply: designsReply(local, keyword),
        facets: local,
        text: "",
        keyword,
      });
    }
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? "The model took too long to respond"
        : err instanceof Error
          ? err.message
          : "LLM request failed";
    return json({ status: "error", message }, 502);
  }
}
