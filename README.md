# RPKI ASPA Checker

A web-based tool to verify AS path authorization using RPKI ASPA (Autonomous System Provider Authorization) objects. Built on [Cloudflare Workers](https://workers.cloudflare.com/) and powered by [Cloudflare Radar](https://radar.cloudflare.com/) data.

**Live Service:** [https://aspa-checker.win](https://aspa-checker.win)

## What is ASPA?

ASPA (Autonomous System Provider Authorization) is a mechanism defined in [draft-ietf-sidrops-aspa-verification](https://datatracker.ietf.org/doc/draft-ietf-sidrops-aspa-verification/) that allows ASes to cryptographically authorize their provider ASes in RPKI. This enables routers (and tools like this one) to verify that AS paths in BGP routes are consistent with the published ASPA objects.

The verification produces one of three results:

| Result | Meaning |
|--------|---------|
| **Valid** | All hops confirmed as authorized provider relationships |
| **Invalid** | ASPA object exists but the relationship is not authorized |
| **Unknown** | No ASPA object published, verification not possible |

## Features

- **AS Path Verification** — Check upstream and downstream path validity per the IETF draft
- **Prefix Lookup** — Find origin ASes for a prefix with RPKI status and per-route ASPA checks
- **ASN Name Resolution** — Displays operator names alongside AS numbers
- **Cron-based Caching** — ASPA snapshot cached in KV, refreshed every 30 minutes
- **Minimal Web UI** — Clean, white-background interface designed for network engineers

## Web UI

Visit [https://aspa-checker.win](https://aspa-checker.win) and use the two modes:

- **AS Path** — Enter space-separated ASNs (neighbor → origin). Example: `174 553`
- **Prefix** — Enter an IPv4 or IPv6 CIDR. Example: `74.119.150.0/24`

## API

### Check AS Path

Verify ASPA upstream and downstream for a given AS path.

```
GET /api/check-aspath?path={comma-separated ASNs}
```

**Example:**

```bash
curl 'https://aspa-checker.win/api/check-aspath?path=174,553'
```

**Response:**

```json
{
  "upstream": {
    "asPath": [174, 553],
    "result": "Valid",
    "details": [
      {
        "from": 553,
        "to": 174,
        "relationship": "Provider",
        "aspaFound": true
      }
    ],
    "direction": "Upstream Verification"
  },
  "downstream": {
    "asPath": [174, 553],
    "result": "Valid",
    "details": [...],
    "direction": "Downstream Verification"
  },
  "asnNames": {
    "174": "Cogent Communications, Inc.",
    "553": "Landeshochschulnetz Baden-Wuerttemberg"
  },
  "dataTime": "2026-04-02T04:00:00Z",
  "totalCount": 1534
}
```

### Check Prefix

Look up origin ASes and per-route ASPA verification for a prefix.

```
GET /api/check-prefix?prefix={CIDR}
```

**Example:**

```bash
curl 'https://aspa-checker.win/api/check-prefix?prefix=74.119.150.0/24'
```

**Response:**

```json
{
  "prefix": "74.119.150.0/24",
  "origins": [
    {
      "asn": 835,
      "asnName": "TNIC",
      "country": "US",
      "rpkiStatus": "Valid",
      "peerCount": 76
    }
  ],
  "routes": [
    {
      "asPath": [6939, 835],
      "peerAsn": 6939,
      "collector": "rrc00",
      "aspaCheck": {
        "asPath": [6939, 835],
        "result": "Valid",
        "details": [...],
        "direction": "Upstream Verification"
      }
    }
  ],
  "dataTime": "2026-04-02T04:00:00Z"
}
```

### ASPA Stats

Get the current ASPA snapshot statistics.

```bash
curl 'https://aspa-checker.win/api/aspa-stats'
```

## Self-Hosting

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- A [Cloudflare API token](https://dash.cloudflare.com/profile/api-tokens) with Radar read access

### Setup

1. **Clone the repository:**

```bash
git clone https://github.com/takaakisuzuki/rpki-aspa-checker.git
cd rpki-aspa-checker
```

2. **Install dependencies:**

```bash
npm install
```

3. **Create a KV namespace:**

```bash
npx wrangler kv namespace create ASPA_KV
```

Update `wrangler.toml` with the returned namespace ID.

4. **Set the API token secret:**

```bash
npx wrangler secret put CLOUDFLARE_API_TOKEN
```

5. **For local development**, create a `.dev.vars` file:

```
CLOUDFLARE_API_TOKEN=your-token-here
```

6. **Run locally:**

```bash
npm run dev
```

The app will be available at `http://localhost:8787`.

7. **Deploy:**

```bash
npm run deploy
```

### Custom Domain (Optional)

To use a custom domain, uncomment and update the `[[routes]]` section in `wrangler.toml`:

```toml
[[routes]]
pattern = "your-domain.example"
custom_domain = true
```

Set `workers_dev = false` and `preview_urls = false` to disable the default `workers.dev` subdomain.

## Project Structure

```
src/
├── index.ts          # Worker entry point, API routing, request handling
├── aspa-verify.ts    # ASPA upstream/downstream verification algorithm
├── radar-client.ts   # Cloudflare Radar API client, KV caching
├── types.ts          # TypeScript type definitions
└── ui.ts             # HTML/CSS/JS for the web UI
```

## How It Works

1. **ASPA Snapshot** — Fetches the global ASPA object list from Cloudflare Radar (`/bgp/rpki/aspa/snapshot`) and caches it in Workers KV for 30 minutes. A cron trigger refreshes the cache automatically.

2. **AS Path Verification** — Implements the upstream and downstream verification procedures from [draft-ietf-sidrops-aspa-verification](https://datatracker.ietf.org/doc/draft-ietf-sidrops-aspa-verification/):
   - **Upstream:** Checks each hop from origin toward neighbor — every customer must authorize the next-hop as a provider.
   - **Downstream:** Checks for a valid valley-free path (C2P ascending segment + P2C descending segment).

3. **Prefix Lookup** — Uses Radar's `pfx2as` and `realtime` route APIs to find origin ASes and observed AS paths, then runs ASPA verification on each route.

4. **ASN Names** — Resolved via Radar's `/entities/asns` endpoint for human-readable display.

## Data Source

All BGP and RPKI data is provided by [Cloudflare Radar](https://radar.cloudflare.com/).

## References

- [draft-ietf-sidrops-aspa-verification](https://datatracker.ietf.org/doc/draft-ietf-sidrops-aspa-verification/) — ASPA verification procedures
- [draft-ietf-sidrops-aspa-profile](https://datatracker.ietf.org/doc/draft-ietf-sidrops-aspa-profile/) — ASPA profile definition
- [Cloudflare Radar API](https://developers.cloudflare.com/radar/)

## License

MIT
