type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: Record<string, unknown> | null;
  old_record?: Record<string, unknown> | null;
};

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const TELEGRAM_CHAT_ID = "1007112216";
const WEBHOOK_SECRET_HEADER = "x-webhook-secret";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function timingSafeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let diff = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}

function requireWebhookSecret(request: Request): Response | null {
  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
  const receivedSecret = request.headers.get(WEBHOOK_SECRET_HEADER) ?? "";

  if (!expectedSecret) {
    console.error("Missing TELEGRAM_WEBHOOK_SECRET.");
    return jsonResponse({ error: "Webhook secret is not configured." }, 500);
  }

  if (!receivedSecret || !timingSafeEqual(receivedSecret, expectedSecret)) {
    return jsonResponse({ error: "Unauthorized webhook request." }, 401);
  }

  return null;
}

function toText(value: unknown, fallback = "-"): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSeoulDate(value: unknown): string {
  const source = typeof value === "string" || typeof value === "number" ? value : "";
  const date = source ? new Date(source) : new Date();

  if (Number.isNaN(date.getTime())) return "-";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}.${values.month}.${values.day} ${values.hour}:${values.minute}`;
}

function formatCurrency(record: Record<string, unknown>): string {
  const priceValue = record.price;
  const numericPrice =
    typeof priceValue === "number"
      ? priceValue
      : typeof priceValue === "string"
        ? Number(priceValue.replace(/,/g, ""))
        : Number.NaN;
  const price = Number.isFinite(numericPrice)
    ? new Intl.NumberFormat("ko-KR").format(numericPrice)
    : toText(priceValue);
  const currency = toText(record.currency, "");
  return currency ? `${price} ${currency}` : price;
}

function buildUserSignupMessage(record: Record<string, unknown>): string {
  return [
    "🆕 신규 가입",
    "",
    `이메일: ${escapeHtml(toText(record.email))}`,
    "",
    `시간: ${escapeHtml(formatSeoulDate(record.created_at))}`,
  ].join("\n");
}

function buildListingMessage(record: Record<string, unknown>): string {
  return [
    "🥃 새 바틀 등록",
    "",
    `바틀: ${escapeHtml(toText(record.bottle_name))}`,
    "",
    `카테고리: ${escapeHtml(toText(record.category))}`,
    "",
    `가격: ${escapeHtml(formatCurrency(record))}`,
    "",
    `시간: ${escapeHtml(formatSeoulDate(record.created_at))}`,
  ].join("\n");
}

function buildTelegramMessage(payload: WebhookPayload): string | null {
  if (payload.type !== "INSERT" || !payload.record) return null;

  if (payload.schema === "auth" && payload.table === "users") {
    return buildUserSignupMessage(payload.record);
  }

  if (payload.schema === "public" && payload.table === "listings") {
    return buildListingMessage(payload.record);
  }

  return null;
}

async function sendTelegramMessage(message: string): Promise<void> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN.");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram API request failed: ${response.status} ${errorText}`);
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const secretError = requireWebhookSecret(request);
  if (secretError) return secretError;

  let payload: WebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload." }, 400);
  }

  const message = buildTelegramMessage(payload);
  if (!message) {
    return jsonResponse({ skipped: true });
  }

  try {
    await sendTelegramMessage(message);
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Telegram notification failed." }, 502);
  }
});
