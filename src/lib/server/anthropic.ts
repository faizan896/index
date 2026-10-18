import "server-only";

/**
 * The Anthropic adapter: sends one classification prompt and returns the
 * model's raw answer, or throws a ClassifierError that says whether trying
 * again later could help. Messages never include the API key or response
 * bodies, so they are safe to store and log.
 */
import Anthropic from "@anthropic-ai/sdk";

import { parseClassification } from "@/lib/core/classify/parse";
import type { RawClassification } from "@/lib/core/classify/parse";
import type { ClassificationPrompt } from "@/lib/core/classify/prompt";

const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_TOKENS = 2048;
// Two attempts (maxRetries 1) of 20 s, plus the 10 s page fetch, stay inside the 60 s route limit.
const TIMEOUT_MS = 20_000;

/** Models that can retry a refused request on another model server-side. */
const SERVER_FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"]);
const SERVER_FALLBACK_BETA = "server-side-fallback-2026-07-01";

export class ClassifierError extends Error {
  /** True when the same request may succeed later (rate limits, timeouts, server errors). */
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "ClassifierError";
    this.retryable = retryable;
  }
}

export interface Classifier {
  readonly model: string;
  classify(prompt: ClassificationPrompt): Promise<RawClassification>;
}

function requestParams(model: string, prompt: ClassificationPrompt): Anthropic.Beta.MessageCreateParamsNonStreaming {
  // No `thinking`, sampling or prefill: Claude Opus 5.5 always thinks (disabling it is a 400); low effort keeps it brief.
  const params: Record<string, unknown> = {
    model,
    max_tokens: MAX_TOKENS,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
    output_config: { effort: "low", format: { type: "json_schema", schema: prompt.schema } },
  };
  if (SERVER_FALLBACK_MODELS.has(model)) {
    params.betas = [SERVER_FALLBACK_BETA];
    params.fallbacks = "default";
  }
  // The SDK's typings lag output_config and fallbacks; it sends the body as given.
  return params as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming;
}

const TEMPORARY_PROBLEM = "The Anthropic API had a temporary problem.";

/** Maps SDK errors (most specific class first) to a safe message and a retry hint. */
function toClassifierError(error: unknown): ClassifierError {
  if (error instanceof ClassifierError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ClassifierError("The Anthropic API key was rejected.", false);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ClassifierError("The Anthropic API is rate limiting requests.", true);
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new ClassifierError("The Anthropic API rejected the classification request.", false);
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new ClassifierError("The configured Anthropic model isn't available.", false);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new ClassifierError("The Anthropic API took too long to respond.", true);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ClassifierError("Couldn't reach the Anthropic API.", true);
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new ClassifierError(TEMPORARY_PROBLEM, true);
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status;
    if (typeof status !== "number") return new ClassifierError("The request to the Anthropic API was interrupted.", false);
    if (status >= 500) return new ClassifierError(TEMPORARY_PROBLEM, true);
    // The SDK itself treats request timeouts and conflicts as transient.
    return new ClassifierError(`The Anthropic API returned an error (${status}).`, status === 408 || status === 409);
  }
  return new ClassifierError("Classification failed unexpectedly.", false);
}

async function classify(client: Anthropic, model: string, prompt: ClassificationPrompt): Promise<RawClassification> {
  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await client.beta.messages.create(requestParams(model, prompt));
  } catch (error) {
    throw toClassifierError(error);
  }

  // Read as a plain string: the API may send stop reasons newer than the SDK's union.
  const stopReason: string | null = message.stop_reason;
  if (stopReason === "refusal") throw new ClassifierError("The model declined to classify this page.", false);
  if (stopReason === "max_tokens") throw new ClassifierError("The model's answer was cut off.", true);

  const text = message.content.find((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")?.text;
  // parseClassification runs JSON.parse itself and also tolerates a stray code fence.
  const parsed = text ? parseClassification(text) : null;
  if (!parsed) throw new ClassifierError("The model's answer couldn't be read.", false);
  return parsed;
}

let cachedClient: { apiKey: string; client: Anthropic } | null = null;

function clientFor(apiKey: string): Anthropic {
  if (cachedClient && cachedClient.apiKey === apiKey) return cachedClient.client;
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
  cachedClient = { apiKey, client };
  return client;
}

/**
 * The configured classifier, or null when ANTHROPIC_API_KEY is missing or
 * blank (the library then saves links without categorizing them).
 * ANTHROPIC_MODEL overrides the model.
 */
export function getClassifier(): Classifier | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const client = clientFor(apiKey);
  return {
    model,
    classify: (prompt) => classify(client, model, prompt),
  };
}
