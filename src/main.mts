import fetch from "node-fetch";
import type { ContractTag, ITagService } from "atq-types";

interface Market { label: string; pool: string }
interface ChainConfig { label: string; deployment: string; markets: Readonly<Record<string, Market>> }
const CHAINS: Readonly<Record<string, ChainConfig>> = {
  "1": { label: "Ethereum", deployment: "QmdEuhCPTFx5q1Vf7jPQDVGQDpC34KYry82yb3NPc9sK6a", markets: {
    "0xb53c1a33016b2dc2ff3653530bff1848a515c8c5": { label: "Core", pool: "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9" },
    "0xacc030ef66f9dfeae9cbb0cd1b25654b82cfa8d5": { label: "AMM", pool: "0x7937d4799803fbbe595ed57278bc4ca21f3bffcb" },
  } },
  "137": { label: "Polygon", deployment: "QmNfojj4Wu1DErB9iC6epPZc4K2zQCrm4KJUra3DMQqSNm", markets: {
    "0xd05e3e715d945b59290df0ae8ef85c1bdb684744": { label: "Polygon", pool: "0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf" },
  } },
};
const PAGE = 1000, DEADLINE_MS = 180_000;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/, ZERO = "0x" + "0".repeat(40);
const META_QUERY = "query { _meta { deployment hasIndexingErrors block { number hash } } }";
// One fixed accounting role only. Frozen, paused, inactive and zero-supply
// reserves remain included: they still have deployed historical-role tokens.
// Reserve IDs are composite asset+provider IDs, not token output addresses.
const RESERVES_QUERY = "query Reserves($block: Block_height!, $last: ID!) {" +
  " _meta(block: $block) { deployment hasIndexingErrors block { number hash } }" +
  " reserves(first: 1000, orderBy: id, orderDirection: asc, where: { id_gt: $last }, block: $block) {" +
  " id name symbol underlyingAsset isFrozen borrowingEnabled stableBorrowRateEnabled" +
  " vToken { id } pool { id lendingPool } } }";
