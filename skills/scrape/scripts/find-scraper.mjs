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

/**
 * Per-request ceiling. A server that accepts the socket and then says nothing
 * must not hang the agent that called this, so every request carries it.
 * The env var is a test seam: the suite proves the timeout fires, and it has to
 * do that in a couple of seconds rather than in fifteen of them.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.BRIGHTDATA_REQUEST_TIMEOUT_MS) > 0
  ? Number(process.env.BRIGHTDATA_REQUEST_TIMEOUT_MS)
  : 15_000;

/** Human output stops after this many rows. --json always carries them all. */
const MAX_LISTED = 20;

/** How many output fields the human listing previews before it stops. */
const SAMPLE = 8;

const USAGE = 'Usage: node find-scraper.mjs <query> [--schema] [--json]';

/**
 * What -h and --help print. The first line is the one every error path also
 * shows, so a reader who hit a mistake and a reader who asked for help are
 * looking at the same shape of answer.
 */
const USAGE_BLOCK = [
  USAGE,
  '  <query>      part of a scraper name, or a gd_ dataset id',
  '  --schema     what the one matching scraper takes and returns',
  '  --json       one JSON object on stdout instead of the human listing',
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
 * Read JSON tolerating a UTF-8 BOM (Windows editors add one).
 * The BOM is written as the \uFEFF escape on purpose: as a literal it is an
 * invisible character inside a regex, which reads as a bug and gets "cleaned
 * up" by the next person to touch this line.
 */
const readJson = p => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

/**
 * A usable key is visible ASCII and nothing else, because that is all an HTTP
 * header value accepts. This is a safety rule as much as a correctness one: a
 * key carrying a newline makes the Authorization header invalid, and the error
 * text the HTTP stack raises for that quotes the offending header back, key
 * included. Catching the shape here keeps that string from ever being built.
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
 * Returns { key, illegal }. `illegal` means a value was found and it cannot be
 * used, which is a different fact from finding nothing: the fix is to repair
 * the credential, not to log in again. The value itself is never returned or
 * quoted anywhere, not even a fragment of it.
 */
function readApiKey() {
  const found = findApiKey();
  if (!found) return { key: null, illegal: false };
  if (!KEY_SHAPE.test(found)) return { key: null, illegal: true };
  return { key: found, illegal: false };
}

// ---------------------------------------------------------------- http

/**
 * One authenticated request. This never throws.
 *
 * A transport failure comes back as status 0 with the reason in `netError`, so
 * every caller handles a dead network the same way it handles a bad status.
 * The body is parsed when it is JSON and kept as raw text when it is not,
 * because the schema probe needs the body of a 400 just as much as of a 200.
 *
 * The failure text is scrubbed before it is handed back. An HTTP stack that
 * rejects a malformed header quotes that header in the error it raises, so the
 * raw message can carry "Bearer <key>" in it, and this function's return value
 * is printed and put in the --json error field. Nothing that leaves here is
 * allowed to contain the key.
 */
async function call(url, key, init = {}) {
  const scrub = m => String(m).split(key).join('<redacted>');
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
    return { status: 0, ok: false, body: null, parsed: false, text: '', netError: scrub(e?.message ?? String(e)) };
  }
}

// ---------------------------------------------------------------- report shape

/**
 * Every exit path returns exactly these keys, in this order, so a caller
 * reading --json can branch without checking whether a field exists.
 */
const blank = query => ({ ok: false, query, matches: [], skipped_internal: 0, schema: null, error: null });

/**
 * A call that told us nothing. Always exit 2: the query was never answered, so
 * the caller must not read this as "no such scraper".
 */
