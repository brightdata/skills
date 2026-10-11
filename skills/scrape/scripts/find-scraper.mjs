#!/usr/bin/env node
/**
 * find-scraper.mjs - the whole catalogue miss path in one call.
 *
 * The bundled top-25 table covers the common asks. When it does not, the agent
 * has to search the live catalogue, pick a row, and find out what that scraper
 * takes and returns, door by door. That used to be three calls and two
 * response shapes nobody remembers. This script is that whole path:
 *
 *   node find-scraper.mjs instagram                       what is in the catalogue
 *   node find-scraper.mjs instagram.com                   the same, by domain
 *   node find-scraper.mjs gd_l1vikfch901nx3by4 --schema   what it takes and returns
 *
 * One endpoint answers nearly all of it. GET /datasets/v3/scrapers lists every
 * ready scraper with its input schema, output fields, sample input and
 * control-panel link, per door. It takes exactly two filters, dataset_id and
 * domain, and anything else is the whole catalogue: 4 to 5 MB, uncompressed,
 * with no way to ask "changed since last time". So an id is one small
 * filtered read, a domain one or two, and a name search reads the bulk
 * payload from a local cache that is refreshed once a day.
 *
 * The endpoint omits a few dozen scrapers that trigger fine. A gd_ id it does
 * not know is checked with one empty-body trigger, which the API rejects at
 * validation before any work starts, and the rejection names the inputs (see
 * probeSchema). That probe is the only call here that is not a plain read.
 *
 * Spends no credits.
 *
 * Usage:  node find-scraper.mjs <query> [--schema] [--variant <name>] [--sample] [--json] [--refresh]
 *         node find-scraper.mjs --help
 *         <query> is a gd_ dataset id, a domain, or part of a scraper name.
 * Auth:   BRIGHTDATA_API_KEY env var, or the CLI's credentials.json.
 *         The key is never printed, not even on failure.
 * Exit:   0 found, 1 nothing usable to return, 2 auth, network or API failure.
 *
 * Node 18 or newer, no dependencies.
 */