interface Meta { deployment: string; hasIndexingErrors: boolean; block: { number: number; hash: string | null } }
interface RawReserve {
  id: unknown; name: unknown; symbol: unknown; underlyingAsset: unknown;
  isFrozen: unknown; borrowingEnabled: unknown; stableBorrowRateEnabled: unknown;
  vToken: { id: unknown } | null; pool: { id: unknown; lendingPool: unknown } | null;
}
function address(value: unknown, field: string): string {
  if (typeof value !== "string" || !ADDRESS.test(value) || value.toLowerCase() === ZERO)
    throw Error("Invalid " + field + " address in Aave V2 response.");
  return value.toLowerCase();
}
function plain(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 300)
    throw Error("Invalid " + field + " in Aave V2 response.");
  const result = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/[`*_\[\]<>\\|]/g, " ").replace(/\s+/g, " ").trim();
  if (!result) throw Error("Empty sanitized " + field + ".");
  return result;
}
function checkMeta(value: unknown, deployment: string, number?: number): Meta {
  const meta = value as Meta | null;
  if (!meta || meta.deployment !== deployment || meta.hasIndexingErrors !== false ||
      !Number.isSafeInteger(meta.block?.number) || meta.block.number <= 0 ||
      (meta.block.hash !== null && (typeof meta.block.hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(meta.block.hash))) ||
      (number !== undefined && meta.block.number !== number))
    throw Error("Invalid, inconsistent or errored Aave V2 indexing metadata.");
  return meta;
}
// Descriptive underlying-project metadata, not hard-coded output entries.
// Every output address and its underlying/market association comes from Graph.
function projects(symbol: string, name: string): string[] {
  if (/^ArrakisV1/.test(symbol)) return ["Arrakis V1 (formerly G-UNI)", "Gelato", "Uniswap V3"];
  if (/^AmmUni/.test(symbol)) return ["Uniswap V2"];
  if (/^AmmBpt/.test(symbol)) return ["Balancer"];
  if (/^AmmGUni/.test(symbol)) return ["Gelato", "Uniswap V3"];
  const s = symbol.replace(/^Amm/, "").toUpperCase();
  const known: Readonly<Record<string, string[]>> = {
    AAVE: [], AMPL: ["Ampleforth"], BAL: ["Balancer"], BAT: ["Basic Attention Token"],
    BUSD: ["Paxos", "Binance"], CRV: ["Curve Finance"], CVX: ["Convex Finance"],
    DAI: ["Sky (formerly MakerDAO)"], DPI: ["Index Coop", "DeFi Pulse"],
    ENJ: ["Enjin"], ENS: ["Ethereum Name Service (ENS)"], FEI: ["Fei Protocol"],
    FRAX: ["Frax Finance"], "LEGACY FRAX": ["Frax Finance"], GHST: ["Aavegotchi"], GUSD: ["Gemini"],
    "1INCH": ["1inch"], KNC: ["Kyber Network"], KNCL: ["Kyber Network"],
    LINK: ["Chainlink"], LUSD: ["Liquity"], MANA: ["Decentraland"],
    MKR: ["Sky (formerly MakerDAO)"], PAX: ["Paxos"], USDP: ["Paxos"],
    RAI: ["Reflexer"], REN: ["Ren"], RENFIL: ["Ren"], SNX: ["Synthetix"],
    SUSD: ["Synthetix"], STETH: ["Lido"], SUSHI: ["Sushi"], XSUSHI: ["Sushi"],
    TUSD: ["TrueUSD"], USDC: ["Circle"], "USDC.E": ["Circle", "Polygon PoS Bridge"], USDT: ["Tether"],
    USDT0: ["Tether", "USDT0", "LayerZero"], UST: ["Terra Classic", "Wormhole"],
    USTC: ["Terra Classic", "Wormhole"],
    WBTC: ["Wrapped Bitcoin (WBTC)"], WETH: ["Ethereum"], WPOL: ["Polygon"],
    WMATIC: ["Polygon"], YFI: ["Yearn Finance"], ZRX: ["0x"],
  };
  return known[s] ?? [name];
}
function identity(chain: string, asset: string, symbol: string, name: string): {symbol: string; name: string} {
  // Exact underlying-address rebrands only; queried accounting addresses are
  // never replaced. LP constituent identities are never rewritten recursively.
  if (chain === "137" && asset === "0x2791bca1f2de4661ed88a30c99a7a9449aa84174")
    return {symbol: "USDC.e", name: "Bridged USDC (Polygon PoS)"};
  if (chain === "1" && asset === "0x853d955acef822db058eb8505911ed77f175b99e")
    return {symbol: "Legacy FRAX", name: "Legacy Frax Dollar (FRAX)"};
  if (chain === "1" && asset === "0x8e870d67f660d95d5be530380d0ec0bd388289e1")
    return {symbol: "USDP", name: "Pax Dollar"};
  if (chain === "1" && asset === "0xdd974d5c2e2928dea5f71b9825b8b646686bd200")
    return {symbol: "KNCL", name: "Kyber Network Crystal Legacy"};
  if (chain === "1" && asset === "0xa693b19d2931d498c5b318df961919bb4aee87a5")
    return {symbol: "USTC", name: "TerraClassicUSD (Wormhole)"};
  if (chain === "1" && asset === "0x50379f632ca68d36e50cfbc8f78fe16bd1499d1e")
    return {symbol: "ArrakisV1DAIUSDC", name: "Arrakis V1 DAI/USDC (formerly G-UNI)"};
  if (chain === "1" && asset === "0xd2eec91055f07fe24c9ccb25828ecfefd4be0c41")
    return {symbol: "ArrakisV1USDCUSDT", name: "Arrakis V1 USDC/USDT (formerly G-UNI)"};
  if (chain === "137" && asset === "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270")
    return {symbol: "WPOL", name: "Wrapped POL"};
  if (chain === "137" && asset === "0xc2132d05d31c914a87c6611c10748aeb04b58e8f")
    return {symbol: "USDT0", name: "USDT0"};
  return {symbol, name};
}
export async function returnTags(chainId: string, apiKey: string): Promise<ContractTag[]> {
  if (typeof chainId !== "string" || !Object.hasOwn(CHAINS, chainId))
    throw Error("Unsupported Chain ID: " + String(chainId) + ".");
  if (typeof apiKey !== "string" || !apiKey.trim() || /\s/.test(apiKey))
    throw Error("A nonempty Graph API key without whitespace is required.");
  const config = CHAINS[chainId], endpoint = "https://gateway.thegraph.com/api/deployments/id/" + config.deployment;
  const deadline = Date.now() + DEADLINE_MS;
  async function query(document: string, variables: Record<string, unknown>): Promise<Record<string, unknown>> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw Error("Aave V2 query deadline exceeded; no partial result returned.");
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), Math.min(30_000, remaining));
    try {
      const response = await fetch(endpoint, {method: "POST", redirect: "error", size: 16_000_000,
        headers: {"content-type": "application/json", authorization: "Bearer " + apiKey},
        body: JSON.stringify({query: document, variables}), signal: controller.signal});
      if (!response.ok) throw Error("Graph gateway HTTP " + response.status + ".");
      const payload = await response.json() as {data?: Record<string, unknown>; errors?: unknown};
      if (payload.errors !== undefined && (!Array.isArray(payload.errors) || payload.errors.length))
        throw Error("Graph returned query errors; no partial result returned.");
      if (!payload.data || typeof payload.data !== "object") throw Error("Graph returned no query data.");
      return payload.data;
    } catch {
      // Never reflect arbitrary provider errors that may include credentials.
      throw Error("Unable to retrieve complete Aave V2 variable-debt data.");
    } finally {clearTimeout(timer);}
  }
  const head = checkMeta((await query(META_QUERY, {}))._meta, config.deployment);
  if (!head.block.hash) throw Error("Graph did not identify an indexed snapshot hash.");
  const block = {hash: head.block.hash}, tags = new Map<string, ContractTag>(), names = new Map<string, string>();
  let cursor = "";
  while (true) {
    const result = await query(RESERVES_QUERY, {block, last: cursor});
    const meta = checkMeta(result._meta, config.deployment, head.block.number);
    if (meta.block.hash && meta.block.hash !== head.block.hash) throw Error("Graph snapshot block hash changed.");
    const rows = result.reserves as RawReserve[];
    if (!Array.isArray(rows) || rows.length > PAGE) throw Error("Invalid reserve page.");
    for (const row of rows) {
      if (!row || typeof row.id !== "string" || row.id <= cursor) throw Error("Reserve cursor did not advance in strict order.");
      cursor = row.id;
      const asset = address(row.underlyingAsset, "underlying asset"), contract = address(row.vToken?.id, "variable-debt token");
      const provider = address(row.pool?.id, "market provider"), pool = address(row.pool?.lendingPool, "LendingPool");
      const market = config.markets[provider];
      if (!market || market.pool !== pool || row.id.toLowerCase() !== asset + provider)
        throw Error("Inconsistent or unsupported Aave V2 reserve-market relationship.");
      if ([row.isFrozen, row.borrowingEnabled, row.stableBorrowRateEnabled].some(v => typeof v !== "boolean"))
        throw Error("Missing reserve-state metadata.");
      const indexedSymbol = plain(row.symbol, "asset symbol"), indexedName = plain(row.name, "asset name");
      const assetIdentity = identity(chainId, asset, indexedSymbol, indexedName);
      const label = market.label === "AMM" ? assetIdentity.symbol.replace(/^Amm/, "") : assetIdentity.symbol;
      const prefix = "V2 " + market.label + " ", suffix = " Variable Debt";
      const name = prefix + (label.length + prefix.length + suffix.length <= 50 ? label : label.slice(0, 47 - prefix.length - suffix.length) + "...") + suffix;
      const priorName = names.get(name.toLowerCase());
      if (priorName && priorName !== contract) throw Error("Ambiguous variable-debt name tags.");
      names.set(name.toLowerCase(), contract);
      const associated = [...new Set(["Aave", ...projects(assetIdentity.symbol, assetIdentity.name),
        ...(chainId === "137" && assetIdentity.symbol !== "USDT0" && /\(PoS\)/i.test(indexedName) ? ["Polygon PoS"] : [])])];
      const history = assetIdentity.symbol !== indexedSymbol || assetIdentity.name !== indexedName
        ? " Historical indexed identity: " + indexedName + " (" + indexedSymbol + ")." : "";
      const state = row.isFrozen ? " Legacy frozen reserve." : " Legacy Aave V2 reserve.";
      const tag: ContractTag = {
        "Contract Address": "eip155:" + chainId + ":" + contract,
        "Public Name Tag": name,
        "Project Name": "Aave",
        "UI/Website Link": "https://app.aave.com/",
        "Public Note": associated.join("; ") + ". Aave V2 " + market.label + " non-transferable variable-debt accounting token representing historical variable-rate borrowing balances and accrued interest on " + config.label +
          " for " + assetIdentity.name + " (" + assetIdentity.symbol + "), underlying " + asset + "." + state +
          " Does not imply new borrowing is enabled or a balance is outstanding. LendingPool " + pool + ", provider " + provider + "." + history,
      };
      const prior = tags.get(contract);
      if (prior && JSON.stringify(prior) !== JSON.stringify(tag)) throw Error("Conflicting accounting-token associations.");
      tags.set(contract, tag);
    }
    if (rows.length < PAGE) break;
  }
  if (!tags.size) throw Error("Aave V2 deployment returned no variable-debt tokens.");
  const service: ITagService = {returnTags: async () => [...tags.values()]};
  return service.returnTags(chainId, apiKey);
}
