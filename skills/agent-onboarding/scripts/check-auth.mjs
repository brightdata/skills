#!/usr/bin/env node
/**
 * check-auth.mjs - run first: probe the token, report the zones.
 *
 * The login success message is not proof, so this asks the API instead:
 *   GET /zone/get_active_zones  -> the key is real, and these zones exist
 *
 * Zones are matched by type, never by name. The name depends on how the
 * account was set up - login makes cli_unlocker and cli_browser, agent
 * registration makes agent_unlocker and agent_browser_api, the MCP server
 * makes mcp_unlocker and mcp_browser, and a zone made by hand carries whatever
 * name the person chose. The type is the same in every one of those cases, so
 * the type is what this checks, and the name it finds is what it reports.
 *
 * A zone belongs to a task, not to setup. Fetch needs an unblocker zone, the
 * browser needs a browser_api zone, search takes either an unblocker or a serp
 * zone, and Scraper API, Scraper Studio, datasets and billing need no zone at
 * all. So --for <skill> checks the key plus exactly the zone that skill needs,
 * and without --for only the key decides; missing zones are then listed as
 * information, never as a failure.
 *
 * Spends no credits: one read-only listing call, the same one `bdata zones`
 * makes.
 *
 * Usage:  node check-auth.mjs [--for <skill>] [--json]
 *         <skill> is the skill name from the route table in SKILL.md.
 * Auth:   BRIGHTDATA_API_KEY env var, or the CLI's credentials.json.
 * Exit:   0 ready   1 key works, but no zone for that skill
 *         2 key missing, malformed or rejected: log in
 *         3 could not check (network, server, unreadable answer): NOT a login problem
 *         4 bad usage (unknown skill)
 * --json: {ok, for, zones, found, missing, cli, error} - ok is the ready
 *         verdict, found maps each zone type to the zone name to use for it,
 *         missing lists the zone types the skill could use and none exist,
 *         cli lists the one-time steps that point the bdata CLI at a zone not
 *         named cli_*, error is null when ok.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const JSON_OUT = process.argv.includes('--json');
// The API key may only ever be sent to a Bright Data host.
const API = (() => {
    const base = process.env.BRIGHTDATA_API_BASE || 'https://api.brightdata.com';
    let host = ''; try { host = new URL(base).hostname; } catch {}
    if (!base.startsWith('https://') || !(host === 'brightdata.com' || host.endsWith('.brightdata.com'))) {
        console.error('Refusing BRIGHTDATA_API_BASE: only https brightdata.com hosts may receive the API key.');
        process.exit(1);
    }
    return base;
})();
/**
 * The zone-backed products, by zone type. `legacy` is only the name login
 * happens to use, kept for the create-one hint, the no-type fallback below and
 * the CLI wiring hint. Nothing here compares a name to decide whether a zone
 * is present.
 */
const PRODUCTS = {
  unblocker: { label: 'Web Unlocker', legacy: 'cli_unlocker', registration: 'agent_unlocker',
    // The CLI reaches for cli_unlocker unless told otherwise (login.ts sets it as
    // default_zone_unlocker even when it could not create it), so another name
    // has to be wired in once.
    wire: name => `bdata config set default_zone_unlocker ${name}` },
  serp: { label: 'SERP API', legacy: null, registration: 'agent_serp',
    wire: name => `pass --zone ${name} to bdata search` },
  browser_api: { label: 'Browser API', legacy: 'cli_browser', registration: 'agent_browser_api',
    // `bdata browser` has no config key: --zone, then BRIGHTDATA_BROWSER_ZONE, then cli_browser.
    wire: name => `pass --zone ${name} to bdata browser, or set the env var BRIGHTDATA_BROWSER_ZONE=${name}` },
};

