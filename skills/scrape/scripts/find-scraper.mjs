#!/usr/bin/env node
/**
 * find-scraper.mjs - the whole catalogue miss path in one call.
 *
 * The bundled top-25 table covers the common asks. When it does not, the agent
 * has to search the live catalogue, pick a row, and find out what that scraper
 * takes and returns. That is three separate calls and two response shapes
 * nobody remembers. This script is that whole path:
 *
 *   node find-scraper.mjs instagram              what is in the catalogue
 *   node find-scraper.mjs gd_l1vikfch901nx3by4 --schema   what it takes and returns
 *
 * Spends no credits. Every call here is either a free read or a trigger that
 * the API rejects at validation before any work starts (see probeSchema).
 *
 * Usage:  node find-scraper.mjs <query> [--schema] [--json]
 *         node find-scraper.mjs --help
 *         <query> is part of a scraper name, or a gd_ dataset id.
 * Auth:   BRIGHTDATA_API_KEY env var, or the CLI's credentials.json.
 *         The key is never printed, not even on failure.
 * Exit:   0 found, 1 nothing usable to return, 2 auth, network or API failure.
 *
 * Node 18 or newer, no dependencies.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const API = process.env.BRIGHTDATA_API_BASE || 'https://api.brightdata.com';

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
 */
const REQUEST_TIMEOUT_MS = (() => {
  const asked = Number(process.env.BRIGHTDATA_REQUEST_TIMEOUT_MS);
  if (!Number.isInteger(asked) || asked <= 0) return 15_000;
  return Math.min(asked, MAX_TIMEOUT_MS);
})();

/** Human output stops after this many rows. --json always carries them all. */
const MAX_LISTED = 20;

/** How many output fields the human listing previews before it stops. */
const SAMPLE = 8;

const USAGE = 'Usage: node find-scraper.mjs <query> [--schema] [--json]';