import { readFileSync, existsSync, writeFileSync, renameSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

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

/** An hour. Past any sane ceiling, and well inside what AbortSignal accepts. */
const MAX_TIMEOUT_MS = 3_600_000;

/**
 * Per-request ceiling. A server that accepts the socket and then says nothing
 * must not hang the caller, so every request carries it.
 * BRIGHTDATA_REQUEST_TIMEOUT_MS overrides the default.
 *
 * AbortSignal.timeout() takes a whole number of milliseconds in [0, 2^32-1] and
 * throws ERR_OUT_OF_RANGE on anything else, and that throw would happen inside
 * call(), where every exception is read as a transport failure. Anything that
 * is not a positive whole number is not used at all, and anything absurd is
 * clamped.
 *
 * Two defaults, because the calls are not alike: a filtered read or the probe
 * answers in about a second, and the bulk catalogue has been measured at 17 s
 * on a good day. One override replaces both, since a caller who sets it is
 * describing their network, not one call.
 */
const TIMEOUT_OVERRIDE_MS = (() => {
  const asked = Number(process.env.BRIGHTDATA_REQUEST_TIMEOUT_MS);
  if (!Number.isInteger(asked) || asked <= 0) return null;
  return Math.min(asked, MAX_TIMEOUT_MS);
})();
const REQUEST_TIMEOUT_MS = TIMEOUT_OVERRIDE_MS ?? 15_000;
const BULK_TIMEOUT_MS = TIMEOUT_OVERRIDE_MS ?? 60_000;

/** Human output stops after this many rows. --json always carries them all. */
const MAX_LISTED = 20;

/** How many output fields the human schema previews per door before it stops. */
const PREVIEW = 8;

/**
 * Where the bulk catalogue lives between runs, and for how long. A day is long
 * enough that a working session never pays the bulk read twice, and short
 * enough that a scraper added this week is found next time without anyone
 * remembering --refresh. A miss against the file refetches once anyway, so a
 * brand new scraper is found on the day it appears.
 *
 * The catalogue is the same for every account, so the file is not tied to the
 * key that fetched it, and nothing derived from the key is written into it.
 * A warm cache therefore serves a name search without touching the network,
 * which means without checking the key: a revoked key lists from the file and
 * only fails on the next live call. --refresh goes to the API and checks it.
 */
const CACHE_PATH = join(tmpdir(), 'brightdata-scrapers.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const USAGE = 'Usage: node find-scraper.mjs <query> [--schema] [--variant <name>] [--sample] [--json] [--refresh]';

/** What -h and --help print. Its first line is the one every error path shows. */
const USAGE_BLOCK = [
  USAGE,
  '  <query>      a gd_ dataset id, a domain (contains a dot), or part of a scraper name',
  '  --schema     inputs, outputs, sample input and the trigger line for the one matching scraper',
  '  --variant    one door only: collect_by_url, or a discovery suffix such as keyword or user_name',
  '               (default with --schema: print every variant the scraper has)',
  '  --sample     print sample_input as a paste-ready trigger body (with --schema)',
  '  --json       one JSON object on stdout instead of the human listing',
  '               shape: { ok, query, matches[{id,name,domain,category,scraper_type}], skipped_internal,',
  '                        schema{variants{<scraper_type>{required,optional,outputs,sample_input,link,trigger}},',
  '                               source: "endpoint" | "trigger_probe"}, error }',
  '  --refresh    ignore the local cache and refetch the catalogue (a cached listing does not',
  '               touch the network, so it does not check the key; --refresh does)',
  '  -h, --help   this block',
  '',
  '  --variant and --sample only mean anything against one schema, so either implies --schema',
  '',
  '  without --schema a name or domain query is a listing only. It does not say',
  '  whether a row can be triggered - that verdict, including "marketplace',
  '  dataset, not a scraper", comes from --schema. A gd_ id is one scraper',
  '  already, so its schema is printed with or without --schema, and an id the',
  '  catalogue omits is checked with one free trigger probe on the way.',
  '  exit codes: 0 = listed or ready to trigger, 1 = no result or not a',
  '  scraper, 2 = auth or network',
  '',
  '  example:  node find-scraper.mjs instagram',
  '  example:  node find-scraper.mjs instagram.com',
  '  example:  node find-scraper.mjs gd_l1vikfch901nx3by4 --schema',
  '  example:  node find-scraper.mjs gd_l1vikfch901nx3by4 --schema --variant user_name --sample',
  '',
  `  a name search reads the bulk catalogue from ${CACHE_PATH}, kept for 24 h;`,
  '  an id is one small filtered read, a domain one or two; neither touches the cache',
  '',
  '  in Windows PowerShell 5.1, pipe or redirect through cmd /c, or use',
  '  PowerShell 7: 5.1 adds a UTF-8 BOM and CRLF to redirected native output,',
  '  and strict JSON parsers reject that',
];

const FIXES = [
  '  run:  bdata login               one browser approval (on headless: bdata login --device)',
  '  or:   set BRIGHTDATA_API_KEY    from the account settings page, for CI and containers',
];

// ---------------------------------------------------------------- args

/**
 * Walk the args once. A multi-word name has to be quoted, so a second bare
 * word is a mistake worth naming rather than silently ignoring.
 *
 * Anything longer than one character that starts with a dash is a flag, single
 * dash included: "-json" is a typo for "--json", and reading it as the query
 * would search the catalogue for the word "-json" and report no match. A lone
 * "-" is left alone, because that is a query, not a flag.
 *
 * --variant takes a value, as the next argument or after an equals sign. A
 * next argument that is itself a flag is not the value: it stays in the walk
 * and the missing value is reported, so "--variant --json" still answers in
 * JSON.
 */
function parseArgs(argv) {
  let query = null, schema = false, variant = null, sample = false, json = false, refresh = false, help = false, bad = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--schema') schema = true;
    else if (a === '--sample') sample = true;
    else if (a === '--json') json = true;
    else if (a === '--refresh') refresh = true;
    else if (a === '-h' || a === '--help') help = true;
    else if (a === '--variant' || a.startsWith('--variant=')) {
      let v;
      if (a.startsWith('--variant=')) v = a.slice('--variant='.length);
      else if (argv[i + 1] !== undefined && !(argv[i + 1].startsWith('-') && argv[i + 1].length > 1)) v = argv[++i];
      if (!v) bad ??= '--variant needs a door name, such as collect_by_url or keyword.';
      else variant = v;
    }
    else if (a.startsWith('-') && a.length > 1) bad ??= `Unknown flag ${a}.`;
    else if (query === null) query = a;
    else bad ??= `Unexpected argument ${a}. Quote the query if it has spaces.`;
  }

  // Both flags only mean anything against one scraper's schema, so asking for
  // either is asking for --schema.
  if (variant !== null || sample) schema = true;

  return { query, schema, variant, sample, json, refresh, help, bad };
}

const ARGS = parseArgs(process.argv.slice(2));
const JSON_OUT = ARGS.json;

const C = process.stdout.isTTY && !JSON_OUT
  ? { ok: '\x1b[32m', bad: '\x1b[31m', dim: '\x1b[90m', off: '\x1b[0m' }
  : { ok: '', bad: '', dim: '', off: '' };

// ---------------------------------------------------------------- auth

/**
 * Read JSON tolerating a UTF-8 BOM (Windows editors add one). The BOM is
 * written as the \uFEFF escape because a literal one is invisible in a regex.
 */
const readJson = p => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

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

// ---------------------------------------------------------------- http

/**
 * Take the key out of any text on its way to stdout.
 *
 * Two surfaces need it. An HTTP stack that rejects a malformed header quotes
 * that header back in its error, so a failure message can carry "Bearer <key>";
 * and a proxy can echo request headers into its own error page, so a response
 * body can carry it too, and this script quotes that body back when it cannot
 * read it.
 *
 * Scrub before truncating: a slice taken first can leave a readable fragment.
 */
const scrub = (text, key) => (key ? String(text).split(key).join('<redacted>') : String(text));

/**
 * One authenticated request. This never throws.
 *
 * A transport failure comes back as status 0 with the reason in `netError`, so
 * every caller handles a dead network the same way it handles a bad status.
 * The body is parsed when it is JSON and kept as raw text when it is not,
 * because the schema probe needs the body of a 400 just as much as of a 200.
 *
 * The failure text is scrubbed before it is handed back, because this
 * function's return value is printed and put in the --json error field.
 * Nothing that leaves here is allowed to contain the key.
 *
 * The timeout is a parameter because the bulk catalogue read is the one call
 * that legitimately takes a while. Everything else uses the default.
 */
async function call(url, key, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let body = null, parsed = false;
    try { body = JSON.parse(text); parsed = true; } catch { /* not JSON, keep the text */ }
    return { status: res.status, ok: res.ok, body, parsed, text, netError: null };
  } catch (e) {
    // Fetch failed, DNS died, the socket hung, or the timeout fired.
    return { status: 0, ok: false, body: null, parsed: false, text: '', netError: scrub(e?.message ?? String(e), key) };
  }
}

