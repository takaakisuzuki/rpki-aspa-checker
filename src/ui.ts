export function renderHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RPKI ASPA Checker</title>
  <meta name="description" content="Verify AS path authorization using RPKI ASPA objects. Check upstream and downstream path validity per draft-ietf-sidrops-aspa-verification. Powered by Cloudflare Radar.">
  <meta property="og:title" content="RPKI ASPA Checker">
  <meta property="og:description" content="Verify AS path authorization using RPKI ASPA objects. Check upstream and downstream path validity per draft-ietf-sidrops-aspa-verification.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://aspa-checker.win">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="RPKI ASPA Checker">
  <meta name="twitter:description" content="Verify AS path authorization using RPKI ASPA objects. Powered by Cloudflare Radar.">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%23111'/><text x='50' y='68' font-size='52' font-family='monospace' font-weight='bold' text-anchor='middle' fill='%23fff'>A</text><circle cx='78' cy='22' r='10' fill='%23fff' opacity='.8'/></svg>">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #fff; color: #111; min-height: 100vh;
      padding: 3rem 1.5rem 2rem;
    }
    .wrap { max-width: 720px; margin: 0 auto; }
    h1 { font-size: 1.25rem; font-weight: 600; letter-spacing: -0.01em; }
    h1 span { color: #888; font-weight: 400; }
    .sub { color: #999; font-size: 0.8rem; margin-top: 0.2rem; }
    .modes { display: flex; gap: 0; margin: 2rem 0 1.25rem; border-bottom: 1px solid #e5e5e5; }
    .mode {
      padding: 0.5rem 1rem; background: none; border: none; border-bottom: 2px solid transparent;
      font-size: 0.85rem; color: #999; cursor: pointer; font-weight: 500;
    }
    .mode.on { color: #111; border-bottom-color: #111; }
    .panel { display: none; }
    .panel.on { display: block; }
    .search-row { display: flex; gap: 0.5rem; }
    .search-row input {
      flex: 1; padding: 0.55rem 0.75rem; border: 1px solid #ddd; border-radius: 4px;
      font-size: 0.9rem; font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
      color: #111; outline: none;
    }
    .search-row input:focus { border-color: #111; }
    .search-row input::placeholder { color: #bbb; }
    .search-row button {
      padding: 0.55rem 1.25rem; background: #111; color: #fff; border: none;
      border-radius: 4px; font-size: 0.85rem; font-weight: 500; cursor: pointer;
      white-space: nowrap;
    }
    .search-row button:hover { background: #333; }
    .search-row button:disabled { background: #ccc; cursor: not-allowed; }
    .hint { font-size: 0.75rem; color: #aaa; margin-top: 0.35rem; }
    .err { color: #c00; font-size: 0.8rem; margin-top: 0.5rem; display: none; }
    .results { margin-top: 1.5rem; }
    .mono { font-family: 'SF Mono', 'Consolas', 'Monaco', monospace; font-size: 0.85rem; }
    .section { margin-top: 1.25rem; }
    .section-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #999; margin-bottom: 0.5rem; }
    .path-display { color: #555; margin-bottom: 0.5rem; }
    .path-display .asn { color: #111; }
    .path-display .asn-name { color: #999; font-size: 0.75rem; margin-left: 2px; }
    .verdict { display: inline-flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
    .verdict .label { font-size: 0.85rem; font-weight: 600; color: #333; }
    details.hop-details { margin-top: 0.25rem; }
    details.hop-details summary { font-size: 0.7rem; color: #aaa; cursor: pointer; user-select: none; margin-bottom: 0.35rem; }
    details.hop-details summary:hover { color: #666; }
    .tag {
      display: inline-block; padding: 0.15rem 0.5rem; border-radius: 3px;
      font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
    }
    .tag-valid { background: #e6f7ed; color: #0a7c3e; }
    .tag-invalid { background: #fde8e8; color: #b91c1c; }
    .tag-unknown { background: #fef3cd; color: #92600a; }
    .tag-unverifiable { background: #f3f4f6; color: #6b7280; }
    table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
    th { text-align: left; font-weight: 500; color: #999; padding: 0.35rem 0; border-bottom: 1px solid #eee; }
    td { padding: 0.35rem 0; border-bottom: 1px solid #f5f5f5; }
    td.mono-cell { font-family: 'SF Mono', 'Consolas', 'Monaco', monospace; }
    tr:last-child td { border-bottom: none; }
    .status-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 5px; }
    .dot-ok { background: #22c55e; }
    .dot-bad { background: #ef4444; }
    .dot-na { background: #d1d5db; }
    .origin-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem 0; font-size: 0.85rem; border-bottom: 1px solid #f5f5f5; }
    .origin-row:last-child { border-bottom: none; }
    .rpki { font-size: 0.7rem; padding: 0.1rem 0.35rem; border-radius: 2px; font-weight: 600; }
    .rpki-valid { background: #e6f7ed; color: #0a7c3e; }
    .rpki-invalid { background: #fde8e8; color: #b91c1c; }
    .rpki-unknown { background: #f3f4f6; color: #6b7280; }
    .route-block { padding: 0.75rem 0; border-bottom: 1px solid #f0f0f0; }
    .route-block:last-child { border-bottom: none; }
    .route-meta { font-size: 0.75rem; color: #999; margin-bottom: 0.35rem; }
    .meta-line { font-size: 0.7rem; color: #bbb; margin-top: 1rem; }
    footer { margin-top: 3rem; font-size: 0.7rem; color: #ccc; }
    footer a { color: #999; text-decoration: none; }
    footer a:hover { color: #111; }
    .eg { color: #666; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
    .eg:hover { color: #111; }
    hr { border: none; border-top: 1px solid #f0f0f0; margin: 1.5rem 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1><a href="/" id="title-link" style="color:inherit;text-decoration:none">RPKI ASPA Checker</a></h1>
    <div class="sub">draft-ietf-sidrops-aspa-verification</div>

    <div class="modes">
      <button class="mode on" data-m="aspath">AS Path</button>
      <button class="mode" data-m="prefix">Prefix</button>
    </div>

    <div id="p-aspath" class="panel on">
      <div class="search-row">
        <input type="text" id="in-aspath" placeholder="64511 174 2914 13335" spellcheck="false" maxlength="512" autocomplete="off" />
        <button id="btn-aspath">Check</button>
      </div>
      <div class="hint">neighbor &rarr; origin, space-separated &middot; e.g. <a href="#" class="eg" data-target="in-aspath" data-val="174 553">174 553</a></div>
      <div class="err" id="err-aspath"></div>
      <div class="results" id="res-aspath"></div>
    </div>

    <div id="p-prefix" class="panel">
      <div class="search-row">
        <input type="text" id="in-prefix" placeholder="1.1.1.0/24" spellcheck="false" maxlength="128" autocomplete="off" />
        <button id="btn-prefix">Lookup</button>
      </div>
      <div class="hint">IPv4 or IPv6 CIDR &middot; e.g. <a href="#" class="eg" data-target="in-prefix" data-val="74.119.150.0/24">74.119.150.0/24</a></div>
      <div class="err" id="err-prefix"></div>
      <div class="results" id="res-prefix"></div>
    </div>

    <footer>
      Data source: <a href="https://radar.cloudflare.com" target="_blank">Cloudflare Radar</a> &middot;
      <a href="https://datatracker.ietf.org/doc/draft-ietf-sidrops-aspa-verification/" target="_blank">draft-ietf-sidrops-aspa-verification</a>
    </footer>
  </div>

  <script>
    // --- Security: HTML escape ---
    function esc(s) {
      if (s == null) return '';
      const d = document.createElement('div');
      d.textContent = String(s);
      return d.innerHTML;
    }

    // Strict allowlists for tag classes (prevent class injection)
    const VALID_RESULTS = new Set(['valid','invalid','unknown','unverifiable']);
    const VALID_RELATIONS = new Set(['Provider','Customer','NotFound','Lateral']);

    document.querySelectorAll('.mode').forEach(m => {
      m.addEventListener('click', () => {
        document.querySelectorAll('.mode').forEach(x => x.classList.remove('on'));
        document.querySelectorAll('.panel').forEach(x => x.classList.remove('on'));
        m.classList.add('on');
        document.getElementById('p-' + m.dataset.m).classList.add('on');
      });
    });

    function tagCls(r) {
      const k = String(r).toLowerCase().replace(/[^a-z]/g, '');
      return VALID_RESULTS.has(k) ? 'tag-' + k : 'tag-unknown';
    }

    function hopTable(details, names) {
      if (!details || !details.length) return '';
      let h = '<table><tr><th>From</th><th>To</th><th>Relation</th><th>ASPA</th></tr>';
      for (const d of details) {
        const rel = VALID_RELATIONS.has(d.relationship) ? d.relationship : 'NotFound';
        const dc = d.aspaFound ? (rel === 'Provider' ? 'dot-ok' : 'dot-bad') : 'dot-na';
        const fn = names && names[d.from] ? ' <span style="color:#999;font-size:0.75rem">' + esc(names[d.from]) + '</span>' : '';
        const tn = names && names[d.to] ? ' <span style="color:#999;font-size:0.75rem">' + esc(names[d.to]) + '</span>' : '';
        h += '<tr><td class="mono-cell">AS' + esc(d.from) + fn + '</td><td class="mono-cell">AS' + esc(d.to) + tn + '</td>';
        h += '<td><span class="status-dot ' + dc + '"></span>' + esc(rel) + '</td>';
        h += '<td>' + (d.aspaFound ? 'Yes' : '\u2014') + '</td></tr>';
      }
      return h + '</table>';
    }

    function renderCheck(c, names) {
      let h = '<div class="verdict"><span class="label">' + esc(c.direction) + '</span><span class="tag ' + tagCls(c.result) + '">' + esc(c.result) + '</span></div>';
      h += '<div class="path-display mono">' + c.asPath.map(a => {
        const n = names && names[a] ? '<span class="asn-name">' + esc(names[a]) + '</span>' : '';
        return '<span class="asn">' + esc(a) + '</span>' + n;
      }).join(' &rarr; ') + '</div>';
      const table = hopTable(c.details, names);
      if (table) {
        h += '<details class="hop-details"><summary>Hop-by-hop details (' + c.details.length + ' hops)</summary>' + table + '</details>';
      }
      return h;
    }

    document.getElementById('btn-aspath').addEventListener('click', async () => {
      const raw = document.getElementById('in-aspath').value.trim();
      const err = document.getElementById('err-aspath');
      const res = document.getElementById('res-aspath');
      err.style.display = 'none'; res.innerHTML = '';
      if (!raw) { err.textContent = 'Enter an AS path.'; err.style.display = 'block'; return; }
      // Strip non-digit/space/comma characters for safety
      const input = raw.replace(/[^0-9\\s,]/gi, '');
      const asns = input.replace(/,/g, ' ').split(/\\s+/).filter(Boolean).map(s => parseInt(s, 10));
      if (!asns.length || asns.some(isNaN)) { err.textContent = 'Invalid input. Use space-separated ASNs.'; err.style.display = 'block'; return; }
      if (asns.length > 64) { err.textContent = 'Too many ASNs (max 64).'; err.style.display = 'block'; return; }
      const btn = document.getElementById('btn-aspath');
      btn.disabled = true; btn.textContent = '...';
      try {
        const r = await fetch('/api/check-aspath?path=' + encodeURIComponent(asns.join(',')));
        if (!r.ok) { const t = await r.json().catch(() => ({})); throw new Error(t.error || 'Request failed'); }
        const d = await r.json();
        const names = d.asnNames || {};
        let h = '<div class="section">' + renderCheck(d.upstream, names) + '</div><hr/>';
        h += '<div class="section">' + renderCheck(d.downstream, names) + '</div>';
        h += '<div class="meta-line">' + esc(d.dataTime || '') + ' &middot; ' + esc(d.totalCount || 0) + ' ASPA objects</div>';
        res.innerHTML = h;
      } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
      finally { btn.disabled = false; btn.textContent = 'Check'; }
    });

    document.getElementById('btn-prefix').addEventListener('click', async () => {
      const raw = document.getElementById('in-prefix').value.trim();
      const err = document.getElementById('err-prefix');
      const res = document.getElementById('res-prefix');
      err.style.display = 'none'; res.innerHTML = '';
      if (!raw) { err.textContent = 'Enter a prefix.'; err.style.display = 'block'; return; }
      // Strip anything not valid in a CIDR prefix
      const input = raw.replace(/[^0-9a-fA-F.:\/]/g, '');
      if (!input.includes('/')) { err.textContent = 'Use CIDR notation (e.g. 1.1.1.0/24).'; err.style.display = 'block'; return; }
      const btn = document.getElementById('btn-prefix');
      btn.disabled = true; btn.textContent = '...';
      try {
        const r = await fetch('/api/check-prefix?prefix=' + encodeURIComponent(input));
        if (!r.ok) { const t = await r.json().catch(() => ({})); throw new Error(t.error || 'Request failed'); }
        const d = await r.json();
        const RPKI_VALID = new Set(['valid','invalid','unknown']);
        let h = '<div class="section"><div class="section-label">Origin</div>';
        if (d.origins && d.origins.length) {
          for (const o of d.origins) {
            const rpkiKey = RPKI_VALID.has(String(o.rpkiStatus).toLowerCase()) ? o.rpkiStatus.toLowerCase() : 'unknown';
            h += '<div class="origin-row mono"><strong>AS' + esc(o.asn) + '</strong> <span style="color:#666">' + esc(o.asnName) + '</span>';
            h += ' <span style="color:#aaa">' + esc(o.country) + '</span>';
            h += ' <span class="rpki rpki-' + rpkiKey + '">' + esc(o.rpkiStatus) + '</span>';
            h += ' <span style="color:#bbb;font-size:0.75rem">' + esc(o.peerCount) + ' peers</span></div>';
          }
        } else { h += '<div style="color:#aaa;font-size:0.8rem">No origins found.</div>'; }
        h += '</div>';

        if (d.routes && d.routes.length) {
          h += '<hr/><div class="section"><div class="section-label">Routes (' + esc(d.routes.length) + ')</div>';
          for (const rt of d.routes) {
            h += '<div class="route-block">';
            h += '<div class="route-meta">peer AS' + esc(rt.peerAsn) + ' &middot; ' + esc(rt.collector) + '</div>';
            h += renderCheck(rt.aspaCheck);
            h += '</div>';
          }
          h += '</div>';
        }
        h += '<div class="meta-line">' + esc(d.dataTime || '') + '</div>';
        res.innerHTML = h;
      } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
      finally { btn.disabled = false; btn.textContent = 'Lookup'; }
    });

    document.getElementById('in-aspath').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-aspath').click(); });
    document.getElementById('in-prefix').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-prefix').click(); });

    // Example links: fill input and auto-submit
    document.querySelectorAll('.eg').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        const el = document.getElementById(a.dataset.target);
        el.value = a.dataset.val;
        el.focus();
        el.closest('.panel').querySelector('button').click();
      });
    });
  </script>
</body>
</html>`;
}