/** What -h and --help print. Its first line is the one every error path shows. */
const USAGE_BLOCK = [
  USAGE,
  '  <query>      part of a scraper name, or a gd_ dataset id',
  '  --schema     what the one matching scraper takes and returns',
  '  --json       one JSON object on stdout instead of the human listing',
  '               shape: { ok, query, matches[{id,name}], skipped_internal,',
  '                        schema{required, optional, outputs}, error }',
  '  -h, --help   this block',
  '',
  '  example:  node find-scraper.mjs instagram',
  '  example:  node find-scraper.mjs gd_l1vikfch901nx3by4 --schema',
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
 */
function parseArgs(argv) {
  let query = null, schema = false, json = false, help = false, bad = null;

  for (const a of argv) {
    if (a === '--schema') schema = true;
    else if (a === '--json') json = true;
    else if (a === '-h' || a === '--help') help = true;
    else if (a.startsWith('-') && a.length > 1) bad ??= `Unknown flag ${a}.`;
    else if (query === null) query = a;
    else bad ??= `Unexpected argument ${a}. Quote the query if it has spaces.`;
  }

  return { query, schema, json, help, bad };
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
 */
async function call(url, key, init = {}) {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
      // read and from the input probe.
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
 * Internal junk the live catalogue carries. Never offer one of these as a
 * scraper: they are staging rows, and several are scheduled for deletion.
 *
 * The forms the account carries are "[Internal]" and "[Internal use]",
 * "INTERNAL -", "[DEPRECATED]", "(delete)" and "[delete]", "delete please",
 * "Remove me!", and a family of roughly ninety "<Brand> Products - test" rows.
 *
 * The bias is deliberate: prefer hiding a borderline row. Hiding one costs a
 * search that comes back shorter, and an explicit gd_ id still reaches
 * anything, internal rows included. Offering one costs a build against a
 * staging row that is scheduled for deletion.
 *
 * The "test" prefix rule is anchored and stops at a word boundary of its own,
 * so "test", "test-3" and "Test_old" are skipped while a real name such as
 * "Testimonials scraper" is not. The suffix rule is anchored at the other end,
 * so it catches "Walmart Products - test" and "Amazon products (test)" without
 * touching a name that merely contains the word.
 */
const INTERNAL_MARK = /\[internal[^\]]*\]|\[delete[^\]]*\]|\[deprecated\]|\(delete\)|^internal\b\s*-|\bremove me\b|\bdelete please\b/i;
const TEST_PREFIX = /^test([^a-z]|$)/i;
const TEST_SUFFIX = /[-(\[]\s*test\s*[)\]]?\s*$/i;
const isInternal = name => {
  const n = name.trim();
  return INTERNAL_MARK.test(n) || TEST_PREFIX.test(n) || TEST_SUFFIX.test(n);
};

/**
 * Rows out of the listing. A bare array is what the API sends today; the
 * wrapper shapes are accepted so a future envelope does not read as an empty
 * catalogue. Returns null when the body is neither, which is a different fact
 * from "no rows" and must not be reported as "no such scraper".
 */
function catalogueRows(body) {
  const list = Array.isArray(body) ? body
    : Array.isArray(body?.datasets) ? body.datasets
    : Array.isArray(body?.data) ? body.data
    : null;
  if (!list) return null;

  const rows = list
    .map(r => ({ id: String(r?.id ?? ''), name: String(r?.name ?? '') }))
    .filter(r => r.id);

  // Rows arrived and not one of them carried an id, so the id key moved or was
  // renamed. That is an unrecognized shape, not an empty catalogue.
  if (list.length > 0 && rows.length === 0) return null;

  return rows;
}

/** A gd_ query is an id lookup. Anything else is a name search. */
const looksLikeId = q => q.toLowerCase().startsWith('gd_');

// ---------------------------------------------------------------- schema

/**
 * What the scraper returns. GET /datasets/{id}/metadata is a free read that
 * lists every output field with its type.
 *
 * Not every scraper has this endpoint. A 404 here is a fact about that one
 * dataset, not a failure of the run, so the caller reports it and carries on
 * with whatever the input probe found.
 *
 * Nothing here fails the run. Every answer this endpoint can give comes back as
 * a note, a dead socket and a refused key included. The input contract is the
 * half that makes a trigger possible, and it comes from a different call.
 *
 * The notes are worded apart because they are different news. A 404 is
 * permanent: this scraper has no metadata endpoint and running again will not
 * produce one. A 5xx or a 429 is temporary, so that note says the list is
 * unavailable for now and to run again.
 *
 * `outputs` is null on every one of these paths, never {}. An empty object has
 * to keep meaning "this scraper returns no fields at all".
 */
async function fetchOutputs(id, key) {
  const res = await call(`${API}/datasets/${encodeURIComponent(id)}/metadata`, key);

  if (res.netError) {
    return { outputs: null, note: `the output list could not be read (network: ${res.netError}), so the output fields are not listed` };
  }
  if (res.status === 401) {
    // The caller only prints this note when the input probe succeeded, so the
    // same key was accepted one call earlier.
    return { outputs: null, note: 'the metadata endpoint refused the key (HTTP 401), so the output fields are not listed - the same key was accepted by the input probe' };
  }
  if (res.status === 404) return { outputs: null, note: 'this scraper has no metadata endpoint, so its output fields are not listed' };
  if (res.status === 429 || res.status >= 500) {
    return { outputs: null, note: `the output list is temporarily unavailable (HTTP ${res.status}), so run this again to get it` };
  }
  if (!res.ok) return { outputs: null, note: `the metadata endpoint answered HTTP ${res.status}, so the output fields are not listed` };
  if (!res.parsed) return { outputs: null, note: 'the metadata endpoint did not answer with JSON, so the output fields are not listed' };

  const fields = res.body?.fields;
  if (!fields) {
    return { outputs: null, note: 'the metadata answer carried no field list, so the output fields are not listed' };
  }
  // typeof [] === 'object', so an array has to be rejected here: Object.entries()
  // below would turn its indices into field names such as "0". An invented field
  // name is worse than a missing list, so this is a note too.
  if (typeof fields !== 'object' || Array.isArray(fields)) {
    return { outputs: null, note: 'the metadata field list was not in a shape this script understands, so the output fields are not listed' };
  }

  // Inactive fields are declared but never populated, so they are not output.
  const outputs = {};
  for (const [name, v] of Object.entries(fields)) {
    if (v?.active !== false) outputs[name] = String(v?.type ?? 'unknown');
  }
  return { outputs, note: null };
}

/**
 * What the scraper takes. This is the empty-body probe:
 *
 *   POST /datasets/v3/trigger?dataset_id={id}
 *   Content-Type: application/json
 *   [{}]
 *
 * The call is free. The API validates the record before it starts any work,
 * and an empty record never passes validation, so the request is rejected and
 * nothing is queued, collected or billed. The rejection is the point: it is
 * the only place the API states a scraper's input contract.
 *
 * The rejection body looks like this:
 *   {"type":"validation","errors":[["url","Required field"]],"line":"{\"country\":\"\"}"}
 *
 * - `errors` is an array of [field, message] pairs. A message matching
 *   "required" names a required input field.
 * - `line` is the record the API echoes back, as a JSON string, with every
 *   optional field present and empty. Its keys are the optional inputs.
 *
 * Two answers are not validation rejections and are handled separately:
 * a marketplace row refuses collection entirely, and a snapshot_id means the
 * probe started a real job.
 *
 * Returns exactly one of:
 *   { fail }          the call itself failed, and nothing was learned
 *   { started }       the probe queued a real job
 *   { marketplace }   the row cannot collect at all
 *   { unreadable }    the answer was not in any shape this script knows
 *   { unrecognized }  a validation rejection whose wording could not be read
 *   { required, optional }   the input contract
 */
async function probeSchema(id, key) {
  const res = await call(`${API}/datasets/v3/trigger?dataset_id=${encodeURIComponent(id)}`, key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{}]),
  });

  // The rejection arrives as a 4xx, so a bad status is expected here and only
  // a dead network or a refused key counts as a failure.
  if (res.netError || res.status === 401) return { fail: res };

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
  // This check runs before the not-JSON one: the live API refuses a marketplace
  // row with status 400, content-type text/html and the bare body "This dataset
  // does not support collection", which is not JSON. Matching the raw text also
  // covers the JSON form of the same refusal.
  if (/does not support collection/i.test(res.text)) return { marketplace: true };

  // The body is quoted back, so it goes through scrub() first: a proxy that
  // echoes request headers into its own error page would otherwise put the
  // Authorization header on stdout.
  const errText = typeof body?.error === 'string' ? body.error : '';
  return { unreadable: scrub(errText || res.text, key).slice(0, 120) };
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
  const required = [...new Set(errors
    .filter(e => Array.isArray(e)
      && typeof e[0] === 'string' && e[0].trim() !== ''
      && /required/i.test(String(e[1] ?? '')))
    .map(e => e[0]))];

  if (errors.length > 0 && required.length === 0) {
    return { unrecognized: errors.map(pairText) };
  }

  // `line` is a JSON string in every answer seen so far. Accept a plain object
  // too, so a shape change costs the optional list rather than the whole run.
  // An array is rejected for the same reason the metadata field list is: its
  // keys are "0", "1", ... and those are indices, not input names.
  let optional = [];
  try {
    const line = typeof body.line === 'string' ? JSON.parse(body.line) : body.line;
    if (line && typeof line === 'object' && !Array.isArray(line)) optional = Object.keys(line);
  } catch { /* keep the required list, which is the part that matters */ }

  return { required, optional: optional.filter(f => !required.includes(f)) };
}

