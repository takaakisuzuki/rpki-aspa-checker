// --- Cloudflare Radar API Response Types ---

export interface RadarAspaSnapshotResponse {
  result: {
    asnInfo: Record<string, AsnInfo>;
    aspaObjects: AspaObject[];
    meta: {
      dataTime: string;
      queryTime: string;
      totalCount: number;
    };
  };
  success: boolean;
}

export interface AsnInfo {
  asn: number;
  country: string;
  name: string;
}

export interface AspaObject {
  customerAsn: number;
  providers: number[];
}

// --- Radar BGP Routes Types ---

export interface RadarRoutesRealtimeResponse {
  result: {
    meta: {
      asn_info: AsnInfoEntry[];
      collectors: CollectorInfo[];
    };
    routes: RealtimeRoute[];
  };
  success: boolean;
}

export interface AsnInfoEntry {
  as_name: string;
  asn: number;
  country_code: string;
  org_id: string;
  org_name: string;
}

export interface CollectorInfo {
  collector: string;
  latest_realtime_ts: string;
  latest_rib_ts: string;
  latest_updates_ts: string;
}

export interface RealtimeRoute {
  as_path: number[];
  collector: string;
  communities?: string[];
  peer_asn: number;
  prefix: string;
  timestamp?: string;
}

export interface RadarPfx2AsResponse {
  result: {
    meta: {
      data_time: string;
      query_time: string;
    };
    prefix_origins: PrefixOrigin[];
  };
  success: boolean;
}

export interface PrefixOrigin {
  origin: number;
  peer_count: number;
  prefix: string;
  rpki_validation: "valid" | "invalid" | "unknown";
}

// --- ASPA Verification Types ---

export type AspaVerificationResult = "Valid" | "Invalid" | "Unknown" | "Unverifiable";

export type PairRelationship = "Provider" | "Customer" | "Peer" | "NotFound";

export interface AspaCheckResult {
  asPath: number[];
  result: AspaVerificationResult;
  details: HopDetail[];
  direction: "Upstream Verification" | "Downstream Verification";
}

export interface HopDetail {
  from: number;
  to: number;
  relationship: PairRelationship;
  aspaFound: boolean;
}

// --- Prefix Lookup Types ---

export interface PrefixCheckResult {
  prefix: string;
  origins: PrefixOriginDetail[];
  routes: RouteAspaDetail[];
}

export interface PrefixOriginDetail {
  asn: number;
  asnName: string;
  country: string;
  rpkiStatus: string;
  peerCount: number;
}

export interface RouteAspaDetail {
  asPath: number[];
  peerAsn: number;
  collector: string;
  aspaCheck: AspaCheckResult;
}

// --- KV Cache Types ---

export interface CachedAspaData {
  objects: AspaObject[];
  asnInfo: Record<string, AsnInfo>;
  updatedAt: string;
  totalCount: number;
}

// --- Worker Env ---

export interface Env {
  ASPA_KV: KVNamespace;
  RADAR_API_BASE: string;
  CLOUDFLARE_API_TOKEN: string;
}
