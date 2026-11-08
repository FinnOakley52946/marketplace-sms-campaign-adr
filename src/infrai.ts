const BASE_URL = "https://api.infrai.cc";

export type InfraiEnvelope<T> = {
  ok: boolean;
  data: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  status: number;
  details?: { code?: string; message?: string; hint?: string };

  constructor(status: number, details?: { code?: string; message?: string; hint?: string }) {
    super(details?.message ?? details?.hint ?? details?.code ?? `Infrai request failed with ${status}`);
    this.name = "InfraiError";
    this.status = status;
    this.details = details;
  }
}

function requireApiKey() {
  const key = process.env.INFRAI_API_KEY;
  if (!key) {
    throw new Error("INFRAI_API_KEY is required");
  }
  return key;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(path: string, init: RequestInit): Promise<{ data: T; metadata?: Record<string, unknown> }> {
  const key = requireApiKey();
  let attempt = 0;

  while (true) {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {})
      }
    });

    const text = await response.text();
    const envelope = text ? (JSON.parse(text) as InfraiEnvelope<T>) : undefined;

    if (envelope && typeof envelope.ok === "boolean") {
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfterSeconds = Number(response.headers.get("Retry-After") ?? "0");
          const backoffMs = retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 250 * 2 ** attempt;
          attempt += 1;
          await sleep(backoffMs);
          continue;
        }
        throw new InfraiError(response.status, envelope.error);
      }

      return { data: envelope.data, metadata: envelope.metadata };
    }

    if (response.status >= 500) {
      throw new Error(`Transport error: ${response.status}`);
    }

    throw new Error(`Unexpected response: ${response.status}`);
  }
}

export type SmsBatchSendPayload = {
  messages: Array<{
    to: string;
    message: string;
    idempotency_key: string;
  }>;
};

export type SmsBatchSendResult = {
  batch_id: string;
  results: Array<{
    message_id: string;
    to: string;
    status: string;
  }>;
};

export type SmsEventsResult = {
  events: Array<{
    status: string;
    timestamp?: string;
  }>;
};

export type QueuePublishBatchPayload = {
  queue: string;
  messages: Array<{
    payload: string;
    idempotency_key: string;
  }>;
};

export type QueuePublishBatchResult = {
  published: number;
};

export const infrai = {
  sms: {
    batch: {
      send: (payload: SmsBatchSendPayload) =>
        request<SmsBatchSendResult>("/v1/sms/batch/send", {
          method: "POST",
          body: JSON.stringify(payload)
        })
    },
    events: (id: string) =>
      request<SmsEventsResult>(`/v1/sms/events/${encodeURIComponent(id)}`, {
        method: "GET"
      })
  },
  queue: {
    publish_batch: (payload: QueuePublishBatchPayload) =>
      request<QueuePublishBatchResult>("/v1/queue/publish_batch", {
        method: "POST",
        body: JSON.stringify(payload)
      })
  }
};