// ---------------------------------------------------------------- main

async function resolve() {
  const { schema: wantSchema, help, bad } = ARGS;

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
      `${C.bad}x give me something to look for: part of a scraper name, or a gd_ id${C.off}`,
      USAGE,
      '  example:  node find-scraper.mjs instagram',
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

  // ---- the catalogue, one free read

  const res = await call(`${API}/datasets/list`, key);
  if (res.netError || !res.ok) return apiFailure(query, res, `${API}/datasets/list`);
  if (!res.parsed) {
    return { ...blank(query), error: 'unparseable_body', exit: 2, lines: [
      `${C.bad}x the catalogue listing was not JSON, so nothing was searched${C.off}`,
      '  run this again, and report it if it keeps happening'] };
  }

  const rows = catalogueRows(res.body);
  if (!rows) {
    return { ...blank(query), error: 'unrecognized_response_shape', exit: 2, lines: [
      `${C.bad}x the API answered, but the shape of the catalogue was not understood${C.off}`,
      '  the listing could not be read, so it says nothing about your query',
      '  run this again, and report it if it keeps happening'] };
  }

  // ---- match

  const isId = looksLikeId(query);
  const want = query.toLowerCase();
  let matches, skipped = 0;

  if (isId) {
    // An explicit id is an explicit choice, so an internal row is returned
    // rather than filtered away. The caller is told what it looks like.
    matches = rows.filter(r => r.id.toLowerCase() === want);
  } else {
    const hits = rows.filter(r => r.name.toLowerCase().includes(want));
    matches = hits.filter(r => !isInternal(r.name));
    skipped = hits.length - matches.length;
  }

  const result = { ...blank(query), matches, skipped_internal: skipped };

  if (matches.length === 0) {
    const lines = [`${C.bad}x no match for "${query}"${C.off}`];
    if (isId) {
      lines.push('  that id is not in this account\'s catalogue. Check it, or search by name instead:',
        '  node find-scraper.mjs <part of the name>');
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
    return { ...result, error: 'no_match', exit: 1, lines };
  }

  // ---- listing, when no schema was asked for

  const listing = () => {
    const lines = [`${matches.length} match${matches.length === 1 ? '' : 'es'} for "${query}"`];
    for (const m of matches.slice(0, MAX_LISTED)) lines.push(`${m.id}  ${m.name}`);
    if (matches.length > MAX_LISTED) {
      lines.push(`${C.dim}and ${matches.length - MAX_LISTED} more, refine the query${C.off}`);
    }
    if (skipped > 0) {
      lines.push(`${C.dim}skipped ${skipped} internal row${skipped === 1 ? '' : 's'}${C.off}`);
    }
    return lines;
  };

  if (!wantSchema) {
    const lines = listing();
    if (matches.length === 1) {
      lines.push(`${C.dim}run again with --schema to see what it takes and returns${C.off}`);
    }
    return { ...result, ok: true, exit: 0, lines };
  }

  // ---- --schema needs exactly one scraper

  if (matches.length > 1) {
    return { ...result, error: 'ambiguous', exit: 1, lines: [
      ...listing(),
      `${C.bad}x --schema needs exactly one scraper, and "${query}" matched ${matches.length}${C.off}`,
      '  run it again with the id of the one you want, or a longer part of the name'] };
  }

  const { id, name } = matches[0];
  const lines = [`${id}  ${name}`];
  if (isInternal(name)) {
    lines.push(`${C.bad}!  that name looks like an internal row, so prefer another scraper if you can${C.off}`);
  }

  // ---- what it takes, and what it returns. Both calls are free.
  //
  // The two reads go out at once, because neither needs the other's answer.
  // Every early exit below discards `meta` deliberately: a run that cannot
  // state the input contract has nothing to attach an output list to. The cost
  // is one wasted free read, which is a round trip and never a credit.
  const [probe, meta] = await Promise.all([probeSchema(id, key), fetchOutputs(id, key)]);

  // The row was found and the internal rows were counted before this call
  // failed, so both facts survive the failure. apiFailure() returns the blank
  // shape, which would otherwise zero them.
  if (probe.fail) {
    return { ...apiFailure(query, probe.fail, `${API}/datasets/v3/trigger`), matches, skipped_internal: skipped };
  }

  if (probe.started) {
    return { ...result, error: 'probe_started_job', exit: 2, lines: [
      ...lines,
      `${C.bad}x the empty-record probe started a real job instead of being rejected${C.off}`,
      `  cancel snapshot ${probe.started} so it does not collect and bill`,
      '  report this: the probe is supposed to fail validation before any work starts'] };
  }

  if (probe.marketplace) {
    return { ...result, error: 'marketplace_dataset', exit: 1, lines: [
      ...lines,
      `${C.bad}x marketplace dataset, not a scraper${C.off}`,
      '  it holds data that was already collected, so it takes no input and cannot be triggered',
      '  buy the download instead: see the dataset marketplace reference'] };
  }

  if (probe.unreadable !== undefined) {
    return { ...result, error: 'unparseable_body', exit: 2, lines: [
      ...lines,
      `${C.bad}x the input probe answered in a shape that was not understood${C.off}`,
      `  ${probe.unreadable || '(empty answer)'}`,
      '  the input fields are unknown, so do not guess them'] };
  }

  // The rejection was a validation rejection and its fields could not be read
  // as an input contract. The raw pairs are all there is, so the raw pairs are
  // what the reader gets.
  if (probe.unrecognized) {
    return { ...result, error: 'unrecognized_validation_wording', exit: 1, lines: [
      ...lines,
      `${C.bad}x the probe was rejected, but not in a wording this script reads as an input contract${C.off}`,
      ...probe.unrecognized.map(p => `  ${p}`),
      '  those are the fields the API rejected an empty record over. Which of them are required is not stated here',
      '  do not read this as "no required inputs"'] };
  }

  // A missing metadata endpoint costs the output list and nothing else, so the
  // run still succeeds on the strength of the input contract.
  //
  // Null, not {}, when the list could not be determined: outputs:{} has to keep
  // meaning "this scraper returns no fields".
  const outputs = meta.outputs;
  const outNames = outputs ? Object.keys(outputs) : [];

  lines.push(`required input: ${probe.required.length ? probe.required.join(', ') : '(none)'}`);
  if (probe.optional.length) lines.push(`optional input: ${probe.optional.join(', ')}`);

  if (meta.note) {
    lines.push(`${C.dim}${meta.note}${C.off}`);
  } else {
    lines.push(`output fields: ${outNames.length}`);
    const preview = outNames.slice(0, SAMPLE).map(n => `${n}:${outputs[n]}`).join('  ');
    if (preview) {
      lines.push(`${C.dim}  ${preview}${C.off}`);
      // Both counts and the flag that lifts the limit go on the line, so a
      // truncated preview says how much was cut and how to see the rest.
      if (outNames.length > SAMPLE) {
        lines.push(`${C.dim}  ${outNames.length} fields, showing ${SAMPLE}. Add --json for all of them.${C.off}`);
      }
    }
  }

  lines.push(`${C.ok}ready to trigger${C.off}`);

  return {
    ...result,
    ok: true,
    schema: { required: probe.required, optional: probe.optional, outputs },
    exit: 0,
    lines,
  };
}

const { lines, exit, ...result } = await resolve();

// --help wins over --json: there is no JSON rendering of a usage block, and the
// blank report would be indistinguishable from a run that found nothing.
if (JSON_OUT && !ARGS.help) console.log(JSON.stringify(result, null, 2));
else for (const l of lines) console.log(l);

// process.exitCode, never process.exit(): exiting while a fetch socket is
// still closing crashes Node on Windows (libuv assertion, exit 0xC0000409).
process.exitCode = exit;