/**
 * What each skill in the SKILL.md route table needs: any ONE of these zone
 * types, in order of preference, or none at all. Scraper API and Scraper
 * Studio run on the key alone (their calls take a dataset or collector id and
 * no zone), and so do datasets and billing. The MCP server and the SDKs make
 * and pick their own zones, so for them too the key is what decides.
 */
const SKILLS = {
  fetch: ['unblocker'],
  search: ['unblocker', 'serp'],
  browser: ['browser_api'],
  scrape: [],
  datasets: [],
  billing: [],
  'brightdata-cli': [],
  'brightdata-mcp': [],
  'brightdata-sdk': [],
};

const forAt = process.argv.indexOf('--for');
const FOR = forAt === -1 ? null : (process.argv[forAt + 1] ?? '');

const FIXES = [
  '  run:  bdata login               one browser approval (on headless: bdata login --device)',
  '  or:   set BRIGHTDATA_API_KEY    from the account settings page, for CI and containers',
  '  or:   no account yet?           register one by email: SKILL.md, "No account yet"',
];

/**
 * Read JSON tolerating a UTF-8 BOM (Windows editors add one). The BOM is
 * written as the \uFEFF escape because a literal one is invisible in a regex.
 */
const readJson = p => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

const C = process.stdout.isTTY && !JSON_OUT
  ? { ok: '\x1b[32m', bad: '\x1b[31m', dim: '\x1b[90m', off: '\x1b[0m' }
  : { ok: '', bad: '', dim: '', off: '' };

/**
 * A usable key is visible ASCII and nothing else, because that is all an HTTP
 * header value accepts. A key carrying a newline makes the Authorization header
 * invalid, and the HTTP stack quotes the offending header back in its error,
 * key included. Checking the shape here keeps that string from being built.
 */
const KEY_SHAPE = /^[\x21-\x7e]+$/;

/** Find the key, in the same order the CLI resolves it in. */
function findApiKey() {
  if (process.env.BRIGHTDATA_API_KEY) return process.env.BRIGHTDATA_API_KEY.trim();
  const paths = [
    process.env.APPDATA && join(process.env.APPDATA, 'brightdata-cli', 'credentials.json'),
    // The CLI builds the Windows directory from the user profile, not %APPDATA%,
    // so an unset or redirected APPDATA still lands on the real file here.
    join(homedir(), 'AppData', 'Roaming', 'brightdata-cli', 'credentials.json'),
    join(homedir(), 'Library', 'Application Support', 'brightdata-cli', 'credentials.json'),
    join(homedir(), '.config', 'brightdata-cli', 'credentials.json'),
  ].filter(Boolean);
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const k = readJson(p).api_key;
      if (k) return k.trim();
    } catch { /* corrupt file, try the next candidate */ }
  }
  return null;
}

/**
 * Read the API key without ever printing it.
 *
 * Returns { key, illegal }. `illegal` means a value was found and cannot be
 * used, which is a different fact from finding nothing: the fix is to repair
 * the credential, not to log in again. The value is never returned or quoted.
 */
function readApiKey() {
  const found = findApiKey();
  if (!found) return { key: null, illegal: false };
  if (!KEY_SHAPE.test(found)) return { key: null, illegal: true };
  return { key: found, illegal: false };
}

/**
 * Take the key out of any text on its way to stdout.
 *
 * An HTTP stack that rejects a malformed header quotes that header back in its
 * error, so a failure message can carry "Bearer <key>". The shape check above
 * keeps that header from being built, and this is the second lock on the same
 * door: nothing printed here is allowed to contain the key.
 */
const scrub = (text, key) => (key ? String(text).split(key).join('<redacted>') : String(text));

/**
 * Zones out of the listing, in either shape the API uses: a bare array, or
 * {zones: [...]}, each holding name strings or {name, type} objects. Returns
 * {name, type} pairs, with a null type for the bare-string shape.
 *
 * Returns null when the body is neither, which is a different fact from "no
 * zones" - an unreadable listing is no evidence that a zone is absent, so the
 * caller must not send the user back to login over it.
 */
