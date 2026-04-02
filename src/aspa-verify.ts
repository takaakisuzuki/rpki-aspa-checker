import type {
  AspaVerificationResult,
  AspaCheckResult,
  HopDetail,
} from "./types";

/**
 * ASPA verification based on draft-ietf-sidrops-aspa-verification.
 *
 * aspaMap: customerASN -> Set of authorized provider ASNs
 *
 * The algorithm checks each hop in the AS path to determine if the
 * customer-to-provider relationship is authorized by an ASPA object.
 */

/**
 * Check if `providerAsn` is an authorized provider of `customerAsn`.
 */
function isAuthorizedProvider(
  aspaMap: Map<number, Set<number>>,
  customerAsn: number,
  providerAsn: number
): "Authorized" | "NotAuthorized" | "NoAspa" {
  const providers = aspaMap.get(customerAsn);
  if (!providers) return "NoAspa";
  if (providers.has(providerAsn)) return "Authorized";
  return "NotAuthorized";
}

/**
 * Remove prepends from an AS path (consecutive duplicate ASNs).
 */
function removePrepends(asPath: number[]): number[] {
  if (asPath.length === 0) return [];
  const result: number[] = [asPath[0]];
  for (let i = 1; i < asPath.length; i++) {
    if (asPath[i] !== asPath[i - 1]) {
      result.push(asPath[i]);
    }
  }
  return result;
}

/**
 * Upstream path verification (Section 6 of draft-ietf-sidrops-aspa-verification).
 *
 * For a route received from a customer or lateral peer, the AS path should
 * consist entirely of customer-to-provider (C2P) relationships.
 *
 * The AS path is ordered as: [neighbor, ..., origin].
 * Each hop from asPath[i] to asPath[i+1] should be a C2P relationship,
 * meaning asPath[i+1] should have asPath[i] as a provider, OR
 * asPath[i] should be a customer of asPath[i+1].
 *
 * Actually, in ASPA terms:
 * - For upstream verification, we check from the origin toward the verifier.
 * - Each AS in the path (except the last) should authorize the next AS as its provider.
 * - i.e., for each hop (asPath[i+1], asPath[i]): asPath[i+1] is customer, asPath[i] is provider.
 */
export function verifyUpstream(
  asPath: number[],
  aspaMap: Map<number, Set<number>>
): AspaCheckResult {
  const cleaned = removePrepends(asPath);
  const details: HopDetail[] = [];

  if (cleaned.length <= 1) {
    return {
      asPath: cleaned,
      result: "Valid",
      details: [],
      direction: "Upstream Verification",
    };
  }

  // AS path: [neighbor(0), hop1(1), ..., origin(n-1)]
  // For upstream: check each pair from origin toward neighbor.
  // For each i from n-2 down to 0:
  //   customer = cleaned[i+1], alleged_provider = cleaned[i]
  //   Check: does customer authorize alleged_provider?

  let hasUnknown = false;

  for (let i = cleaned.length - 2; i >= 0; i--) {
    const customer = cleaned[i + 1];
    const allegedProvider = cleaned[i];

    const authResult = isAuthorizedProvider(aspaMap, customer, allegedProvider);
    const detail: HopDetail = {
      from: customer,
      to: allegedProvider,
      relationship: "NotFound",
      aspaFound: authResult !== "NoAspa",
    };

    if (authResult === "Authorized") {
      detail.relationship = "Provider";
    } else if (authResult === "NotAuthorized") {
      detail.relationship = "Customer";
      details.push(detail);
      return {
        asPath: cleaned,
        result: "Invalid",
        details,
        direction: "Upstream Verification",
      };
    } else {
      // NoAspa
      hasUnknown = true;
    }

    details.push(detail);
  }

  return {
    asPath: cleaned,
    result: hasUnknown ? "Unknown" : "Valid",
    details,
    direction: "Upstream Verification",
  };
}

/**
 * Downstream path verification (Section 7 of draft-ietf-sidrops-aspa-verification).
 *
 * For a route received from a provider or RS, the AS path may have a
 * "up" segment (C2P) followed by a "down" segment (P2C).
 *
 * Algorithm:
 * 1. Scan from origin upward (right to left) — each hop should be C2P.
 * 2. Find the "apex" (turning point).
 * 3. From the apex, scan downward — each hop should be P2C.
 *
 * If any hop in the upward segment is "NotAuthorized", it's Invalid.
 * If any hop in the downward segment is "NotAuthorized", it's Invalid.
 * The apex is allowed to be a peer relationship.
 */
export function verifyDownstream(
  asPath: number[],
  aspaMap: Map<number, Set<number>>
): AspaCheckResult {
  const cleaned = removePrepends(asPath);
  const details: HopDetail[] = [];

  if (cleaned.length <= 1) {
    return {
      asPath: cleaned,
      result: "Valid",
      details: [],
      direction: "Downstream Verification",
    };
  }

  const n = cleaned.length;
  let hasUnknown = false;

  // Phase 1: Scan upward from origin (right side)
  // Find how far the C2P segment extends.
  let upEnd = n - 1; // start at origin

  for (let i = n - 2; i >= 0; i--) {
    const customer = cleaned[i + 1];
    const allegedProvider = cleaned[i];
    const authResult = isAuthorizedProvider(aspaMap, customer, allegedProvider);

    const detail: HopDetail = {
      from: customer,
      to: allegedProvider,
      relationship: "NotFound",
      aspaFound: authResult !== "NoAspa",
    };

    if (authResult === "Authorized") {
      detail.relationship = "Provider";
      details.push(detail);
      upEnd = i;
    } else if (authResult === "NoAspa") {
      hasUnknown = true;
      details.push(detail);
      upEnd = i;
    } else {
      // NotAuthorized — this is where the upward segment ends
      upEnd = i + 1;
      break;
    }
  }

  // Phase 2: Scan downward from neighbor (left side)
  let downEnd = 0;

  for (let i = 0; i < n - 1; i++) {
    const customer = cleaned[i];
    const allegedProvider = cleaned[i + 1];
    const authResult = isAuthorizedProvider(aspaMap, customer, allegedProvider);

    const detail: HopDetail = {
      from: customer,
      to: allegedProvider,
      relationship: "NotFound",
      aspaFound: authResult !== "NoAspa",
    };

    if (authResult === "Authorized") {
      detail.relationship = "Provider";
      details.push(detail);
      downEnd = i + 1;
    } else if (authResult === "NoAspa") {
      hasUnknown = true;
      details.push(detail);
      downEnd = i + 1;
    } else {
      downEnd = i;
      break;
    }
  }

  // Check if segments meet or overlap (valid valley-free path)
  if (upEnd <= downEnd + 1) {
    return {
      asPath: cleaned,
      result: hasUnknown ? "Unknown" : "Valid",
      details,
      direction: "Downstream Verification",
    };
  }

  // Gap exists — Invalid
  return {
    asPath: cleaned,
    result: "Invalid",
    details,
    direction: "Downstream Verification",
  };
}

/**
 * Convenience: run both upstream and downstream checks.
 */
export function verifyAsPath(
  asPath: number[],
  aspaMap: Map<number, Set<number>>
): { upstream: AspaCheckResult; downstream: AspaCheckResult } {
  return {
    upstream: verifyUpstream(asPath, aspaMap),
    downstream: verifyDownstream(asPath, aspaMap),
  };
}
