import { SponsoredCode, SponsoredCodeError, type FetchLike } from "../src/index";

// Unit test for the SDK using an injected fetch — no network, no server.

let fails = 0;
const assert = (c: boolean, m: string) => {
  console.log(`  ${c ? "✓" : "✗"} ${m}`);
  if (!c) fails++;
};

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

/** A fetch stub that records calls and replies from a queued list of responses. */
function stub(responses: Array<{ status?: number; json: unknown }>) {
  const calls: Call[] = [];
  let i = 0;
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, method: init?.method ?? "GET", headers: init?.headers ?? {}, body: init?.body });
    const r = responses[i++] ?? { status: 200, json: {} };
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, text: async () => JSON.stringify(r.json) };
  };
  return { fetch, calls };
}

console.log("\n[sdk] @sponsored-code/sdk — request building, unwrapping, error mapping");

{
  const { fetch, calls } = stub([{ json: { teamId: "t1", team: "Example", scopes: ["read", "write"] } }]);
  const scode = new SponsoredCode({ apiKey: "scode_live_abc", baseUrl: "https://api.example/", fetch });
  const me = await scode.whoami();
  assert(calls[0]!.url === "https://api.example/v1/api/me", "GET me hits /v1/api/me (trailing slash trimmed)");
  assert(calls[0]!.headers.authorization === "Bearer scode_live_abc", "the API key rides as a Bearer header");
  assert(me.team === "Example" && me.scopes.includes("write"), "whoami() returns the parsed key info");
}

{
  const { fetch, calls } = stub([
    { json: { totals: { impressions: 3 }, series: [], geo: [], campaigns: [], generatedAt: "now" } },
    { json: { items: [{ id: "i1", campaignId: "c1", brand: "Example", spendUsd: 0.01 }] } },
  ]);
  const scode = new SponsoredCode({ apiKey: "k", baseUrl: "https://api.example", fetch });
  const a = await scode.analytics();
  assert(a.totals.impressions === 3, "analytics() returns the analytics object");
  const imps = await scode.impressions({ limit: 5 });
  assert(calls[1]!.url.endsWith("/v1/api/impressions?limit=5"), "impressions() passes a clamped limit");
  assert(imps.length === 1 && imps[0]!.brand === "Example", "impressions() unwraps { items }");
}

{
  const camp = { id: "c9", teamId: "t1", brand: "Example", status: "active" };
  const { fetch, calls } = stub([
    { json: { campaigns: [camp] } },
    { json: { campaign: camp } },
    { json: { campaign: { ...camp, status: "paused" } } },
  ]);
  const scode = new SponsoredCode({ apiKey: "k", baseUrl: "https://api.example", fetch });

  const list = await scode.campaigns.list();
  assert(list.length === 1 && list[0]!.id === "c9", "campaigns.list() unwraps { campaigns }");

  const created = await scode.campaigns.create({ brand: "Example", tagline: "t", url: "https://x" });
  assert(calls[1]!.method === "POST" && JSON.parse(calls[1]!.body!).brand === "Example", "campaigns.create() POSTs the input as JSON");
  assert(created.id === "c9", "create() returns the campaign");

  const paused = await scode.campaigns.pause("c9");
  assert(JSON.parse(calls[2]!.body!).status === "paused" && paused.status === "paused", "campaigns.pause() sends status=paused");
}

{
  const { fetch } = stub([{ status: 403, json: { error: "insufficient_scope", need: "write" } }]);
  const scode = new SponsoredCode({ apiKey: "ro", baseUrl: "https://api.example", fetch });
  let err: SponsoredCodeError | null = null;
  try {
    await scode.campaigns.create({ brand: "x", tagline: "y", url: "https://z" });
  } catch (e) {
    err = e as SponsoredCodeError;
  }
  assert(err instanceof SponsoredCodeError && err.status === 403 && err.code === "insufficient_scope", "a 403 throws a typed SponsoredCodeError with status + code");
}

{
  const { fetch, calls } = stub([]);
  const scode = new SponsoredCode({ apiKey: "", baseUrl: "https://api.example", fetch });
  let code = "";
  try {
    await scode.whoami();
  } catch (e) {
    code = (e as SponsoredCodeError).code;
  }
  assert(code === "no_api_key" && calls.length === 0, "a missing API key throws no_api_key without hitting the network");
}

// funding.depositCalldata builds the EXACT approve + deposit calls a consumer signs and broadcasts. A
// regression in the selectors, arg order, or padding silently produces wrong calldata → failed deposits.
// Golden bytes computed independently via ethers' ABI encoder (the SDK has no ethers — these are pinned).
{
  const teamRef = "0x" + "11223344556677889900aabbccddeeff" + "0".repeat(32);
  const { fetch } = stub([{ json: { ok: true, distributor: "0x000000000000000000000000000000000000dEaD", usdc: "0x000000000000000000000000000000000000bEEF", chainId: 137, network: "polygon", teamRef, decimals: 6 } }]);
  const scode = new SponsoredCode({ apiKey: "k", baseUrl: "https://api.example", fetch });
  const plan = await scode.funding.depositCalldata(10); // $10 → 10_000_000 micros (6 decimals)
  assert(plan.amountMicros === "10000000", "amount converted to USDC micros");
  assert(plan.approve.to.toLowerCase() === "0x000000000000000000000000000000000000beef" && plan.deposit.to.toLowerCase() === "0x000000000000000000000000000000000000dead", "approve targets USDC, deposit targets the distributor");
  assert(plan.approve.data === "0x095ea7b3000000000000000000000000000000000000000000000000000000000000dead0000000000000000000000000000000000000000000000000000000000989680", "approve(distributor, 10e6) calldata matches the ethers golden");
  assert(plan.deposit.data === "0x1de26e1611223344556677889900aabbccddeeff000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000989680", "deposit(teamRef, 10e6) calldata matches the ethers golden");
  assert(plan.approve.value === "0x0" && plan.deposit.value === "0x0", "both calls send 0 native value (USDC is an ERC-20)");
}

console.log(`\n${fails ? "FAILED" : "PASSED"} — ${fails} failure(s)`);
if (fails) process.exitCode = 1;
