<p align="center">
  <a href="https://sponsoredcode.com"><img src="https://sponsoredcode.com/mascot/sdk.webp" alt="Sponsored Code — brand SDK" width="300" /></a>
</p>

# [<img src="https://sponsoredcode.com/sponsored-code-mark.svg" alt="Sponsored Code" />](https://sponsoredcode.com)

[![npm](https://img.shields.io/npm/v/@sponsored-code/sdk?color=cb3837&logo=npm)](https://www.npmjs.com/package/@sponsored-code/sdk)
[![license](https://img.shields.io/badge/license-source--available-blue)](./LICENSE)
[![sponsoredcode.com](https://img.shields.io/badge/web-sponsoredcode.com-111)](https://sponsoredcode.com)

## Brand SDK

The official SDK for the [Sponsored Code](https://sponsoredcode.com) brand API. Launch campaigns and pull their analytics from your own code — no wallet, no browser — with an **API key**. Fully typed, so your editor's autocomplete doubles as the reference.

```bash
npm install @sponsored-code/sdk
```

## Get an API key

In the [dashboard](https://sponsoredcode.com/dashboard), open **Settings → API keys** and create a key.
You'll see the secret (`scode_live_…`) **once** — store it safely (a secret manager, or `SCODE_API_KEY`
in your environment). A key is scoped to one team and to **read** and/or **write**:

- **read** — analytics, impressions, list campaigns
- **write** — create, pause, and resume campaigns

Keys are revocable at any time from the same screen.

## Quickstart

```ts
import { SponsoredCode } from "@sponsored-code/sdk";

const scode = new SponsoredCode({ apiKey: process.env.SCODE_API_KEY });

// Verify the key, and see the team + scopes it grants
const { teamId, team, scopes } = await scode.whoami();

// Pull aggregate analytics
const { totals, geo } = await scode.analytics();
console.log(`${totals.impressions} impressions · $${totals.spendUsd} spent · ${totals.clicks} clicks`);

// Launch a campaign (needs the "write" scope)
const campaign = await scode.campaigns.create({
  brand: "Example",
  tagline: "yield on idle USDC",
  url: "https://example.com",
  bidUsdCpm: 20,
  budgetUsd: 500,
  targetCountries: ["US", "DE"], // optional — omit for everywhere
});

// Pause / resume it later
await scode.campaigns.pause(campaign.id);
await scode.campaigns.resume(campaign.id);
```

## Configuration

`new SponsoredCode(options)`:

| Option    | Default | Notes |
| --------- | ------- | ----- |
| `apiKey`  | `process.env.SCODE_API_KEY` | Your `scode_live_…` key. |
| `baseUrl` | `process.env.SCODE_API` → `https://api.sponsoredcode.com` | Point at another backend in dev. |
| `fetch`   | global `fetch` | Inject a custom transport (tests, proxy). |

Dependency-free and runs anywhere modern `fetch` exists — Node 18+, Deno, Bun, and edge/serverless
runtimes. Your API key is a secret: use the SDK **server-side**, never in a public browser bundle.

## Methods

| Method | Scope | Description |
|---|---|---|
| `whoami()` | read | The team and scopes the key resolves to (`KeyInfo`) — the cheap way to verify a key works. |
| `analytics()` | read | Aggregate analytics for the team (`Analytics`): `totals`, a daily `series`, a `geo` breakdown, and a per-campaign roll-up. |
| `impressions({ limit })` | read | The team's most recent impressions, newest first (`Impression[]`). `limit` 1–100, default 20. |
| `campaigns.list()` | read | Every campaign in the team (`Campaign[]`). |
| `campaigns.create(input)` | write | Launch a campaign and return it (`Campaign`). See **CreateCampaignInput** below. |
| `campaigns.pause(id)` / `campaigns.resume(id)` | write | Pause or resume a campaign (`Campaign`). |
| `campaigns.setStatus(id, status)` | write | Set a campaign to `"active"` or `"paused"` directly (`Campaign`). |

Analytics and impressions are **aggregate** — counts, spend, and geography for your own campaigns. The
SDK never exposes an individual developer's wallet or IP.

## Types

Everything is fully typed. The shapes you'll work with:

```ts
type Scope = "read" | "write";
type CampaignStatus = "active" | "paused";

type KeyInfo = { teamId: string; team: string; scopes: Scope[] };

type Campaign = {
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
  targetCountries: string[]; // ISO-3166 alpha-2, uppercase; empty = everywhere
  createdAt: string;
};

type CreateCampaignInput = {
  brand: string;
  tagline: string;
  url: string;
  bidUsdCpm?: number;         // max CPM in USD, default 20
  budgetUsd?: number;
  color?: string;             // hex, default "#2563eb"
  targetCountries?: string[]; // e.g. ["US", "DE"]; omit = everywhere
};

type Totals = {
  impressions: number;
  spendUsd: number;
  reach: number;
  clicks: number;
  ctr: number;
  avgCpm: number;
  activeCampaigns: number;
};

type Analytics = {
  totals: Totals;
  series: { t: string; impressions: number; spendUsd: number }[];
  geo: { country: string; countryCode: string; impressions: number; spendUsd: number }[];
  campaigns: {
    id: string; brand: string; status: CampaignStatus; color: string;
    impressions: number; spendUsd: number; clicks: number; ctr: number;
    budgetUsd: number; spentUsd: number; bidUsdCpm: number;
  }[];
  generatedAt: string;
};

type Impression = {
  id: string;
  ts: string;
  campaignId: string;
  brand: string;
  spendMicros: number;
  spendUsd: number;
};
```

## Errors

Every failure throws a `SponsoredCodeError` carrying a numeric `.status` and a stable, machine-readable
`.code` (`unauthorized`, `insufficient_scope`, `no_campaign`, `no_api_key`, …):

```ts
import { SponsoredCode, SponsoredCodeError } from "@sponsored-code/sdk";

try {
  await scode.campaigns.create({ brand: "Example", tagline: "…", url: "https://example.com" });
} catch (err) {
  if (err instanceof SponsoredCodeError && err.code === "insufficient_scope") {
    console.error("This key is read-only — create a read+write key.");
  }
}
```

## License

Source-available — see [LICENSE](./LICENSE).
