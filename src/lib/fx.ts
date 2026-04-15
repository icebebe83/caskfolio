"use client";

const FX_API_URL = "https://open.er-api.com/v6/latest/USD";
const LAST_SUCCESSFUL_RATE_KEYS = [
  "caskfolio.fx.usdkrw.last_successful",
  "caskindex.fx.usdkrw.last_successful",
] as const;
const DEFAULT_USD_KRW_FALLBACK = 1450;
const FX_FETCH_TIMEOUT_MS = 4500;

type CurrentFxRate = {
  rate: number;
  source: "live" | "saved" | "default";
  label: string;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readLastSuccessfulRate(): number {
  if (!canUseStorage()) return 0;

  for (const key of LAST_SUCCESSFUL_RATE_KEYS) {
    const raw = window.localStorage.getItem(key);
    const rate = Number(raw);
    if (Number.isFinite(rate) && rate > 0) {
      if (key !== LAST_SUCCESSFUL_RATE_KEYS[0]) {
        window.localStorage.setItem(LAST_SUCCESSFUL_RATE_KEYS[0], String(rate));
      }
      return rate;
    }
  }
  return 0;
}

function saveLastSuccessfulRate(rate: number): void {
  if (!canUseStorage() || !Number.isFinite(rate) || rate <= 0) return;
  window.localStorage.setItem(LAST_SUCCESSFUL_RATE_KEYS[0], String(rate));
}

export async function fetchLiveUsdKrwRate(): Promise<number> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller
    ? window.setTimeout(() => controller.abort(), FX_FETCH_TIMEOUT_MS)
    : null;

  const response = await fetch(FX_API_URL, {
    cache: "no-store",
    signal: controller?.signal,
  }).finally(() => {
    if (timeout) {
      window.clearTimeout(timeout);
    }
  });

  if (!response.ok) {
    throw new Error(`FX fetch failed (${response.status}).`);
  }

  const payload = (await response.json()) as {
    rates?: {
      KRW?: number;
    };
  };
  const rate = payload.rates?.KRW ?? 0;

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("FX response did not include a valid KRW rate.");
  }

  saveLastSuccessfulRate(rate);
  return rate;
}

export async function resolveUsdKrwRate(): Promise<CurrentFxRate> {
  try {
    const liveRate = await fetchLiveUsdKrwRate();
    return {
      rate: liveRate,
      source: "live",
      label: "Live USD/KRW rate loaded automatically.",
    };
  } catch {
    const savedRate = readLastSuccessfulRate();
    if (savedRate) {
      return {
        rate: savedRate,
        source: "saved",
        label: "Live FX fetch failed. Using the last successful USD/KRW rate.",
      };
    }

    return {
      rate: DEFAULT_USD_KRW_FALLBACK,
      source: "default",
      label: `Live FX fetch failed. Using the default fallback rate ${DEFAULT_USD_KRW_FALLBACK.toLocaleString(
        "en-US",
      )} KRW / USD.`,
    };
  }
}
