// The coins a player may bring to the table: Starknet tokens on AVNU's verified list or Ekubo's token
// list. Both lists are fetched by the server (cached), merged by address, and an imported coin joins
// the cashier like a preset one (deposits, prices from Ekubo quotes, stakes, cash-outs).
//
// AVNU_TOKENS_URL / EKUBO_TOKENS_URL override the sources.
const SOURCES = {
  mainnet: { avnu: 'https://starknet.api.avnu.fi/v1/starknet/tokens?page=0&size=2000&tag=Verified', ekubo: 'https://mainnet-api.ekubo.org/tokens' },
  sepolia: { avnu: 'https://sepolia.api.avnu.fi/v1/starknet/tokens?page=0&size=2000', ekubo: 'https://sepolia-api.ekubo.org/tokens' },
};
const TTL = 30 * 60 * 1000;

// the lists come in a few shapes: an array, { content: [...] }, { tokens: [...] }
export function parseTokenList(json) {
  const arr = Array.isArray(json) ? json : json?.content ?? json?.tokens ?? json?.data ?? [];
  const out = [];
  for (const t of arr) {
    const address = t?.address ?? t?.l2_token_address ?? t?.token_address ?? t?.tokenAddress ?? t?.l2TokenAddress;
    const decimals = Number(t?.decimals);
    const symbol = String(t?.symbol ?? '').trim();
    if (!address || !/^0x[0-9a-fA-F]{1,64}$/.test(String(address)) || !symbol || !(decimals >= 0 && decimals <= 36)) continue;
    out.push({ address: `0x${BigInt(address).toString(16).padStart(64, '0')}`, symbol: symbol.slice(0, 16), name: String(t?.name ?? symbol).slice(0, 40), decimals, logo: t?.logoUri ?? t?.logo_url ?? t?.logoURI ?? t?.logo ?? null });
  }
  return out;
}

export function createCatalog({ network = 'mainnet', env = process.env, fetchImpl = fetch, now = () => Date.now(), log = console } = {}) {
  const src = { avnu: env.AVNU_TOKENS_URL || SOURCES[network]?.avnu, ekubo: env.EKUBO_TOKENS_URL || SOURCES[network]?.ekubo };
  let cache = null;
  let at = 0;
  let loading = null;

  async function fetchList(name, url) {
    if (!url) return [];
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000), headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseTokenList(await res.json()).map((t) => ({ ...t, src: name }));
    } catch (e) {
      log.warn?.(`token list ${name}: ${e?.message ?? e}`);
      return [];
    }
  }

  async function list() {
    if (cache && now() - at < TTL) return cache;
    loading ??= (async () => {
      const [a, e] = await Promise.all([fetchList('avnu', src.avnu), fetchList('ekubo', src.ekubo)]);
      const merged = new Map();
      for (const t of [...a, ...e]) {
        const had = merged.get(t.address);
        if (had) had.src = [...new Set([...had.src, t.src])];
        else merged.set(t.address, { ...t, src: [t.src] });
      }
      // a failed refresh keeps the last good list
      if (merged.size || !cache) {
        cache = [...merged.values()].sort((x, y) => y.src.length - x.src.length || x.symbol.localeCompare(y.symbol));
        at = now();
      }
      loading = null;
      return cache;
    })();
    return loading;
  }

  async function find(address) {
    let id;
    try {
      id = `0x${BigInt(address).toString(16).padStart(64, '0')}`;
    } catch {
      return null;
    }
    return (await list()).find((t) => t.address === id) ?? null;
  }

  return { list, find };
}