const zoneList = body => {
  const list = Array.isArray(body) ? body : Array.isArray(body?.zones) ? body.zones : null;
  return list && list
    .map(z => (typeof z === 'string' ? { name: z, type: null } : { name: z?.name, type: z?.type ?? null }))
    .filter(z => z.name);
};

/**
 * The zone to use for one product, found by type.
 *
 * The fallback matters only for a listing that carries no types at all, an
 * unexpected shape rather than an empty account: matching the legacy name
 * there beats reporting a zone absent on no evidence. As soon as any entry has
 * a type, the listing is trusted and the type decides.
 */
const pickZone = (zones, type) => {
  const p = PRODUCTS[type];
  // Several zones can share a type. Prefer the one the CLI uses by default,
  // then the one agent registration made, so the name reported is the one the
  // account is most likely already wired to.
  const ofType = zones.filter(z => z.type === type);
  const byType = ofType.find(z => z.name === p.legacy)
    ?? ofType.find(z => z.name === p.registration)
    ?? ofType[0];
  if (byType) return byType;
  if (zones.some(z => z.type)) return null;
  return (p.legacy && zones.find(z => z.name === p.legacy)) ?? null;
};

/**
 * The whole check. Returns the report - never the key, and no field derived
 * from it, so the caller cannot print the secret by accident.
 */