// ---------------------------------------------------------------- report shape

/**
 * Every exit path returns exactly these keys, in this order, so a caller
 * reading --json can branch without checking whether a field exists.
 */
const blank = query => ({ ok: false, query, matches: [], skipped_internal: 0, schema: null, error: null });

/**
 * A call that answered nothing. Always exit 2: the query was never answered, so
 * the caller must not read this as "no such scraper".
 */
function apiFailure(query, res, what) {
  const base = blank(query);
  if (res.netError) {
    return { ...base, error: `network: ${res.netError}`, exit: 2, lines: [
      `${C.bad}x could not reach ${API}${C.off}`,
      // Names the call that died: this function is reached from the catalogue
      // reads and from the input probe.
      `  ${res.netError} - the call to ${what} never completed, so this is not an auth failure`,
      '  fix the network, proxy or DNS and run this again'] };
  }
  if (res.status === 401) {
    return { ...base, error: 'http_401', exit: 2, lines: [
      `${C.bad}x HTTP 401 - the key is invalid or revoked${C.off}`, ...FIXES] };
  }
  return { ...base, error: `http_${res.status}`, exit: 2, lines: [
    `${C.bad}x HTTP ${res.status} from ${what}${C.off}`,
    '  the call failed, so this says nothing about your query',
    '  check the status page and run this again'] };
}

// ---------------------------------------------------------------- catalogue

/**
 * Rows whose names mark them as internal, deprecated, or test entries.
 * Never offer one of these as a scraper.
 *
 * The bias is deliberate: prefer hiding a borderline row. Hiding one costs a
 * search that comes back shorter, and an explicit gd_ id still reaches
 * anything, internal rows included. Offering one costs a build against a
 * row that was never meant to be used.
 *
 * The "test" prefix rule is anchored and stops at a word boundary of its own,
 * so "test", "test-3" and "Test_old" are skipped while a real name such as
 * "Testimonials scraper" is not. The suffix rule is anchored at the other end,
 * so it catches "Walmart Products - test" and "Amazon products (test)" without
 * touching a name that merely contains the word.
 *
 * Today's scrapers endpoint carries no such row (0 of 1006), so this is inert
 * on the live payload. It stays because it costs nothing and the older
 * /datasets/list, which this script used to read, carried plenty.
 */
const INTERNAL_MARK = /\[internal[^\]]*\]|\[delete[^\]]*\]|\[deprecated\]|\(delete\)|^internal\b\s*-|\bremove me\b|\bdelete please\b/i;
const TEST_PREFIX = /^test([^a-z]|$)/i;
const TEST_SUFFIX = /[-(\[]\s*test\s*[)\]]?\s*$/i;
const isInternal = name => {
  const n = name.trim();
  return INTERNAL_MARK.test(n) || TEST_PREFIX.test(n) || TEST_SUFFIX.test(n);
};

/**
 * The list inside a catalogue answer. A bare array is what the API sends
 * today; the wrapper shapes are accepted so a future envelope does not read as
 * an empty catalogue. Null when the body is neither.
 */
const listOf = body => (Array.isArray(body) ? body
  : Array.isArray(body?.datasets) ? body.datasets
  : Array.isArray(body?.data) ? body.data
  : null);

const field = f => ({ name: f.name, type: typeof f.type === 'string' && f.type ? f.type : null });

/**
 * The doors of one row, keyed by scraper_type, each reduced to what this
 * script prints: the input split into required and optional, the outputs, the
 * sample input and the control-panel link. sample_output is dropped on the
 * floor here and nowhere later: it is empty for nine variants in ten, changes
 * from one call to the next, and would only ever mislead.
 *
 * scraper_type[] on the row is the API's own list of doors. Today it agrees
 * with the keys of scrapers{} on every row, and the keys are what is read,
 * because a door without a schema under it cannot be rendered anyway.
 */
function readVariants(r) {
  const doors = r?.scrapers && typeof r.scrapers === 'object' && !Array.isArray(r.scrapers) ? r.scrapers : {};
  const variants = {};
  for (const [type, v] of Object.entries(doors)) {
    if (!v || typeof v !== 'object') continue;
    const inputs = (Array.isArray(v.input_schema) ? v.input_schema : [])
      .filter(f => typeof f?.name === 'string' && f.name.trim() !== '');
    const outputs = (Array.isArray(v.output_fields) ? v.output_fields : [])
      .filter(f => typeof f?.name === 'string' && f.name.trim() !== '')
      .map(f => ({ ...field(f), description: typeof f.description === 'string' && f.description ? f.description : null }));
    variants[type] = {
      required: inputs.filter(f => f.required === true).map(field),
      optional: inputs.filter(f => f.required !== true).map(field),
      outputs,
      sample_input: Array.isArray(v.sample_input) ? v.sample_input : null,
      link: typeof v.link === 'string' && v.link ? v.link : null,
    };
  }
  return variants;
}

/**
 * Rows out of the listing, in the shape the rest of this script reads. Returns
 * null when the body is not a listing at all, which is a different fact from
 * "no rows" and must not be reported as "no such scraper".
 *
 * The same reader serves the filtered reads, the bulk read and the cache file,
 * so the three can never drift apart.
 */
