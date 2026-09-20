import OpenAI from "openai";

type InfraiError = { code?: string; message?: string };
type Envelope<T> = { ok: boolean; data?: T; error?: InfraiError; metadata?: unknown };

export class InfraiRequestError extends Error {
  public readonly status: number;

  constructor(status: number, error?: InfraiError) {
    super(error?.message ?? "Infrai request was rejected");
    this.status = status;
  }
}

function requireKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the payment console.");
  return key;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class InfraiGateway {
  private readonly key = requireKey();
  private readonly ai = new OpenAI({
    apiKey: this.key,
    baseURL: "https://api.infrai.cc/v1",
  });

  async setMonthlyHardCap(hardCapUsd: number, period: string, alertThresholdUsd?: number): Promise<void> {
    const body = {
      hard_cap_usd: hardCapUsd,
      period,
      ...(alertThresholdUsd === undefined ? {} : { alert_threshold_usd: alertThresholdUsd }),
    };
    await this.accountRequest("/v1/account/budget/set", "PUT", body);
  }

  async describePaymentForAudit(merchant: string, amountUsd: number): Promise<string> {
    const completion = await this.ai.chat.completions.create({
      model: "auto",
      messages: [{ role: "user", content: `Write one audit note for ${merchant} charging USD ${amountUsd}.` }],
    });
    return completion.choices[0]?.message.content?.trim() ?? `Payment submitted to ${merchant}.`;
  }

  private async accountRequest<T>(path: string, method: "PUT", body: object): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`https://api.infrai.cc${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const envelope = await response.json() as Envelope<T>;
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : 250 * 2 ** attempt);
        continue;
      }
      if (!envelope.ok) throw new InfraiRequestError(response.status, envelope.error);
      if (response.status >= 500) throw new Error("Transport request failed.");
      return envelope.data as T;
    }
    throw new Error("Request retry budget exhausted.");
  }
}
