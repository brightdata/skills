#!/usr/bin/env node
/**
 * trigger.mjs - start one collection job and hand back its snapshot id.
 *
 * find-scraper.mjs says which scraper to use and what it takes. poll.mjs turns
 * a snapshot id into records. This script is the step between them - the
 * trigger POST, with the same auth, timeout and no-leak rules as its siblings:
 *
 *   node find-scraper.mjs instagram --schema     what it takes
 *   node trigger.mjs gd_l1vikfch901nx3by4 https://www.instagram.com/nasa/
 *   node poll.mjs sd_...                         the id this printed
 *
 * THIS ONE SPENDS MONEY. find-scraper.mjs is free by construction: its probe is
 * an empty record the API rejects at validation before any work starts. This
 * script is the opposite - a success here queues a real collection and bills
 * for it. That is why it says what it is about to do, on stderr, before it does
 * it, and why it sends exactly one input and never a list.
 *
 * Usage:  node trigger.mjs <dataset_id> <input_url> [--json]
 *         node trigger.mjs --help
 * Auth:   BRIGHTDATA_API_KEY env var, or the CLI's credentials.json.
 *         The key is never printed, not even on failure.
 * Output: the snapshot id alone on stdout, so it pipes straight into poll.mjs.
 *         The billing notice and the next step go to stderr, which keeps stdout
 *         clean in both modes and keeps --json parseable.
 * Exit:   0 the job started, 1 bad arguments, 2 auth, network or API failure.
 *
 * Node 18 or newer, no dependencies.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const API = process.env.BRIGHTDATA_API_BASE || 'https://api.brightdata.com';

/**
 * Per-request ceiling. A server that accepts the socket and then says nothing
 * must not hang the caller, so every request carries it.
 * BRIGHTDATA_REQUEST_TIMEOUT_MS overrides the default.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.BRIGHTDATA_REQUEST_TIMEOUT_MS) > 0
  ? Number(process.env.BRIGHTDATA_REQUEST_TIMEOUT_MS)
  : 15_000;

const USAGE = 'Usage: node trigger.mjs <dataset_id> <input_url> [--json]';

/** What -h and --help print. Its first line is the one every error path shows. */
const USAGE_BLOCK = [
  USAGE,
  '  <dataset_id> the gd_ id of the scraper to run',
  '  <input_url>  the one page to collect, sent as [{"url": "<input_url>"}]',
  '  --json       one JSON object on stdout instead of the snapshot id',
  '               shape: { ok, snapshot_id, error }',
  '  -h, --help   this block',
  '',
  '  THIS SPENDS MONEY: a success starts a real collection and bills for it.',
  '  find-scraper.mjs is the free half - run it first to check the inputs:',
  '',
  '  example:  node find-scraper.mjs gd_l1vikfch901nx3by4 --schema',
  '  example:  node trigger.mjs gd_l1vikfch901nx3by4 https://www.instagram.com/nasa/',
  '  then:     node poll.mjs <the snapshot id this printed>',
  '',
  '  a scraper whose required input is not "url" (a keyword, a hashtag, a',
  '  location) needs a different payload than this script sends, so trigger it',
  '  with the API directly - find-scraper.mjs --schema names the field',
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
 * Walk the args once. Two positionals, in order: the scraper, then the page.
 *
 * Anything longer than one character that starts with a dash is a flag, single
 * dash included: "-json" is a typo for "--json", and reading it as a positional
 * would send it to the API as a dataset id or a URL. A lone "-" is left alone.
 */
function parseArgs(argv) {
  let datasetId = null, inputUrl = null, json = false, help = false, bad = null;

  for (const a of argv) {
    if (a === '--json') json = true;
    else if (a === '-h' || a === '--help') help = true;
    else if (a.startsWith('-') && a.length > 1) bad ??= `Unknown flag ${a}.`;
    else if (datasetId === null) datasetId = a;
    else if (inputUrl === null) inputUrl = a;
    else bad ??= `Unexpected argument ${a}. This script sends exactly one input.`;
  }

  return { datasetId, inputUrl, json, help, bad };
}

const ARGS = parseArgs(process.argv.slice(2));
const JSON_OUT = ARGS.json;

const C = process.stdout.isTTY && !JSON_OUT
  ? { ok: '\x1b[32m', bad: '\x1b[31m', dim: '\x1b[90m', off: '\x1b[0m' }
  : { ok: '', bad: '', dim: '', off: '' };

/** Everything that is not the answer itself goes to stderr, so stdout pipes. */
const note = msg => process.stderr.write(`${msg}\n`);

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
 * One authenticated request. This never throws.
 *
 * A transport failure comes back as status 0 with the reason in `netError`, so
 * every caller handles a dead network the same way it handles a bad status.
 * The body is parsed when it is JSON and kept as raw text when it is not,
 * because a validation rejection is as worth reading as a success.
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
const blank = () => ({ ok: false, snapshot_id: null, error: null });

/**
 * A call that answered nothing. Always exit 2: the trigger was never answered,
 * so the caller must not read this as "the job did not start".
 */
function apiFailure(res, what) {
  const base = blank();
  if (res.netError) {
    return { ...base, error: `network: ${res.netError}`, exit: 2, lines: [
      `${C.bad}x could not reach ${API}${C.off}`,
      `  ${res.netError} - the trigger was never answered, so this is not an auth failure`,
      '  a job may or may not have started: check the account before running this again',
      '  fix the network, proxy or DNS and run this again'] };
  }
  if (res.status === 401) {
    return { ...base, error: 'http_401', exit: 2, lines: [
      `${C.bad}x HTTP 401 - the key is invalid or revoked${C.off}`,
      '  nothing was triggered and nothing was billed',
      ...FIXES] };
  }
  return { ...base, error: `http_${res.status}`, exit: 2, lines: [
    `${C.bad}x HTTP ${res.status} from ${what}${C.off}`,
    '  the trigger failed, so no snapshot id was returned',
    '  check the status page and run this again'] };
}

// ---------------------------------------------------------------- main

async function resolve() {
  const { datasetId, inputUrl, help, bad } = ARGS;

  // ---- arguments

  // Help wins over every other argument, including bad ones, and exits 0.
  if (help) {
    return { ...blank(), ok: true, exit: 0, lines: USAGE_BLOCK };
  }
  if (bad) {
    return { ...blank(), error: 'bad_argument', exit: 1, lines: [
      `${C.bad}x ${bad}${C.off}`, USAGE] };
  }
  if (!datasetId || !datasetId.trim() || !inputUrl || !inputUrl.trim()) {
    return { ...blank(), error: 'bad_argument', exit: 1, lines: [
      `${C.bad}x this needs both a scraper and a page: <dataset_id> <input_url>${C.off}`,
      USAGE,
      '  example:  node trigger.mjs gd_l1vikfch901nx3by4 https://www.instagram.com/nasa/',
      '  no id yet? node find-scraper.mjs <part of the name>'] };
  }

  // Both checks below are free and run before the billed call.
  const looksLikeUrl = s => /^https?:\/\//i.test(s.trim());

  if (looksLikeUrl(datasetId) && !looksLikeUrl(inputUrl)) {
    return { ...blank(), error: 'bad_argument', exit: 1, lines: [
      `${C.bad}x the arguments look swapped: the scraper id comes first, then the page${C.off}`,
      USAGE] };
  }
  if (!looksLikeUrl(inputUrl)) {
    return { ...blank(), error: 'bad_argument', exit: 1, lines: [
      `${C.bad}x "${inputUrl}" is not an http(s) URL, and this script sends it as one${C.off}`,
      '  it posts [{"url": "<input_url>"}], so the scraper has to take a url',
      '  a scraper that takes a keyword, a hashtag or a location needs a different',
      '  payload: node find-scraper.mjs ' + datasetId + ' --schema names the field',
      USAGE] };
  }

  // ---- credentials

  const { key, illegal } = readApiKey();
  if (illegal) {
    // Never quotes the value, not even a prefix.
    return { ...blank(), error: 'bad_api_key', exit: 2, lines: [
      `${C.bad}x the API key cannot be used: the credential file or env var contains an illegal character${C.off}`,
      '  a key is printable ASCII with no spaces, so a stray newline or tab breaks it',
      '  the value is not shown here, on purpose. Set it again from a clean copy:',
      ...FIXES] };
  }
  if (!key) {
    return { ...blank(), error: 'no_api_key', exit: 2, lines: [
      `${C.bad}x no API key found - this machine is not logged in${C.off}`,
      '  nothing was triggered and nothing was billed',
      ...FIXES] };
  }

  // ---- the billed call
  //
  // Said on stderr before the POST, so --json still parses and a redirected
  // stdout still shows it. Everything above this line is free; everything
  // below it can cost money.
  note(`${C.dim}triggering 1 job, 1 input (billed)${C.off}`);

  const url = `${API}/datasets/v3/trigger?dataset_id=${encodeURIComponent(datasetId)}`;
  const res = await call(url, key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ url: inputUrl }]),
  });

  if (res.netError || res.status === 401) return apiFailure(res, url);

  // A validation rejection is the most likely failure and the most fixable, so
  // it is read rather than reported as a bare status. Nothing was billed: the
  // API rejects the record before it starts any work.
  if (!res.ok && res.parsed && res.body?.type === 'validation') {
    const required = (Array.isArray(res.body.errors) ? res.body.errors : [])
      .filter(e => Array.isArray(e))
      .map(e => `${e[0]}: ${e[1]}`);
    return { ...blank(), error: 'validation_rejected', exit: 2, lines: [
      `${C.bad}x the API rejected the input, so no job started and nothing was billed${C.off}`,
      ...required.map(r => `  ${r}`),
      `  run:  node find-scraper.mjs ${datasetId} --schema   to see what this scraper takes`] };
  }

  if (!res.ok) return apiFailure(res, url);

  if (!res.parsed) {
    // A 2xx that is not JSON. A job may well have started, so this must not
    // read as a clean failure - the operator has to go and look.
    return { ...blank(), error: 'unparseable_body', exit: 2, lines: [
      `${C.bad}x the trigger answered HTTP ${res.status} in a shape that was not understood${C.off}`,
      `  ${res.text.slice(0, 120) || '(empty answer)'}`,
      '  A JOB MAY HAVE STARTED: check the account before running this again'] };
  }

  const snapshotId = res.body?.snapshot_id;
  if (!snapshotId) {
    return { ...blank(), error: 'no_snapshot_id', exit: 2, lines: [
      `${C.bad}x the trigger succeeded but named no snapshot_id, so there is nothing to poll${C.off}`,
      `  ${res.text.slice(0, 120) || '(empty answer)'}`,
      '  A JOB MAY HAVE STARTED: check the account before running this again'] };
  }

  const id = String(snapshotId);

  // The id alone on stdout, so it pipes into poll.mjs. The next step is a note
  // on stderr rather than a second stdout line, for the same reason.
  note(`${C.ok}started${C.off}${C.dim}  next: node poll.mjs ${id}${C.off}`);

  return { ...blank(), ok: true, snapshot_id: id, exit: 0, lines: [id] };
}

const { lines, exit, ...result } = await resolve();

if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
else for (const l of lines) console.log(l);

// process.exitCode, never process.exit(): exiting while a fetch socket is
// still closing crashes Node on Windows (libuv assertion, exit 0xC0000409).
process.exitCode = exit;