function catalogueRows(body) {
  const list = listOf(body);
  if (!list) return null;

  const rows = list
    .map(r => {
      const variants = readVariants(r);
      return {
        id: String(r?.id ?? ''),
        name: String(r?.name ?? ''),
        domain: String(r?.domain ?? ''),
        category: String(r?.category ?? ''),
        description: String(r?.description ?? ''),
        scraper_type: Object.keys(variants),
        variants,
      };
    })
    .filter(r => r.id);

  // Rows arrived and not one of them carried an id, so the id key moved or was
  // renamed. That is an unrecognized shape, not an empty catalogue.
  if (list.length > 0 && rows.length === 0) return null;

  return rows;
}

/** A row as --json lists it: the five facts that pick a scraper, and nothing heavier. */
const brief = r => ({ id: r.id, name: r.name, domain: r.domain, category: r.category, scraper_type: r.scraper_type });

/** A gd_ query is an id lookup. A query with a dot in it is tried as a domain first. */
const looksLikeId = q => q.toLowerCase().startsWith('gd_');
const looksLikeDomain = q => q.includes('.');

/**
 * A catalogue answer as rows, or as the failure report to return instead.
 * The id filter, the domain filter and the bulk read all come through here.
 */
function readListing(query, res, what) {
  if (res.netError || !res.ok) return { failure: apiFailure(query, res, what) };
  if (!res.parsed) {
    return { failure: { ...blank(query), error: 'unparseable_body', exit: 2, lines: [
      `${C.bad}x the catalogue listing was not JSON, so nothing was searched${C.off}`,
      '  run this again, and report it if it keeps happening'] } };
  }
  const rows = catalogueRows(res.body);
  if (!rows) {
    return { failure: { ...blank(query), error: 'unrecognized_response_shape', exit: 2, lines: [
      `${C.bad}x the API answered, but the shape of the catalogue was not understood${C.off}`,
      '  the listing could not be read, so it says nothing about your query',
      '  run this again, and report it if it keeps happening'] } };
  }
  return { rows };
}

/** One filtered read: ?dataset_id=... or ?domain=... Those two are the only filters the endpoint takes. */
async function fetchFiltered(query, param, value, key) {
  const what = `${API}/datasets/v3/scrapers`;
  return readListing(query, await call(`${what}?${param}=${encodeURIComponent(value)}`, key), what);
}

// ---------------------------------------------------------------- bulk cache

/**
 * The bulk payload, minus the two fields that are dead weight on disk.
 * sample_output is empty on nine variants in ten, changes from call to call,
 * and is never printed. use_cases is marketing prose for the marketplace page.
 * Together they are an eighth of the payload.
 */
const slimForCache = list => list.map(({ use_cases, scrapers, ...rest }) => ({
  ...rest,
  scrapers: Object.fromEntries(Object.entries(scrapers ?? {}).map(([type, { sample_output, ...keep }]) => [type, keep])),
}));

/**
 * Rows from the cache file, or null. Null covers every way the file can be
 * useless: absent, unreadable, not JSON, owned by someone else, older than
 * the TTL, dated in the future by a clock that moved, or in a shape
 * catalogueRows does not recognise. A miss costs one bulk read; a false hit
 * costs a wrong answer.
 */
function readCache() {
  try {
    // Linux /tmp is shared between users, and a file someone else put there is not trusted.
    if (process.getuid && statSync(CACHE_PATH).uid !== process.getuid()) return null;
    const c = readJson(CACHE_PATH);
    const age = Date.now() - Date.parse(c?.fetched_at);
    if (!(age >= 0 && age < CACHE_TTL_MS)) return null;
    return catalogueRows(c.rows);
  } catch {
    return null;
  }
}

/**
 * Write the cache, or say why it could not be. The file is written under a
 * temporary name and renamed into place, so a reader that arrives mid-write
 * sees the old file or the new one and never half of each. A failure here
 * is a note, not an error: the run already has its answer, and the only cost
 * is that the next run fetches again.
 */
