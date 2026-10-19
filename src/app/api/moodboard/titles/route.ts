import { z } from "zod";
import { serverTemplateRepository } from "@/lib/data-server";
import { moodboardSource } from "@/lib/brief";
import {
  buildMoodboardTitlePrompt,
  fillMoodboardTitles,
  sanitizeMoodboardTitles,
  type MoodboardTitlesResponse,
} from "@/lib/moodboard-titles";

/**
 * Six catalogue-style titles for a moodboard subject.
 *
 * Uses the same OpenAI-compatible env as /api/interpret (`LLM_API_KEY`,
 * `LLM_BASE_URL`, `LLM_MODEL`). The key never reaches the browser. When the
 * model is off or short, deterministic titles from the same slice fill in.
 */
const Body = z.object({
  query: z.string().trim().min(1).max(80),
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
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: 0.4,
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

/** Models occasionally wrap JSON in prose or code fences. */
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

const json = (body: MoodboardTitlesResponse, status = 200) => Response.json(body, { status });

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ status: "error", message: "Invalid JSON body" }, 400);
  }
  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return json({ status: "error", message: "A subject is required" }, 400);
  }

  const source = moodboardSource(serverTemplateRepository().all(), parsed.data.query);
  if (!source) return json({ status: "empty" });

  const catalogue = () =>
    json({
      status: "ok",
      titles: source.fallbackTitles,
      source: "catalogue",
      label: source.match.label,
    });

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return catalogue();

  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  const { system, user } = buildMoodboardTitlePrompt(source.match.label, source.commonTitles);
  const args = { baseUrl, apiKey, model, system, user };

  try {
    let content: string;
    try {
      content = await callModel({ ...args, jsonMode: true });
    } catch (err) {
      if (err instanceof LlmHttpError && err.status >= 400 && err.status < 500) {
        content = await callModel({ ...args, jsonMode: false });
      } else {
        throw err;
      }
    }
    const cleaned = sanitizeMoodboardTitles(parseJsonLoose(content), source.commonTitles);
    const filled = fillMoodboardTitles(cleaned, source.fallbackTitles);
    if (!filled.titles.length) return catalogue();
    return json({
      status: "ok",
      titles: filled.titles,
      source: filled.source,
      label: source.match.label,
    });
  } catch {
    return catalogue();
  }
}