function apiFailure(query, res, what) {
  const base = blank(query);
  if (res.netError) {
    return { ...base, error: `network: ${res.netError}`, exit: 2, lines: [
      `${C.bad}x could not reach ${API}${C.off}`,
      `  ${res.netError} - the catalogue was never read, so this is not an auth failure`,
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
 * Internal junk the live catalogue really carries. Never offer one of these as
 * a scraper: they are staging rows, and several are scheduled for deletion.
 *
 * An audit of the live catalogue against the first version of these rules found
 * 48 junk rows caught and 106 still offered, so the marks below are the real
 * forms the account carries: "[Internal]" and "[Internal use]", "INTERNAL -",
 * "[DEPRECATED]", "(delete)" and "[delete]", "delete please", "Remove me!",
 * and a family of roughly ninety "<Brand> Products - test" rows.
 *
 * THE BIAS IS DELIBERATE: prefer hiding a borderline row. Hiding one costs a
 * search that comes back shorter, and an explicit gd_ id still reaches
 * anything, internal rows included. Offering one costs an agent building
 * against a staging row that is scheduled for deletion.
 *
 * The "test" prefix rule is anchored and stops at a word boundary of its own,
 * so "test", "test-3" and "Test_old" are skipped while a real name such as
 * "Testimonials scraper" is not. A blunt startsWith('test') would eat the good
 * one. The suffix rule is anchored at the other end for the same reason: it
 * catches "Walmart Products - test" and "Amazon products (test)" without
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

  // Rows arrived and not one of them carried an id, so the id moved or was
  // renamed. That is an unrecognized shape, not an empty catalogue: reporting
  // it as "no rows" would send the agent off to build a scraper the account
  // may already own.
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
 * A 404 and a 500 are different news and are worded differently. A 404 is
 * permanent: this scraper has no metadata endpoint and running again will not
 * produce one. A 5xx or a 429 is this minute's weather, so the note says the
 * list is temporarily unavailable and to run again, which is the one case
 * where a second run is worth spending.
 *
 * `outputs` is null on every one of these paths, never {}. An empty object has
 * to keep meaning "this scraper returns no fields at all".
 */
async function fetchOutputs(id, key) {
  const res = await call(`${API}/datasets/${encodeURIComponent(id)}/metadata`, key);

  if (res.netError) return { fail: res };
  if (res.status === 401) return { fail: res };
  if (res.status === 404) return { outputs: null, note: 'this scraper has no metadata endpoint, so its output fields are not listed' };
  if (res.status === 429 || res.status >= 500) {
    return { outputs: null, note: `the output list is temporarily unavailable (HTTP ${res.status}), so run this again to get it` };
  }
  if (!res.ok) return { outputs: null, note: `the metadata endpoint answered HTTP ${res.status}, so the output fields are not listed` };
  if (!res.parsed) return { outputs: null, note: 'the metadata endpoint did not answer with JSON, so the output fields are not listed' };

  const fields = res.body?.fields;
  if (!fields || typeof fields !== 'object') {
    return { outputs: null, note: 'the metadata answer carried no field list, so the output fields are not listed' };
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
 * THE CALL IS FREE. The API validates the record before it starts any work,
 * and an empty record never passes validation, so the request is rejected and
 * nothing is queued, collected or billed. The rejection is the point: it is
 * the only place the API states a scraper's input contract.
 *
 * The rejection body looks like this:
 *   {"type":"validation","errors":[["url","Required field"]],"line":"{\"country\":\"\"}"}
 *
 * - `errors` is an array of [field, message] pairs. A message matching
 *   "required" names a REQUIRED input field.
 * - `line` is the record the API echoes back, as a JSON string, with every
 *   OPTIONAL field present and empty. Its keys are the optional inputs.
 *
 * Two answers are not validation rejections and are handled separately:
 * a marketplace row refuses collection entirely, and a snapshot_id means the
 * probe started a real job, which is a bug worth shouting about.
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

  // Marketplace rows are purchasable datasets, not scrapers. They have no
  // input contract at all, so there is nothing further to ask them.
  //
  // THIS CHECK RUNS BEFORE THE not-JSON ONE ON PURPOSE. The live API refuses a
  // marketplace row with status 400, content-type text/html and the bare body
  // "This dataset does not support collection", which is not JSON. Behind the
  // not-JSON branch this test never ran at all, and every marketplace row came
  // out as an unreadable answer and exit 2. Matching the raw text also covers
  // the JSON form of the same refusal, so one test is enough for both.
  if (/does not support collection/i.test(res.text)) return { marketplace: true };

  if (!res.parsed) return { unreadable: res.text.slice(0, 120) };

  const body = res.body;

  if (body?.snapshot_id) {
    // The empty-body probe is meant to be rejected at validation. If a job
    // started anyway, name it so the operator can cancel it.
    return { started: String(body.snapshot_id) };
  }

  if (body?.type !== 'validation') {
    const errText = typeof body?.error === 'string' ? body.error : '';
    return { unreadable: (errText || res.text).slice(0, 120) };
  }

  const required = (Array.isArray(body.errors) ? body.errors : [])
    .filter(e => Array.isArray(e) && /required/i.test(String(e[1] ?? '')))
    .map(e => String(e[0]));

  // `line` is a JSON string in every answer seen so far. Accept a plain object
  // too, so a shape change costs the optional list rather than the whole run.
  let optional = [];
  try {
    const line = typeof body.line === 'string' ? JSON.parse(body.line) : body.line;
    if (line && typeof line === 'object') optional = Object.keys(line);
  } catch { /* keep the required list, which is the part that matters */ }

  return { required, optional: optional.filter(f => !required.includes(f)) };
}

// ---------------------------------------------------------------- main

async function resolve() {
  const { query, schema: wantSchema, help, bad } = ARGS;

  // ---- arguments

  // Help is answered before anything else, including a bad flag next to it:
  // someone who asked what the flags are is exactly the person who just got
  // one wrong. Asking for help is not a failure, so this exits 0.
  if (help) {
    return { ...blank(query ?? ''), ok: true, exit: 0, lines: USAGE_BLOCK };
  }
  if (bad) {
    return { ...blank(query ?? ''), error: 'bad_argument', exit: 1, lines: [
      `${C.bad}x ${bad}${C.off}`, USAGE] };
  }
  if (!query || !query.trim()) {
    return { ...blank(query ?? ''), error: 'no_query', exit: 1, lines: [
      `${C.bad}x give me something to look for: part of a scraper name, or a gd_ id${C.off}`,
      USAGE,
      '  example:  node find-scraper.mjs instagram',
      '  example:  node find-scraper.mjs gd_l1vikfch901nx3by4 --schema'] };
  }

  // ---- credentials

  const { key, illegal } = readApiKey();
  if (illegal) {
    // Deliberately says nothing about the value, not even its length or first
    // characters: the whole point of this branch is that the key is never
    // quoted anywhere.
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

  let matches, skipped = 0;

  if (looksLikeId(query)) {
    // An explicit id is an explicit choice, so an internal row is returned
    // rather than filtered away. The caller is told what it looks like.
    const want = query.trim().toLowerCase();
    matches = rows.filter(r => r.id.toLowerCase() === want);
  } else {
    const want = query.trim().toLowerCase();
    const hits = rows.filter(r => r.name.toLowerCase().includes(want));
    matches = hits.filter(r => !isInternal(r.name));
    skipped = hits.length - matches.length;
  }

  const result = { ...blank(query), matches, skipped_internal: skipped };

  if (matches.length === 0) {
    const lines = [`${C.bad}x no match for "${query}"${C.off}`];
    if (looksLikeId(query)) {
      lines.push('  that id is not in this account\'s catalogue. Check it, or search by name instead:',
        '  node find-scraper.mjs <part of the name>');
    } else {
      lines.push('  try a shorter or more general word, for example a platform name on its own');
    }
    if (skipped > 0) {
      lines.push(`  ${skipped} internal row${skipped === 1 ? '' : 's'} matched and were skipped, none of them usable`);
    }
    lines.push('  nothing in the catalogue fits? Then no ready scraper covers this, so go to gate 2 and build one');
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

  const probe = await probeSchema(id, key);
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

  const meta = await fetchOutputs(id, key);
  if (meta.fail) {
    return { ...apiFailure(query, meta.fail, `${API}/datasets/{id}/metadata`), matches, skipped_internal: skipped };
  }

  // A missing metadata endpoint costs the output list and nothing else, so the
  // run still succeeds on the strength of the input contract.
  //
  // Null, not {}, when the list could not be determined. A caller reading
  // outputs:{} has to be able to trust it means "this scraper returns no
  // fields"; folding "we could not find out" into the same value turns a gap
  // in our knowledge into a claim about the scraper.
  const outputs = meta.outputs;
  const outNames = outputs ? Object.keys(outputs) : [];

  lines.push(`required input: ${probe.required.length ? probe.required.join(', ') : '(none)'}`);
  if (probe.optional.length) lines.push(`optional input: ${probe.optional.join(', ')}`);

  if (meta.note) {
    lines.push(`${C.dim}${meta.note}${C.off}`);
  } else {
    lines.push(`output fields: ${outNames.length}`);
    const preview = outNames.slice(0, SAMPLE).map(n => `${n}:${outputs[n]}`).join('  ');
    if (preview) lines.push(`${C.dim}  ${preview}${outNames.length > SAMPLE ? '  ...' : ''}${C.off}`);
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

if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
else for (const l of lines) console.log(l);

// process.exitCode, never process.exit(): exiting while a fetch socket is
// still closing crashes Node on Windows (libuv assertion, exit 0xC0000409).
process.exitCode = exit;
