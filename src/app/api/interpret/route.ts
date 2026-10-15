import { z } from "zod";
import { templateRepository } from "@/lib/data";
import { buildVocab } from "@/lib/query";
import {
  buildAiVocab,
  buildInterpretPrompt,
  sanitizeInterpretation,
  type InterpretResponse,
} from "@/lib/llm";

/**
 * Turns a vague query into facet filters by asking an OpenAI-compatible LLM.
 *
 * Configured entirely by env vars so it works with OpenAI, OpenRouter, Groq,
 * Together, a local Ollama/LM Studio, etc. Without `LLM_API_KEY` the endpoint
 * reports `disabled` and the app silently keeps its deterministic search.
 *
 *   LLM_BASE_URL  default https://api.openai.com/v1
 *   LLM_MODEL     default gpt-4o-mini
 */
const Body = z.object({
  query: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(80),
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
    temperature: 0,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    // Not every OpenAI-compatible server understands response_format, hence the retry.
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

const json = (body: InterpretResponse, status = 200) => Response.json(body, { status });

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ status: "error", message: "Invalid JSON body" }, 400);
  }
  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return json({ status: "error", message: "query and category are required" }, 400);
  }

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return json({ status: "disabled" });

  const { query, category } = parsed.data;
  const base = templateRepository.all().filter((t) => t.category === category);
  if (!base.length) return json({ status: "empty" });

  const allowed = buildAiVocab(buildVocab(base));
  const { system, user } = buildInterpretPrompt(query, category, allowed);
  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  const args = { baseUrl, apiKey, model, system, user };

  try {
    let content: string;
    try {
      content = await callModel({ ...args, jsonMode: true });
    } catch (err) {
      // A server that rejects response_format should still work.
      if (err instanceof LlmHttpError && err.status >= 400 && err.status < 500) {
        content = await callModel({ ...args, jsonMode: false });
      } else {
        throw err;
      }
    }
    const result = sanitizeInterpretation(parseJsonLoose(content), allowed);
    if (!result) return json({ status: "empty" });
    return json({ status: "ok", result, model });
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? "The model took too long to respond"
        : err instanceof Error
          ? err.message
          : "LLM request failed";
    return json({ status: "error", message }, 502);
  }
}