function writeCache(list, key) {
  const tmp = `${CACHE_PATH}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify({ fetched_at: new Date().toISOString(), rows: slimForCache(list) }));
    renameSync(tmp, CACHE_PATH);
    return null;
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* it was never written, or the rename took it */ }
    return `the catalogue could not be cached at ${CACHE_PATH} (${scrub(e?.message ?? String(e), key)}), so the next name search fetches it again`;
  }
}

/**
 * The whole catalogue from the API, written to the cache on the way through.
 * Returns { rows, fromCache: false, note } or { failure }.
 */
async function fetchCatalogue(query, key) {
  const what = `${API}/datasets/v3/scrapers`;
  const res = await call(what, key, {}, BULK_TIMEOUT_MS);
  const got = readListing(query, res, what);
  if (got.failure) return got;
  return { rows: got.rows, fromCache: false, note: writeCache(listOf(res.body), key) };
}

async function loadCatalogue(query, key, refresh) {
  if (!refresh) {
    const rows = readCache();
    if (rows) return { rows, fromCache: true, note: null };
  }
  return fetchCatalogue(query, key);
}

// ---------------------------------------------------------------- schema

/**
 * The trigger for one door, as the line an agent pastes. collect_by_url is the
 * default door, so it is the bare trigger URL. A discovery door is selected on
 * the same URL with type=discover_new and discover_by=<the scraper_type minus
 * its discover_by_ prefix>, which is how the control panel's own curl for that
 * door reads. Anything without the prefix is taken as the default door, since
 * there is no other door to name.
 */
const DISCOVER_PREFIX = 'discover_by_';
function triggerLine(id, type) {
  const base = `POST ${API}/datasets/v3/trigger?dataset_id=${encodeURIComponent(id)}`;
  if (!type.startsWith(DISCOVER_PREFIX)) return base;
  return `${base}&type=discover_new&discover_by=${encodeURIComponent(type.slice(DISCOVER_PREFIX.length))}`;
}

/**
 * The door --variant names, or null. The full scraper_type is accepted, and so
 * is the bare discovery suffix, so "keyword" finds discover_by_keyword. The
 * match ignores case because the catalogue's own spelling is all lower case
 * and a hand-typed one may not be.
 */
function pickVariant(asked, variants) {
  const want = asked.trim().toLowerCase();
  return Object.keys(variants).find(t => t.toLowerCase() === want || t.toLowerCase() === DISCOVER_PREFIX + want) ?? null;
}

/**
 * What the scraper takes, when the catalogue does not say. This is the
 * empty-body probe:
 *
 *   POST /datasets/v3/trigger?dataset_id={id}
 *   Content-Type: application/json
 *   [{}]
 *
 * The call is free for every scraper the catalogue lists: the API validates
 * the record before it starts any work, an empty record fails validation
 * wherever a field is required, and every listed scraper requires at least
 * one on its default door. The rejection is the point: it is the only other
 * place the API states a scraper's input contract.
 *
 * It is sent in one situation only: the query was a gd_ id, the catalogue
 * endpoint answered [] for it, and no type or discover_by is on the URL. A
 * few discovery doors take no required field at all, and an empty record on
 * one of those would pass validation and start a job, so the probe never
 * names a door. If a job starts anyway, that is reported with the snapshot id
 * so it can be cancelled.
 *
 * The rejection body looks like this:
 *   {"type":"validation","errors":[["url","Required field"]],"line":"{\"country\":\"\"}"}
 *
 * - `errors` is an array of [field, message] pairs. A message matching
 *   "required" names a required input field.
 * - `line` is the record the API echoes back, as a JSON string, with every
 *   optional field present and blank. Its keys are the optional inputs. It
 *   says nothing about types, so none is claimed.
 *
 * Returns exactly one of:
 *   { fail }          the call itself failed, and nothing was learned
 *   { started }       the probe queued a real job
 *   { marketplace }   the row cannot collect at all: a purchasable dataset
 *   { unknown }       the trigger does not know the id either
 *   { unrecognized }  a validation rejection whose wording could not be read
 *   { required, optional }   the input contract
 */
async function probeSchema(id, key) {
  const res = await call(`${API}/datasets/v3/trigger?dataset_id=${encodeURIComponent(id)}`, key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{}]),
  });

  // The rejection arrives as a 4xx, so a bad status is expected here. A dead
  // network, a refused key (401 or 403), a throttle or a server error are the
  // failures: those say nothing about the id.
  if (res.netError || res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500) return { fail: res };

  const body = res.parsed ? res.body : null;

  // The validation shape is checked before the marketplace sniff below, and by
  // its own key rather than by any text inside it. The sniff matches a phrase
  // anywhere in the raw body, so a validation message that merely quoted that
  // phrase would otherwise be read as "this is not a scraper".
  if (body?.type === 'validation') return readValidation(body);

  if (body?.snapshot_id) {
    // The empty-body probe is rejected at validation. If a job started anyway,
    // name it so the operator can cancel it.
    return { started: String(body.snapshot_id) };
  }

  // Marketplace rows are purchasable datasets, not scrapers. They have no
  // input contract at all, so there is nothing further to ask them.
  //
  // This check runs before the unknown-id one: the live API refuses a
  // marketplace row with status 400, content-type text/html and the bare body
  // "This dataset does not support collection", which is not JSON. Matching
  // the raw text also covers the JSON form of the same refusal.
  if (/does not support collection/i.test(res.text)) return { marketplace: true };

  // Anything else is the trigger not knowing the id: today that is a 404 with
  // the HTML text "dataset does not exist". The body is quoted back, so it goes
  // through scrub() first: a proxy that echoes request headers into its own
  // error page would otherwise put the Authorization header on stdout.
  const errText = typeof body?.error === 'string' ? body.error : '';
  return { unknown: scrub(errText || res.text, key).slice(0, 120) };
}

/** One errors[] value as text. String({}) is "[object Object]", which is not. */
const asText = v => (typeof v === 'string' ? v : JSON.stringify(v) ?? String(v));

/** One errors[] entry, rendered for a human whatever shape it turned out to be. */
const pairText = e => (Array.isArray(e) ? `${asText(e[0])}: ${asText(e[1])}` : asText(e));

/**
 * Read the input contract out of a validation rejection.
 *
 * A required field is found by matching "required" in the message prose, which
 * is a guess about the API's wording. When pairs arrive and none of them reads
 * as a required field, the conclusion is "the wording moved", not "this scraper
 * needs no input".
 */
function readValidation(body) {
  const errors = Array.isArray(body.errors) ? body.errors : [];

  // A Set because two rules can reject the same field, arriving as one pair
  // each: a required list of ["url", "url"] reads as two separate inputs. The
  // field has to be a string - String() on anything else yields
  // "[object Object]", which is not a field name.
  const requiredNames = [...new Set(errors
    .filter(e => Array.isArray(e)
      && typeof e[0] === 'string' && e[0].trim() !== ''
      && /required/i.test(String(e[1] ?? '')))
    .map(e => e[0]))];

  if (errors.length > 0 && requiredNames.length === 0) {
    return { unrecognized: errors.map(pairText) };
  }

  // `line` is a JSON string in every answer seen so far. Accept a plain object
  // too, so a shape change costs the optional list rather than the whole run.
  // An array is rejected because its keys are "0", "1", ... and those are
  // indices, not input names.
  let line = null;
  try {
    const parsed = typeof body.line === 'string' ? JSON.parse(body.line) : body.line;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) line = parsed;
  } catch { /* keep the required list, which is the part that matters */ }

  // The probe says nothing about types, so none is claimed: every field is
  // carried with type null and printed as its bare name.
  const required = requiredNames.map(name => ({ name, type: null }));
  const optional = Object.keys(line ?? {})
    .filter(name => !requiredNames.includes(name))
    .map(name => ({ name, type: null }));

  return { required, optional };
}

/**
 * A gd_ id the catalogue does not list, judged by what the probe said. The
 * terminal verdicts come back as { failure } with their own exit code; a
 * readable rejection comes back as { row }, shaped like a catalogue row with
 * one door, so the rest of the run cannot tell the two sources apart.
 */
function probeVerdict(query, id, probe) {
  const head = `${id}  ${C.dim}not in the catalogue listing, found by the trigger probe${C.off}`;

  if (probe.fail) return { failure: apiFailure(query, probe.fail, `${API}/datasets/v3/trigger`) };

  if (probe.started) {
    return { failure: { ...blank(query), error: 'probe_started_job', exit: 2, lines: [
      head,
      `${C.bad}x the empty-record probe started a real job instead of being rejected${C.off}`,
      `  cancel snapshot ${probe.started} so it does not collect and bill`,
      '  report this: the probe is supposed to fail validation before any work starts'] } };
  }

  if (probe.marketplace) {
    return { failure: { ...blank(query), error: 'marketplace_dataset', exit: 1, lines: [
      head,
      `${C.bad}x marketplace dataset, not a scraper${C.off}`,
      '  it holds data that was already collected, so it takes no input and cannot be triggered',
      '  buy the download instead: see the dataset marketplace reference'] } };
  }

  if (probe.unknown !== undefined) {
    return { failure: { ...blank(query), error: 'no_match', exit: 1, lines: [
      `${C.bad}x no match for "${query}"${C.off}`,
      '  the catalogue does not list that id and the trigger does not know it either',
      `  ${C.dim}${probe.unknown || '(empty answer)'}${C.off}`,
      '  check the id, or search by name or domain instead:',
      '  node find-scraper.mjs <part of the name>'] } };
  }

  // The rejection was a validation rejection and its fields could not be read
  // as an input contract. The raw pairs are all there is, so the raw pairs are
  // what the reader gets.
  if (probe.unrecognized) {
    return { failure: { ...blank(query), error: 'unrecognized_validation_wording', exit: 1, lines: [
      head,
      `${C.bad}x the probe was rejected, but not in a wording this script reads as an input contract${C.off}`,
      ...probe.unrecognized.map(p => `  ${p}`),
      '  those are the fields the API rejected an empty record over. Which of them are required is not stated here',
      '  do not read this as "no required inputs"'] } };
  }

  // The one door the probe can speak for. Outputs are not stated anywhere for
  // a scraper the catalogue omits, so the list is empty rather than guessed.
  return { row: {
    id, name: null, domain: null, category: null, description: '',
    scraper_type: ['collect_by_url'],
    variants: { collect_by_url: { required: probe.required, optional: probe.optional, outputs: [], sample_input: null, link: null } },
  } };
}

const fieldText = f => (f.type ? `${f.name}:${f.type}` : f.name);
const fieldList = fs => (fs.length ? fs.map(fieldText).join(', ') : '(none)');

/**
 * The schema report: every door asked for, rendered for a human and shaped for
 * --json. The two are built side by side from the same variant so they cannot
 * disagree. `head` is whatever the caller already printed about the row.
 */
function schemaReport(result, row, variants, source, head) {
  const lines = [...head];
  const out = {};

  for (const [type, v] of Object.entries(variants)) {
    const trigger = triggerLine(row.id, type);
    out[type] = { required: v.required, optional: v.optional, outputs: v.outputs, sample_input: v.sample_input, link: v.link, trigger };

    lines.push('', `[${type}]`);
    lines.push(`  required: ${fieldList(v.required)}`);
    lines.push(`  optional: ${fieldList(v.optional)}`);

    if (source === 'trigger_probe') {
      lines.push(`  ${C.dim}outputs: not stated, the catalogue does not list this scraper${C.off}`);
    } else {
      lines.push(`  outputs: ${v.outputs.length} field${v.outputs.length === 1 ? '' : 's'}`);
      for (const f of v.outputs.slice(0, PREVIEW)) {
        lines.push(`${C.dim}    ${fieldText(f)}${f.description ? `  ${f.description}` : ''}${C.off}`);
      }
      // Both counts and the flag that lifts the limit go on the line, so a
      // truncated preview says how much was cut and how to see the rest.
      if (v.outputs.length > PREVIEW) {
        lines.push(`${C.dim}    ${v.outputs.length} fields, showing ${PREVIEW}. Add --json for all of them.${C.off}`);
      }
    }

    lines.push(`  trigger: ${trigger}`);
    if (v.link) lines.push(`  panel:   ${v.link}`);

    if (ARGS.sample) {
      if (Array.isArray(v.sample_input) && v.sample_input.length > 0) {
        const n = v.sample_input.length;
        lines.push(`  sample input${n > 1 ? ` (${n} records, and a trigger bills per record)` : ''}:`);
        for (const l of JSON.stringify(v.sample_input, null, 2).split('\n')) lines.push(`    ${l}`);
      } else {
        lines.push(`  ${C.dim}sample input: none listed${C.off}`);
      }
    }
  }

  lines.push('', `${C.ok}ready to trigger${C.off}`);
  return { ...result, ok: true, schema: { variants: out, source }, exit: 0, lines };
}

// ---------------------------------------------------------------- main

async function resolve() {
  const { variant: wantVariant, refresh, help, bad } = ARGS;

  // One trimmed value for the whole run: ids are pasted with a leading space
  // more often than not.
  const query = (ARGS.query ?? '').trim();

  // ---- arguments

  // Help wins over every other argument, including bad ones, and exits 0.
  if (help) {
    return { ...blank(query), ok: true, exit: 0, lines: USAGE_BLOCK };
  }
  if (bad) {
    return { ...blank(query), error: 'bad_argument', exit: 1, lines: [
      `${C.bad}x ${bad}${C.off}`, USAGE] };
  }
  if (!query) {
    return { ...blank(query), error: 'no_query', exit: 1, lines: [
      `${C.bad}x give me something to look for: a gd_ id, a domain, or part of a scraper name${C.off}`,
      USAGE,
      '  example:  node find-scraper.mjs instagram',
      '  example:  node find-scraper.mjs instagram.com',
      '  example:  node find-scraper.mjs gd_l1vikfch901nx3by4 --schema'] };
  }

  // ---- credentials

  const { key, illegal } = readApiKey();
  if (illegal) {
    // Never quotes the value, not even a prefix.
    return { ...blank(query), error: 'bad_api_key', exit: 2, lines: [
      `${C.bad}x the API key cannot be used: the credential file or env var contains an illegal character${C.off}`,
      '  a key is printable ASCII with no spaces, so a stray newline or tab breaks it',
      '  the value is not shown here, on purpose. Set it again from a clean copy:',
      ...FIXES] };
  }
  if (!key) {
    return { ...blank(query), error: 'no_api_key', exit: 2, lines: [
      `${C.bad}x no API key found - this machine is not logged in${C.off}`, ...FIXES] };
  }

  // ---- lookup, by the shape of the query
  //
  // An id is one small filtered read and a domain one or two. A name search is
  // the bulk payload, from disk when it is fresh. The probe is only ever sent
  // on the id path, after the endpoint said [], and never with a door named.

  const isId = looksLikeId(query);
  let matches, skipped = 0, source = 'endpoint';
  const notes = [];

  // A query pasted as a whole URL is tried by its host, which is what the
  // domain filter and the row's domain field both carry.
  let want = query.toLowerCase();
  if (/^https?:\/\//i.test(query)) { try { want = new URL(query).hostname.toLowerCase(); } catch { /* not a URL after all, search as typed */ } }

  if (isId) {
    const id = want;
    const got = await fetchFiltered(query, 'dataset_id', id, key);
    if (got.failure) return got.failure;

    // The filter is trusted, and then checked: an endpoint that one day drops
    // the parameter would answer with the whole catalogue, and 1006 rows must
    // not read as an ambiguous id.
    matches = got.rows.filter(r => r.id.toLowerCase() === id);

    if (matches.length === 0) {
      const verdict = probeVerdict(query, id, await probeSchema(id, key));
      if (verdict.failure) return verdict.failure;
      matches = [verdict.row];
      source = 'trigger_probe';
    }
  } else if (looksLikeDomain(want)) {
    // The filter is exact and case-sensitive, and the catalogue spells 274 of
    // its 1006 rows with a leading "www." and the rest bare, with no rule for
    // which: ?domain=snapchat.com answers [] while www.snapchat.com has two
    // rows, and ?domain=www.instagram.com answers [] while the bare form has
    // four. So the bare form goes first, then "www." plus the bare form, and
    // the walk stops at the first answer with rows. The typed spelling is
    // always one of those two, so what the agent pasted does not change the
    // count: a row the catalogue spells bare costs one call whatever the
    // paste, and a www. row costs two. A domain that matches neither spelling
    // is a miss: it does not fall through to the bulk name search.
    const bare = want.replace(/^www\./, '');
    let hits = [];
    for (const domain of [bare, `www.${bare}`]) {
      const got = await fetchFiltered(query, 'domain', domain, key);
      if (got.failure) return got.failure;
      if (got.rows.length > 0) { hits = got.rows; break; }
    }

    matches = hits.filter(r => !isInternal(r.name));
    skipped = hits.length - matches.length;
  } else {
    // A name search: a case-insensitive substring over the four text fields
    // a row carries. The description is the marketplace blurb and is empty
    // on most rows, so it widens the net without ever narrowing it.
    const byText = rows => rows.filter(r =>
      [r.name, r.domain, r.category, r.description].some(t => t.toLowerCase().includes(want)));

    let got = await loadCatalogue(query, key, refresh);
    if (got.failure) return got.failure;
    let hits = byText(got.rows);

    // A miss against the file is not yet a miss against the catalogue: the
    // scraper may have been added since the file was written. One refetch
    // settles it. A refused key on that refetch is an auth failure and exits 2
    // like any other. A dead network or a server error leaves the day-old
    // answer standing, said out loud so it is not mistaken for certainty.
    if (hits.length === 0 && got.fromCache) {
      const fresh = await fetchCatalogue(query, key);
      if (fresh.failure) {
        if (fresh.failure.error === 'http_401') return fresh.failure;
        notes.push(`the catalogue could not be refetched to confirm this (${fresh.failure.error}), so the answer is from a cached copy up to 24 h old`);
      } else {
        got = fresh;
        hits = byText(got.rows);
      }
    }
    if (got.note) notes.push(got.note);

    matches = hits.filter(r => !isInternal(r.name));
    skipped = hits.length - matches.length;
  }

  const result = { ...blank(query), matches: matches.map(brief), skipped_internal: skipped };
  const dim = s => `${C.dim}${s}${C.off}`;

  if (matches.length === 0) {
    const lines = [`${C.bad}x no match for "${query}"${C.off}`];
    if (looksLikeDomain(want)) {
      lines.push('  no scraper lists that domain, with or without a leading www.',
        '  search by name instead, for example the part before the dot:  node find-scraper.mjs <part of the name>');
    } else {
      lines.push('  try a shorter or more general word, for example a platform name on its own');
    }
    if (skipped > 0) {
      lines.push(skipped === 1
        ? '  1 internal row matched and was skipped, and it is not usable'
        : `  ${skipped} internal rows matched and were skipped, none of them usable`);
    }
    // Points at the gate table, not at gate 2. Gate 2 carries three further
    // conditions this script never checked (shared layout, a repeat run, or
    // data that only appears after browser actions), so "no ready scraper"
    // rules out gate 1 and nothing else.
    lines.push('  nothing in the catalogue fits? Then no ready scraper covers this. Go back to the gate table in SKILL.md to pick the next path.');
    lines.push(...notes.map(dim));
    return { ...result, error: 'no_match', exit: 1, lines };
  }

  // ---- listing, when no schema was asked for

  const rowLine = r => (r.name === null
    ? `${r.id}  ${dim('not in the catalogue listing, found by the trigger probe')}`
    : `${r.id}  ${r.name}${dim(`  ${[r.domain, r.category].filter(Boolean).join(', ')}  ${r.scraper_type.join(' ')}`)}`);

  const listing = () => {
    const lines = [`${matches.length} match${matches.length === 1 ? '' : 'es'} for "${query}"`];
    for (const m of matches.slice(0, MAX_LISTED)) lines.push(rowLine(m));
    if (matches.length > MAX_LISTED) {
      lines.push(dim(`and ${matches.length - MAX_LISTED} more, refine the query`));
    }
    if (skipped > 0) {
      lines.push(dim(`skipped ${skipped} internal row${skipped === 1 ? '' : 's'}`));
    }
    return lines;
  };

  // A gd_ id is one scraper already, and the one read that found it carried
  // its schema, so the schema is printed with or without --schema: a listing
  // of one row says nothing the caller did not type, and a second run would
  // repeat the read, or worse, the probe. The ambiguity gate below never
  // applies to an id, so nothing is lost by skipping the listing.
  const wantSchema = ARGS.schema || isId;

  if (!wantSchema) {
    const lines = listing();
    if (matches.length === 1) {
      lines.push(dim('run again with --schema to see what it takes and returns'));
    }
    lines.push(...notes.map(dim));
    return { ...result, ok: true, exit: 0, lines };
  }

  // ---- --schema needs exactly one scraper

  if (matches.length > 1) {
    return { ...result, error: 'ambiguous', exit: 1, lines: [
      ...listing(),
      `${C.bad}x --schema needs exactly one scraper, and "${query}" matched ${matches.length}${C.off}`,
      '  run it again with the id of the one you want, or a longer part of the name',
      ...notes.map(dim)] };
  }

  const row = matches[0];
  const head = [rowLine(row)];
  if (row.name !== null && isInternal(row.name)) {
    head.push(`${C.bad}!  that name looks like an internal row, so prefer another scraper if you can${C.off}`);
  }
  if (source === 'trigger_probe') {
    head.push(dim('the catalogue does not list this scraper, so this is read from the trigger\'s rejection of an empty record:'),
      dim('the required fields are certain; the types and the outputs are not stated'));
  }
  head.push(...notes.map(dim));

  // ---- the doors

  const types = Object.keys(row.variants);
  if (types.length === 0) {
    return { ...result, error: 'no_schema', exit: 1, lines: [
      ...head,
      `${C.bad}x the catalogue lists this scraper with no door under it, so its inputs are not stated${C.off}`,
      '  open the control panel page for the scraper, or report this if it is a scraper you expected to run'] };
  }

  let variants = row.variants;
  if (wantVariant !== null) {
    const type = pickVariant(wantVariant, row.variants);
    if (!type) {
      return { ...result, error: 'unknown_variant', exit: 1, lines: [
        ...head,
        `${C.bad}x no door called "${wantVariant}" on this scraper${C.off}`,
        `  it has: ${types.join(', ')}`,
        '  pass the full scraper_type, or the bare suffix of a discovery door, such as keyword for discover_by_keyword'] };
    }
    variants = { [type]: row.variants[type] };
  } else if (types.length > 1) {
    head.push(`${types.length} variants: ${types.join(', ')}${dim('  (--variant <name> for one of them)')}`);
  }

  return schemaReport(result, row, variants, source, head);
}

const { lines, exit, ...result } = await resolve();

// --help wins over --json: there is no JSON rendering of a usage block, and the
// blank report would be indistinguishable from a run that found nothing.
if (JSON_OUT && !ARGS.help) console.log(JSON.stringify(result, null, 2));
else for (const l of lines) console.log(l);

// process.exitCode, never process.exit(): exiting while a fetch socket is
// still closing crashes Node on Windows (libuv assertion, exit 0xC0000409).
process.exitCode = exit;
