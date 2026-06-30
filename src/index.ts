// @sponsored-code/sdk — the official client for the Sponsored Code brand API.

import { SDK_VERSION } from "./version.js";

export type Scope = "read" | "write";
export type CampaignStatus = "active" | "paused";

export type Campaign = {
  id: string;
  teamId: string;
  brand: string;
  tagline: string;
  url: string;
  color: string;
  bidUsdCpm: number;
  budgetUsd: number;
  spentUsd: number;
  status: CampaignStatus;
  targetCountries: string[];
  createdAt: string;
};

export type Totals = {
  impressions: number;
  spendUsd: number;
  reach: number;
  clicks: number;
  ctr: number;
  avgCpm: number;
  activeCampaigns: number;
};
export type SeriesPoint = { t: string; impressions: number; spendUsd: number };
export type GeoRow = { country: string; countryCode: string; impressions: number; spendUsd: number };
export type CampaignRow = {
  id: string;
  brand: string;
  status: CampaignStatus;
  color: string;
  impressions: number;
  spendUsd: number;
  clicks: number;
  ctr: number;
  budgetUsd: number;
  spentUsd: number;
  bidUsdCpm: number;
};
export type Analytics = {
  totals: Totals;
  series: SeriesPoint[];
  geo: GeoRow[];
  campaigns: CampaignRow[];
  generatedAt: string;
};

export type Impression = {
  id: string;
  ts: string;
  campaignId: string;
  brand: string;
  spendMicros: number;
  spendUsd: number;
};

export type KeyInfo = { teamId: string; team: string; scopes: Scope[] };

export type CreateCampaignInput = {
  brand: string;
  tagline: string;
  url: string;
  bidUsdCpm?: number;
  budgetUsd?: number;
  color?: string;
  targetCountries?: string[];
};

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type SponsoredCodeOptions = {
  /** API key (`scode_live_…`). Defaults to `process.env.SCODE_API_KEY`. */
  apiKey?: string;
  /** Backend base URL. Defaults to `process.env.SCODE_API` or `https://api.sponsoredcode.com`. */
  baseUrl?: string;
  /** Transport. Defaults to the global `fetch` (Node 18+ / Deno / Bun / edge runtimes). */
  fetch?: FetchLike;
};

/** Every error the SDK throws — carries the HTTP `status` and a machine-readable `code`. */
export class SponsoredCodeError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "SponsoredCodeError";
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_BASE_URL = "https://api.sponsoredcode.com";

const ENV = (name: string): string | undefined =>
  typeof process !== "undefined" && process.env ? process.env[name] : undefined;

type RegFetch = (url: string, init?: { signal?: unknown }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
let _versionNudged = false;
/** Once-per-process nudge if a newer @sponsored-code/sdk is published. Disable with SCODE_NO_UPDATE_CHECK. */
function nudgeIfOutdated(): void {
  if (_versionNudged || ENV("SCODE_NO_UPDATE_CHECK")) return;
  _versionNudged = true;
  const g = globalThis as { fetch?: RegFetch; AbortSignal?: { timeout?(ms: number): unknown } };
  if (!g.fetch || !SDK_VERSION) return;
  const signal = g.AbortSignal?.timeout ? g.AbortSignal.timeout(1500) : undefined;
  g.fetch("https://registry.npmjs.org/@sponsored-code/sdk/latest", { signal })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const latest = (d as { version?: string } | null)?.version;
      if (latest && isNewer(latest, SDK_VERSION))
        console.warn(`@sponsored-code/sdk: a newer version is available (${SDK_VERSION} → ${latest}) — npm i @sponsored-code/sdk@latest`);
    })
    .catch(() => {});
}
function isNewer(a: string, b: string): boolean {
  const x = a.split(".").map((n) => parseInt(n, 10));
  const y = b.split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; }
  return false;
}

function friendlyMessage(code: string, status: number): string {
  switch (code) {
    case "unauthorized":
      return "Unauthorized — the API key is missing, unknown, or revoked.";
    case "insufficient_scope":
      return "This key lacks the 'write' scope. Create a read+write key to manage campaigns.";
    case "no_campaign":
      return "Campaign not found in this key's team.";
    default:
      return `Request failed (${code}, HTTP ${status}).`;
  }
}

export class SponsoredCode {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: SponsoredCodeOptions = {}) {
    this.apiKey = options.apiKey ?? ENV("SCODE_API_KEY") ?? "";
    this.baseUrl = (options.baseUrl ?? ENV("SCODE_API") ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const f = options.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (!f) {
      throw new SponsoredCodeError(
        "No fetch implementation found. Use Node 18+, a browser, or pass { fetch }.",
        0,
        "no_fetch",
      );
    }
    this.fetchImpl = f;
    nudgeIfOutdated();
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    if (!this.apiKey) {
      throw new SponsoredCodeError(
        "Missing API key. Pass new SponsoredCode({ apiKey }) or set SCODE_API_KEY.",
        0,
        "no_api_key",
      );
    }
    const headers: Record<string, string> = { authorization: `Bearer ${this.apiKey}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await this.fetchImpl(this.baseUrl + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      // non-JSON body
    }
    if (!res.ok) {
      const code = String(json?.error ?? json?.reason ?? `http_${res.status}`);
      throw new SponsoredCodeError(friendlyMessage(code, res.status), res.status, code);
    }
    return json as T;
  }

  /** The team + scopes this API key resolves to. A cheap way to verify a key works. */
  whoami(): Promise<KeyInfo> {
    return this.request<KeyInfo>("GET", "/v1/api/me");
  }

  /** Aggregate analytics for the team: impressions, spend, reach, clicks, geography, per-campaign. */
  analytics(): Promise<Analytics> {
    return this.request<Analytics>("GET", "/v1/api/analytics");
  }

  /** The team's most recent impressions (newest first). `limit` 1–100, default 20. */
  async impressions(options: { limit?: number } = {}): Promise<Impression[]> {
    const q = options.limit ? `?limit=${Math.max(1, Math.min(100, Math.floor(options.limit)))}` : "";
    const { items } = await this.request<{ items: Impression[] }>("GET", `/v1/api/impressions${q}`);
    return items;
  }

  readonly campaigns = {
    /** Every campaign in the key's team. */
    list: async (): Promise<Campaign[]> => {
      const { campaigns } = await this.request<{ campaigns: Campaign[] }>("GET", "/v1/api/campaigns");
      return campaigns;
    },
    /** Launch a campaign (needs a key with the `write` scope). */
    create: async (input: CreateCampaignInput): Promise<Campaign> => {
      const { campaign } = await this.request<{ campaign: Campaign }>("POST", "/v1/api/campaigns", input);
      return campaign;
    },
    /** Pause or resume a campaign (needs `write`). */
    setStatus: async (campaignId: string, status: CampaignStatus): Promise<Campaign> => {
      const { campaign } = await this.request<{ campaign: Campaign }>("POST", "/v1/api/campaigns/status", {
        campaignId,
        status,
      });
      return campaign;
    },
    pause: (campaignId: string): Promise<Campaign> => this.campaigns.setStatus(campaignId, "paused"),
    resume: (campaignId: string): Promise<Campaign> => this.campaigns.setStatus(campaignId, "active"),
  };
}

export default SponsoredCode;
