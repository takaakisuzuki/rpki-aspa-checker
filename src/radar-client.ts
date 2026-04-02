import type {
  Env,
  RadarAspaSnapshotResponse,
  RadarRoutesRealtimeResponse,
  RadarPfx2AsResponse,
  AspaObject,
  AsnInfo,
  CachedAspaData,
} from "./types";

const KV_KEY_ASPA = "aspa-snapshot";
const KV_TTL_SECONDS = 1800; // 30 minutes

function checkToken(env: Env): void {
  if (!env.CLOUDFLARE_API_TOKEN) {
    throw new Error(
      "CLOUDFLARE_API_TOKEN is not set. Run: wrangler secret put CLOUDFLARE_API_TOKEN (or add it to .dev.vars for local dev)"
    );
  }
}

async function safeErrorText(resp: globalThis.Response): Promise<string> {
  const text = await resp.text();
  if (text.startsWith("<") || text.startsWith("<!")) {
    return "(HTML error page returned)";
  }
  return text.length > 200 ? text.slice(0, 200) + "..." : text;
}

export async function fetchAspaSnapshot(
  env: Env,
  customerAsn?: number,
  providerAsn?: number
): Promise<RadarAspaSnapshotResponse> {
  checkToken(env);
  const url = new URL(`${env.RADAR_API_BASE}/bgp/rpki/aspa/snapshot`);
  url.searchParams.set("format", "json");
  url.searchParams.set("asnInfo", "true");
  if (customerAsn) url.searchParams.set("customerAsn", String(customerAsn));
  if (providerAsn) url.searchParams.set("providerAsn", String(providerAsn));

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
  });
  if (!resp.ok) {
    throw new Error(`Radar ASPA snapshot API error: ${resp.status} ${await safeErrorText(resp)}`);
  }
  return resp.json();
}

export async function fetchRealtimeRoutes(
  env: Env,
  prefix: string
): Promise<RadarRoutesRealtimeResponse> {
  checkToken(env);
  const url = new URL(`${env.RADAR_API_BASE}/bgp/routes/realtime`);
  url.searchParams.set("prefix", prefix);
  url.searchParams.set("format", "json");

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
  });
  if (!resp.ok) {
    throw new Error(`Radar realtime routes API error: ${resp.status} ${await safeErrorText(resp)}`);
  }
  return resp.json();
}

export async function fetchPfx2As(
  env: Env,
  prefix: string
): Promise<RadarPfx2AsResponse> {
  checkToken(env);
  const url = new URL(`${env.RADAR_API_BASE}/bgp/routes/pfx2as`);
  url.searchParams.set("prefix", prefix);
  url.searchParams.set("format", "json");

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
  });
  if (!resp.ok) {
    throw new Error(`Radar pfx2as API error: ${resp.status} ${await safeErrorText(resp)}`);
  }
  return resp.json();
}

// --- KV Cache Layer ---

export async function getAspaData(env: Env): Promise<CachedAspaData> {
  const cached = await env.ASPA_KV.get<CachedAspaData>(KV_KEY_ASPA, "json");
  if (cached) return cached;
  return refreshAspaCache(env);
}

export async function refreshAspaCache(env: Env): Promise<CachedAspaData> {
  const snapshot = await fetchAspaSnapshot(env);
  const data: CachedAspaData = {
    objects: snapshot.result.aspaObjects ?? [],
    asnInfo: snapshot.result.asnInfo ?? {},
    updatedAt: snapshot.result.meta.dataTime,
    totalCount: snapshot.result.meta.totalCount,
  };
  await env.ASPA_KV.put(KV_KEY_ASPA, JSON.stringify(data), {
    expirationTtl: KV_TTL_SECONDS,
  });
  return data;
}

// --- ASN Name Lookup ---

export async function fetchAsnNames(
  env: Env,
  asns: number[]
): Promise<Record<string, string>> {
  if (!asns.length) return {};
  checkToken(env);
  const unique = [...new Set(asns)];
  const url = new URL(`${env.RADAR_API_BASE}/entities/asns`);
  url.searchParams.set("asn", unique.join(","));
  url.searchParams.set("format", "json");

  try {
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
    });
    if (!resp.ok) return {};
    const data: any = await resp.json();
    const result: Record<string, string> = {};
    for (const entry of data?.result?.asns ?? []) {
      result[String(entry.asn)] = entry.aka || entry.name || `AS${entry.asn}`;
    }
    return result;
  } catch {
    return {};
  }
}

// --- Helpers ---

export function buildAspaMap(objects: AspaObject[]): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  for (const obj of objects) {
    map.set(obj.customerAsn, new Set(obj.providers));
  }
  return map;
}

export function getAsnName(asnInfo: Record<string, AsnInfo> | null | undefined, asn: number): string {
  const info = asnInfo?.[String(asn)];
  return info ? info.name : `AS${asn}`;
}
