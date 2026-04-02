import type { Env, PrefixCheckResult, RouteAspaDetail, PrefixOriginDetail } from "./types";
import { getAspaData, refreshAspaCache, buildAspaMap, getAsnName, fetchAsnNames, fetchRealtimeRoutes, fetchPfx2As } from "./radar-client";
import { verifyAsPath, verifyUpstream } from "./aspa-verify";
import { renderHTML } from "./ui";

// --- Security: constants ---
const MAX_ASPATH_LENGTH = 64;
const MAX_ASN_VALUE = 4294967295; // 2^32 - 1
const MAX_PREFIX_LENGTH = 128; // max input string length for prefix
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function getClientIP(request: Request): string {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX_REQUESTS;
}

function securityHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Security-Policy": "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    ...extra,
  };
}

function sanitizeErrorMessage(msg: string): string {
  return msg.replace(/[<>"'&]/g, "").slice(0, 200);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: securityHeaders() });
    }

    // Only allow GET
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: securityHeaders({ "Content-Type": "application/json" }),
      });
    }

    // Rate limiting for API endpoints
    if (path.startsWith("/api/")) {
      const ip = getClientIP(request);
      if (!checkRateLimit(ip)) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
          status: 429,
          headers: securityHeaders({ "Content-Type": "application/json", "Retry-After": "60" }),
        });
      }
    }

    try {
      if (path === "/" || path === "/index.html") {
        return new Response(renderHTML(), {
          headers: securityHeaders({ "Content-Type": "text/html; charset=utf-8" }),
        });
      }

      const apiHeaders = securityHeaders({ "Content-Type": "application/json" });

      if (path === "/api/check-aspath") {
        return await handleCheckAsPath(url, env, apiHeaders);
      }

      if (path === "/api/check-prefix") {
        return await handleCheckPrefix(url, env, apiHeaders);
      }

      if (path === "/api/aspa-stats") {
        return await handleAspaStats(env, apiHeaders);
      }

      return new Response("Not Found", { status: 404, headers: securityHeaders() });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: sanitizeErrorMessage(err.message || "Internal error") }), {
        status: 500,
        headers: securityHeaders({ "Content-Type": "application/json" }),
      });
    }
  },

  // Cron trigger: refresh ASPA cache
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refreshAspaCache(env));
  },
};

// --- API Handlers ---

async function handleCheckAsPath(
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const pathParam = url.searchParams.get("path");
  if (!pathParam) {
    return jsonError("Missing 'path' parameter. Provide comma-separated ASNs.", 400, corsHeaders);
  }

  // Validate: only digits, commas, spaces allowed
  if (!/^[\d,\s]+$/.test(pathParam)) {
    return jsonError("Invalid characters in AS path.", 400, corsHeaders);
  }

  const asPath = pathParam.split(",").map((s) => parseInt(s.trim(), 10));
  if (asPath.some(isNaN) || asPath.length === 0) {
    return jsonError("Invalid AS path. Provide comma-separated integers.", 400, corsHeaders);
  }
  if (asPath.length > MAX_ASPATH_LENGTH) {
    return jsonError(`AS path too long. Maximum ${MAX_ASPATH_LENGTH} ASNs.`, 400, corsHeaders);
  }
  if (asPath.some((a) => a < 0 || a > MAX_ASN_VALUE)) {
    return jsonError("ASN out of valid range (0-4294967295).", 400, corsHeaders);
  }

  // Fetch ASPA data and ASN names in parallel
  const [aspaData, asnNames] = await Promise.all([
    getAspaData(env),
    fetchAsnNames(env, asPath),
  ]);
  const aspaMap = buildAspaMap(aspaData.objects);
  const result = verifyAsPath(asPath, aspaMap);

  return new Response(
    JSON.stringify({
      ...result,
      asnNames,
      dataTime: aspaData.updatedAt,
      totalCount: aspaData.totalCount,
    }),
    { headers: corsHeaders }
  );
}

function jsonError(message: string, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers });
}

async function handleCheckPrefix(
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const prefix = url.searchParams.get("prefix");
  if (!prefix) {
    return jsonError("Missing 'prefix' parameter.", 400, corsHeaders);
  }
  // Validate: only valid prefix characters (digits, dots, colons, slash)
  if (!/^[\da-fA-F.:/ ]+$/.test(prefix) || prefix.length > MAX_PREFIX_LENGTH) {
    return jsonError("Invalid prefix format.", 400, corsHeaders);
  }
  // Must contain a slash for CIDR
  if (!prefix.includes("/")) {
    return jsonError("Prefix must be in CIDR notation (e.g. 1.1.1.0/24).", 400, corsHeaders);
  }

  // Fetch ASPA data and route data in parallel
  const [aspaData, pfx2AsResult, realtimeResult] = await Promise.all([
    getAspaData(env),
    fetchPfx2As(env, prefix).catch(() => null),
    fetchRealtimeRoutes(env, prefix).catch(() => null),
  ]);

  const aspaMap = buildAspaMap(aspaData.objects);

  // Build supplemental ASN info from realtime routes meta
  const asnInfoMap: Record<string, { name: string; country: string }> = {};
  if (realtimeResult?.result?.meta?.asn_info) {
    for (const entry of realtimeResult.result.meta.asn_info) {
      asnInfoMap[String(entry.asn)] = {
        name: entry.as_name?.split(" ")[0] || `AS${entry.asn}`,
        country: entry.country_code || "??",
      };
    }
  }

  function resolveAsnName(asn: number): string {
    const fromAspa = aspaData.asnInfo?.[String(asn)];
    if (fromAspa?.name) return fromAspa.name;
    const fromRoutes = asnInfoMap[String(asn)];
    if (fromRoutes?.name) return fromRoutes.name;
    return `AS${asn}`;
  }

  function resolveCountry(asn: number): string {
    const fromAspa = aspaData.asnInfo?.[String(asn)];
    if (fromAspa?.country) return fromAspa.country;
    const fromRoutes = asnInfoMap[String(asn)];
    if (fromRoutes?.country) return fromRoutes.country;
    return "??";
  }

  // Build origin info
  const origins: PrefixOriginDetail[] = [];
  if (pfx2AsResult?.result?.prefix_origins) {
    for (const po of pfx2AsResult.result.prefix_origins) {
      origins.push({
        asn: po.origin,
        asnName: resolveAsnName(po.origin),
        country: resolveCountry(po.origin),
        rpkiStatus: po.rpki_validation,
        peerCount: po.peer_count,
      });
    }
  }

  // Build routes with ASPA check (limit to 10 routes to keep response reasonable)
  const routes: RouteAspaDetail[] = [];
  if (realtimeResult?.result?.routes) {
    const routeSlice = realtimeResult.result.routes.slice(0, 10);
    for (const route of routeSlice) {
      const aspaCheck = verifyUpstream(route.as_path, aspaMap);
      routes.push({
        asPath: route.as_path,
        peerAsn: route.peer_asn,
        collector: route.collector || "unknown",
        aspaCheck,
      });
    }
  }

  const result: PrefixCheckResult & { dataTime: string } = {
    prefix,
    origins,
    routes,
    dataTime: aspaData.updatedAt,
  };

  return new Response(JSON.stringify(result), { headers: corsHeaders });
}

async function handleAspaStats(
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const aspaData = await getAspaData(env);
  return new Response(
    JSON.stringify({
      totalAspaObjects: aspaData.totalCount,
      cachedObjects: aspaData.objects.length,
      updatedAt: aspaData.updatedAt,
    }),
    { headers: corsHeaders }
  );
}