async function check() {
  const { key, illegal } = readApiKey();
  if (illegal) {
    // Never quotes the value, not even a prefix.
    return { ok: false, zones: null, missing: null, error: 'bad_api_key', lines: [
      `${C.bad}x the API key cannot be used: the credential file or env var contains an illegal character${C.off}`,
      '  a key is printable ASCII with no spaces, so a stray newline or tab breaks it',
      '  the value is not shown here, on purpose. Set it again from a clean copy:',
      ...FIXES] };
  }
  if (!key) {
    return { ok: false, zones: null, missing: null, error: 'no_api_key', lines: [
      `${C.bad}x no API key found - this machine is not logged in${C.off}`, ...FIXES] };
  }

  let res;
  try {
    res = await fetch(`${API}/zone/get_active_zones`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    // Fetch failed, DNS died, the socket hung, or the timeout fired. The
    // message is scrubbed before it is printed or put in the --json error field.
    const reason = scrub(e?.message ?? String(e), key);
    return { ok: false, zones: null, missing: null, error: `network: ${reason}`, lines: [
      `${C.bad}x could not reach ${API}${C.off}`,
      `  ${reason} - the key was never checked, so this is not an auth failure`,
      '  fix the network, proxy or DNS and run this again'] };
  }

  if (res.status === 401) {
    return { ok: false, zones: null, missing: null, error: 'http_401', lines: [
      `${C.bad}x HTTP 401 - the key is invalid or revoked${C.off}`, ...FIXES] };
  }
  if (!res.ok) {
    return { ok: false, zones: null, missing: null, error: `http_${res.status}`, lines: [
      `${C.bad}x HTTP ${res.status} from ${API}/zone/get_active_zones${C.off}`,
      '  the key was not confirmed - check the status page and run this again'] };
  }

  let body;
  try {
    body = await res.json();
  } catch {
    return { ok: false, zones: null, missing: null, error: 'unparseable_body', lines: [
      `${C.bad}x the zone listing was not JSON - the key was not confirmed${C.off}`] };
  }

  const zones = zoneList(body);
  if (!zones) {
    return { ok: false, zones: null, missing: null, error: 'unrecognized_response_shape', lines: [
      `${C.bad}x the API answered, but the shape of the zone listing was not understood${C.off}`,
      '  the listing could not be read, so it says nothing about your zones or your key',
      '  run this again, and report it if it keeps happening'] };
  }

  // Every zone-backed product the account has, by type, whatever its name.
  const found = {};
  for (const type of Object.keys(PRODUCTS)) {
    const hit = pickZone(zones, type);
    if (hit) found[type] = hit.name;
  }
  const head = `${zones.length} active zone${zones.length === 1 ? '' : 's'}, the key works`;
  const label = type => `${type} (${PRODUCTS[type].label})`;

  // No skill named: the key is the whole verdict. Zones are listed so the
  // agent knows what is there, and an absent one is information, not failure.
  if (FOR === null) {
    const lines = [head, ...Object.keys(PRODUCTS).map(type => (found[type]
      ? `${C.dim}${PRODUCTS[type].label}: ${found[type]}${C.off}`
      : `${C.dim}${PRODUCTS[type].label}: none (used by ${Object.keys(SKILLS).filter(s => SKILLS[s].includes(type)).join(', ')} only)${C.off}`)),
      `${C.ok}logged in${C.off}   for one skill's zone as well, run again with --for <skill>`];
    return { ok: true, code: 0, zones: zones.length, found, missing: [], cli: [], error: null, lines };
  }

  const anyOf = SKILLS[FOR];
  if (!anyOf.length) {
    return { ok: true, code: 0, zones: zones.length, found, missing: [], cli: [], error: null, lines: [
      head, `${C.ok}ready for ${FOR}${C.off}: it runs on the key alone, no zone needed`] };
  }

  const use = anyOf.find(type => found[type]);
  if (!use) {
    const make = anyOf[0];
    const name = PRODUCTS[make].legacy;
    return { ok: false, code: 1, zones: zones.length, found, missing: anyOf, cli: [], error: 'missing_zone', lines: [
      head,
      `${C.bad}x not ready for ${FOR}: no zone of type ${anyOf.map(label).join(' or ')}${C.off}`,
      '  do NOT run bdata login again, it silently replaces the stored key',
      '  create one, it costs nothing:  POST https://api.brightdata.com/zone',
      `  body: {"zone":{"name":"${name}","type":"${make}"},"plan":{"type":"${make}"}}`,
      '  refused on permissions? a key from agent registration cannot create zones,',
      '  so make the zone in the Control Panel instead.   then run this check again'] };
  }

  // A zone the CLI will not find on its own: the account is ready, but the CLI
  // must be pointed at it once, or it looks for a cli_* name this account
  // does not have.
  const cli = found[use] === PRODUCTS[use].legacy ? [] : [PRODUCTS[use].wire(found[use])];
  return { ok: true, code: 0, zones: zones.length, found, missing: [], cli, error: null, lines: [
    head,
    `${C.dim}${PRODUCTS[use].label}: ${found[use]}${C.off}`,
    ...(cli.length ? ['  for the bdata CLI, point it at this zone once:', ...cli.map(c => `    ${c}`)] : []),
    `${C.ok}ready for ${FOR}${C.off}`] };
}

let report;
if (FOR !== null && !Object.hasOwn(SKILLS, FOR)) {
  report = { ok: false, code: 4, error: 'unknown_skill', lines: [
    `${C.bad}x --for needs a skill name from the route table: ${Object.keys(SKILLS).join(', ')}${C.off}`] };
} else {
  report = await check();
}

// Every path prints the same keys in the same order, so a caller can read
// `found` without first checking which failure it got.
const { lines, code, ...rest } = report;
const result = { ok: false, for: FOR, zones: null, found: null, missing: null, cli: null, error: null, ...rest };

if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
else for (const l of lines) console.log(l);

// process.exitCode, never process.exit(): exiting while a fetch socket is
// still closing crashes Node on Windows (libuv assertion, exit 0xC0000409).
// A failure that set no code of its own is a key failure (2) or a failed
// check (3), told apart by the error it carries.
const KEY_ERRORS = ['bad_api_key', 'no_api_key', 'http_401'];
process.exitCode = code ?? (result.ok ? 0 : KEY_ERRORS.includes(result.error) ? 2 : 3);
