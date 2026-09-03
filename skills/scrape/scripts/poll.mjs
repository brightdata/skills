#!/usr/bin/env node
/**
 * poll.mjs - an id in, its records out once the job finishes.
 *
 * A trigger never returns data. It returns an id, and the two scraping paths
 * hand back different kinds of id that are read through different endpoints.
 * find-scraper.mjs says which scraper to use, trigger.mjs starts the job, and
 * this is the last step of the same chain:
 *
 *   node find-scraper.mjs instagram --schema     what it takes
 *   node trigger.mjs gd_l1vikfch901nx3by4 https://www.instagram.com/nasa/
 *   node poll.mjs sd_...                         the id that printed
 *
 * THIS ONE SPENDS NOTHING. Every call here is a free read of work that was
 * already paid for at trigger time. A poll that gives up costs nothing either:
 * it stops the waiting, not the job, and the same id still works later.
 *
 * Usage:  node poll.mjs <snapshot_or_job_id> [--out FILE] [--timeout SECONDS] [--json]
 *         node poll.mjs --help
 * Auth:   BRIGHTDATA_API_KEY env var, or the CLI's credentials.json.
 *         The key is never printed, not even on failure.
 * Output: the records on stdout, or into --out. Progress, warnings and errors
 *         go to stderr, so the happy path stays pipeable:
 *           node poll.mjs sd_abc | jq '.[0]'
 * Exit:   0 records delivered, 1 bad arguments or no result, 2 auth, network or
 *         API failure. Same three codes as find-scraper.mjs and trigger.mjs.
 *
 * Node 18 or newer, no dependencies.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve as toAbsolute } from 'node:path';
import { homedir } from 'node:os';

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
 * Ceilings, and why there are two of them.
 *
 * REQUEST_TIMEOUT_MS covers opening the socket and getting the response headers
 * back. It must not cover the body: a finished snapshot is megabytes, and a
 * download that is transferring fine but slowly would be aborted mid-read by a
 * header ceiling, over and over, with no way to ever succeed. So the header
 * timer is disarmed the moment the headers land and the body gets its own,
 * much longer deadline, which still kills a transfer that has genuinely hung.
 *
 * BRIGHTDATA_REQUEST_TIMEOUT_MS overrides the header ceiling. It is validated
 * rather than trusted, because a non-integer, an Infinity or a 1e10 reaching a
 * timer is a crash or a timer that never fires, and either one hangs the caller.
 */
const MAX_TIMEOUT_MS = 600_000;

function envMs(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0 || n > MAX_TIMEOUT_MS) return fallback;
  return n;
}

const REQUEST_TIMEOUT_MS = envMs(process.env.BRIGHTDATA_REQUEST_TIMEOUT_MS, 30_000);

/** Ten times the header ceiling, which is five minutes at the shipped default. */
const BODY_TIMEOUT_MS = REQUEST_TIMEOUT_MS * 10;

/**
 * How long a 404 on the progress endpoint is forgiven at the start of a run.
 *
 * A snapshot id is handed out the instant the trigger is accepted, and for a
 * second or two after that the progress endpoint can still answer 404. Treating
 * the first one as fatal abandons a job that was just billed for, so the first
 * few seconds of 404s are a retry rather than a verdict.
 */
const NOT_FOUND_GRACE_MS = 20_000;

const USAGE = 'Usage: node poll.mjs <snapshot_or_job_id> [--out FILE] [--timeout SECONDS] [--json]';

/** What -h and --help print. Its first line is the one every error path shows. */
const USAGE_BLOCK = [
  USAGE,
  '  <snapshot_or_job_id>  sd_ or s_ for a Web Scraper API snapshot, anything',
  '                        else is read as a Scraper Studio job',
  '  --out FILE   write the records to FILE instead of stdout',
  '  --timeout S  give up waiting after S seconds (default 600)',
  '  --json       one JSON object on stdout instead of the records, so it needs',
  '               --out to put the records somewhere',
  '               shape: { ok, id, kind, records_count, out, error }',
  '  -h, --help   this block',
  '',
  '  costs nothing: the job was billed when it was triggered, and this only',
  '  reads it. Giving up costs nothing either - the job keeps running and the',
  '  same id still works later.',
  '',
  '  example:  node poll.mjs sd_abc123',
  '  example:  node poll.mjs sd_abc123 --out records.json --timeout 900',
  '  no id yet? node trigger.mjs <dataset_id> <url>',
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
 * Walk the args once, so a flag's value is never mistaken for the id.
 *
 * Anything longer than one character that starts with a dash is a flag, single
 * dash included: "-json" is a typo for "--json", and reading it as a positional
 * would send it to the API as a snapshot id. A lone "-" is left alone.
 */
function parseArgs(argv) {
  let id = null, out = null, timeoutSec = 600, json = false, help = false, bad = null;

  const value = (v, what) => {
    if (v === undefined) { bad ??= `${what} needs a value.`; return null; }
    if (v.startsWith('-') && v.length > 1) { bad ??= `${what} needs a value, but the next argument is the flag ${v}.`; return null; }
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '-h' || a === '--help') help = true;
    else if (a === '--out') {
      const v = value(argv[++i], '--out');
      if (v === null) continue;
      // An empty path is not a path, and must not fall through as "no --out
      // given": that would send the records to stdout and exit 0.
      if (!v.trim()) bad ??= '--out needs a file path, and "" is not one. Leave --out off to write the records to stdout.';
      else out = v;
    } else if (a === '--timeout') {
      const v = value(argv[++i], '--timeout');
      if (v === null) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) bad ??= `--timeout wants a positive number of seconds, got "${v}".`;
      else timeoutSec = n;
    } else if (a.startsWith('-') && a.length > 1) bad ??= `Unknown flag ${a}.`;
    else if (id === null) id = a;
    else bad ??= `Unexpected argument ${a}. This script polls exactly one id.`;
  }

  return { id, out, timeoutSec, json, help, bad };
}

const ARGS = parseArgs(process.argv.slice(2));
const JSON_OUT = ARGS.json;

const C = process.stderr.isTTY && !JSON_OUT
  ? { ok: '\x1b[32m', bad: '\x1b[31m', dim: '\x1b[90m', off: '\x1b[0m' }
  : { ok: '', bad: '', dim: '', off: '' };

// ---------------------------------------------------------------- output

/**
 * A reader is allowed to stop reading. `node poll.mjs sd_x | head -1` closes
 * the pipe as soon as head has its line, and the next write raises EPIPE on
 * stdout. With no handler that is an unhandled stream error: Node prints a raw
 * stack over the user's terminal and exits non-zero, which reads as a failure
 * of the poll rather than as head doing exactly what it was asked to do.
 *
 * So both streams get a handler, and stdout remembers that it is gone. Nothing
 * else in this file writes to a stream directly.
 */
let stdoutOpen = true;
process.stdout.on('error', () => { stdoutOpen = false; });
process.stderr.on('error', () => { /* nothing left to report it to */ });

/** The answer: records, or the --json object. Silent once the reader has left. */
function emit(text) {
  if (!stdoutOpen) return false;
  try {
    process.stdout.write(text);
    return true;
  } catch {
    stdoutOpen = false;
    return false;
  }
}

/** Everything that is not the answer itself, so stdout stays pipeable. */
function log(msg) {
  try { process.stderr.write(`${msg}\n`); } catch { /* stderr is gone too */ }
}

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
 *
 * It also keeps the poll loop honest: a broken header throws inside fetch,
 * which this script reads as a transient network fault, so a stray newline in
 * credentials.json would otherwise spin until the deadline.
 */
const KEY_SHAPE = /^[\x21-\x7e]+$/;

/** Find the key, in the same order the CLI resolves it in. */
function findApiKey() {
  if (process.env.BRIGHTDATA_API_KEY) return process.env.BRIGHTDATA_API_KEY.trim();
  const paths = [
    process.env.APPDATA && join(process.env.APPDATA, 'brightdata-cli', 'credentials.json'),
    // The CLI builds the Windows directory from the user profile, not %APPDATA%,
    // so an unset or redirected APPDATA still lands on the real file here.
    // Kept identical across the sibling scripts so a job triggered on this
    // machine can always be polled on it.
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
 * One authenticated GET. This never throws.
 *
 * One AbortController covers the request, but the header timer is cleared as
 * soon as the response arrives and a second, longer timer is armed for the
 * body. Leaving the first one armed through res.text() would abort a slow but
 * healthy download at exactly the same place on every retry.
 *
 * Three failure kinds come back, and they are not interchangeable:
 *   netError  - nothing was answered. Worth retrying inside the deadline.
 *   bodyError - the headers arrived and the body did not survive being read,
 *               because it hung or because it is larger than a JS string can
 *               hold. Retrying re-downloads the same body and fails the same
 *               way, so this is permanent.
 *   a status  - the API answered. 5xx and 429 are this minute's weather.
 *
 * The failure text is scrubbed before it is handed back. An HTTP stack that
 * rejects a malformed header quotes that header in the error it raises, so the
 * raw message can carry "Bearer <key>" in it, and this function's return value
 * is printed and put in the --json error field. Nothing that leaves here is
 * allowed to contain the key.
 */
async function get(url, key) {
  const scrub = m => String(m).split(key).join('<redacted>');
  const controller = new AbortController();
  const headerTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(headerTimer);
    return {
      status: 0, ok: false, transient: true, parsed: false, body: null, text: '',
      netError: scrub(e?.message ?? String(e)), bodyError: null,
    };
  }

  // The headers are in, so the connection ceiling has done its job. Disarm it
  // before reading the body, then give the body its own deadline.
  clearTimeout(headerTimer);
  const bodyTimer = setTimeout(() => controller.abort(), BODY_TIMEOUT_MS);

  let text;
  try {
    text = await res.text();
  } catch (e) {
    const stalled = controller.signal.aborted;
    return {
      status: res.status, ok: false, transient: false, parsed: false, body: null, text: '',
      netError: null,
      bodyError: stalled
        ? `the response body stopped arriving and hit the ${Math.round(BODY_TIMEOUT_MS / 1000)}s body deadline`
        : `the response body could not be held in memory (${scrub(e?.message ?? String(e))})`,
    };
  } finally {
    clearTimeout(bodyTimer);
  }

  let body = null, parsed = false;
  try { body = JSON.parse(text); parsed = true; } catch { /* not JSON, keep the text */ }

  return {
    status: res.status,
    ok: res.ok,
    transient: res.status >= 500 || res.status === 429,
    parsed, body, text, netError: null, bodyError: null,
  };
}

// ---------------------------------------------------------------- routing

/**
 * Ids that are not jobs at all. Both are one letter away from something this
 * script can poll, and without this table both fall through to /dca and come
 * back as a 404 that blames the id for being wrong rather than the wrong kind.
 */
const WRONG_KIND = [
  {
    test: /^c_/i,
    error: 'collector_template',
    lines: id => [
      `${C.bad}x ${id} is a collector template, not a job - run it first with bdata scraper run${C.off}`,
      '  a c_ id comes from bdata scraper create and names a template, not a run',
      '  run:  bdata scraper run ' + id,
      '  then poll the job id that run hands back',
    ],
  },
  {
    test: /^gd_/i,
    error: 'dataset_id',
    lines: id => [
      `${C.bad}x ${id} is a dataset id, not a job - trigger it first, node trigger.mjs <id> <url>${C.off}`,
      '  a gd_ id names a scraper. Running it is what produces something to poll',
      `  run:  node trigger.mjs ${id} <url>`,
      '  then poll the sd_ snapshot id that prints',
    ],
  },
];

/**
 * Snapshot ids carry an "s_" or an "sd_" prefix, and both forms are real: the
 * live Web Scraper API hands back "sd_"-prefixed ids today (observed live),
 * while "s_" is an earlier form still in circulation and still
 * documented. Matching only "s_" would send every real trigger id down the /dca
 * branch, where it 404s. Anything else is read through /dca.
 * The full id routing story lives in references/snapshots-and-jobs.md.
 */
function routeFor(id) {
  return /^sd?_/.test(id)
    ? {
        dca: false,
        kind: 'Web Scraper API snapshot',
        progress: `${API}/datasets/v3/progress/${encodeURIComponent(id)}`,
        data: `${API}/datasets/v3/snapshot/${encodeURIComponent(id)}?format=json`,
        notFound: 'Wrong id, wrong account, or the job has expired.',
      }
    : {
        dca: true,
        kind: 'Scraper Studio job',
        progress: `${API}/dca/log/${encodeURIComponent(id)}`,
        // format=json is required here. Without it this endpoint may answer in
        // a format that is not JSON.
        data: `${API}/dca/dataset?id=${encodeURIComponent(id)}&format=json`,
        // The /dca branch is the fallback, so a 404 here is as likely to mean
        // "this id was routed to the wrong API" as "this id is wrong".
        notFound: 'It was read as a Scraper Studio job. If this id came from a datasets trigger, the endpoints may have changed. Otherwise the id is wrong, the account is wrong, or the job has expired.',
      };
}

// ---------------------------------------------------------------- job state

/** Both status endpoints report state under a lowercase "status" key. */
const stateOf = body => String(body?.status ?? '').toLowerCase();

/** In flight. Keep waiting. */
const RUNNING = ['starting', 'building', 'running', 'pending', 'queued', 'collecting', 'in_progress'];

/** Finished with data. Go and get it. */
const READY = ['ready', 'done', 'finished', 'collected', 'complete', 'completed', 'success', 'succeeded'];

/** Finished without data. Nothing to download, ever. */
const FAILED = ['failed', 'failure', 'error', 'errored', 'canceled', 'cancelled', 'aborted', 'expired'];

/** Whatever the API said about why it stopped. */
function messageOf(body) {
  for (const k of ['message', 'error_message', 'status_message', 'reason', 'detail', 'error']) {
    const v = body?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v && typeof v === 'object' && typeof v.message === 'string' && v.message.trim()) return v.message.trim();
  }
  return null;
}

/** Exponential backoff, capped. Fast enough to feel live, slow enough to be polite. */
const waitMs = attempt => Math.min(2000 * 2 ** Math.min(attempt, 4), 30000);

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- reading a body

/**
 * A short, safe quote of something unexpected. The slice happens before the
 * scrub so a 200MB error page is never copied whole, and the scrub happens
 * before anything is printed.
 */
function excerpt(text, key) {
  let head = String(text ?? '').slice(0, 400);
  if (key) head = head.split(key).join('<redacted>');
  const s = head.replace(/\s+/g, ' ').trim();
  return s.length > 200 ? `${s.slice(0, 200)}...` : s;
}

/**
 * Keys that belong to a status envelope rather than to a scraped record. A body
 * whose every key is one of these is the API talking about the job; anything
 * else is the job's own output.
 *
 * Checked as a whole set: a scraped record is entitled to carry a field called
 * `error`, so a single key name can never be the deciding vote.
 */
const ENVELOPE_KEYS = new Set([
  'status', 'state', 'message', 'error', 'errors', 'error_message', 'status_message',
  'reason', 'detail', 'code', 'type', 'warning', 'progress', 'records', 'lines',
  'fails', 'inputs', 'pages', 'navigations', 'total', 'count', 'snapshot_id',
  'job_id', 'collection_id', 'dataset_id', 'id',
]);

const isEnvelope = keys => keys.length > 0 && keys.every(k => ENVELOPE_KEYS.has(k));

/** An error the API stated in words, or null if it stated none. */
function errorText(body) {
  if (typeof body.error === 'string' && body.error.trim()) return body.error.trim();
  if (body.error && typeof body.error === 'object') {
    const m = body.error.message ?? body.error.detail ?? body.error.msg;
    if (typeof m === 'string' && m.trim()) return m.trim();
    return JSON.stringify(body.error).slice(0, 200);
  }
  if (Array.isArray(body.errors) && body.errors.length) {
    return body.errors.map(e => (typeof e === 'string' ? e : JSON.stringify(e))).join('; ').slice(0, 200);
  }
  if (body.status === undefined && typeof body.message === 'string' && body.message.trim()) return body.message.trim();
  return null;
}

const looksLikeHtml = t =>
  /^\s*(<!doctype\b|<\?xml\b|<html\b|<head\b|<body\b|<title\b|<h1\b|<div\b|<p\b|<pre\b)/i.test(t) || /<html[\s>]/i.test(t);

/** One record per line, the shape every NDJSON download has. */
function looksLikeNdjson(text) {
  const first = text.split('\n').find(l => l.trim());
  if (!first) return false;
  const t = first.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return false;
  try { JSON.parse(t); return true; } catch { return false; }
}

/**
 * A header line and at least one row under it, with the same number of
 * separators. The row check is what keeps a one-line proxy banner ("Error:
 * upstream timed out, retry later") from being written out as a CSV record
 * because it happened to contain a comma.
 */
function looksLikeCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return false;
  const sep = [',', '\t', ';'].find(s => lines[0].includes(s));
  if (!sep) return false;
  const n = lines[0].split(sep).length;
  return n >= 2 && lines.slice(1, 5).some(l => l.split(sep).length === n);
}

const countLines = text => text.split(/\r?\n/).filter(l => l.trim()).length;

/**
 * What the data endpoint actually sent, as one of six verdicts.
 *
 *   records - write them out
 *   pending - the API is still talking about the job, so keep polling
 *   empty   - the job is over and produced nothing
 *   failed  - the job is over and says why
 *   error   - the API stated an error in words
 *   unknown - a 2xx nobody can read as records, quoted so it can be reported
 */
function classifyBody(res, key) {
  if (!res.parsed) {
    const text = res.text;
    if (!text.trim()) return { kind: 'pending', state: '' };
    // A 2xx carrying an error page is not records. Writing it out as though it
    // were is worse than failing: it exits 0 with a file full of HTML.
    if (looksLikeHtml(text)) return { kind: 'unknown', excerpt: excerpt(text, key) };
    if (looksLikeNdjson(text)) return { kind: 'records', text, count: countLines(text) };
    if (looksLikeCsv(text)) return { kind: 'records', text, count: countLines(text) - 1 };
    return { kind: 'unknown', excerpt: excerpt(text, key) };
  }

  const body = res.body;

  if (Array.isArray(body)) {
    return body.length === 0 ? { kind: 'empty' } : { kind: 'records', text: res.text, count: body.length };
  }
  if (body === null) return { kind: 'empty' };

  // A JSON string is a quoted status word or a quoted message. It is never a
  // record and must not be written out as one.
  if (typeof body === 'string') return { kind: 'unknown', excerpt: excerpt(res.text, key) };

  // A number or a boolean is not a record and not a status.
  if (typeof body !== 'object') return { kind: 'unknown', excerpt: excerpt(res.text, key) };

  const keys = Object.keys(body);
  if (keys.length === 0) return { kind: 'empty' };

  if (isEnvelope(keys)) {
    const state = stateOf(body);
    if (FAILED.includes(state)) return { kind: 'failed', state, message: messageOf(body) };
    const stated = errorText(body);
    if (stated) return { kind: 'error', message: stated };
    return { kind: 'pending', state };
  }

  // Not an envelope, so it is the job's own output: one record, not a list.
  return { kind: 'records', text: res.text, count: 1 };
}

// ---------------------------------------------------------------- report shape

/**
 * Every exit path returns exactly these keys, in this order, so a caller
 * reading --json can branch without checking whether a field exists.
 */
const blank = (id = null, kind = null, out = null) =>
  ({ ok: false, id, kind, records_count: null, out, error: null });

// ---------------------------------------------------------------- delivery

/**
 * Write the records exactly once.
 *
 * The text is what the API sent, byte for byte: parsing it, re-serialising it
 * with an indent and then writing it would hold three copies of a
 * multi-hundred-megabyte payload at the same time.
 *
 * A failed write is not allowed to lose data. The path may be unwritable, but
 * the records are in hand and the job they came from is billed and mortal, so
 * they go to stdout instead and the exit code says the file did not happen.
 */
function deliver(text, count, outFile, id, kind) {
  const payload = text.endsWith('\n') ? text : `${text}\n`;
  const counted = count != null ? `${count} record${count === 1 ? '' : 's'}` : 'the records';

  if (!outFile) {
    emit(payload);
    return { ...blank(id, kind), ok: true, records_count: count, exit: 0, lines: [`${C.ok}${counted} on stdout${C.off}`] };
  }

  try {
    writeFileSync(outFile, payload, 'utf8');
    return {
      ...blank(id, kind, outFile), ok: true, records_count: count, exit: 0,
      lines: [`${C.ok}wrote ${outFile}${C.off}${count != null ? `${C.dim} (${count} records)${C.off}` : ''}`],
    };
  } catch (e) {
    emit(payload);
    return {
      ...blank(id, kind), records_count: count, error: 'out_write_failed', exit: 1,
      lines: [
        `${C.bad}x could not write ${outFile}: ${e?.code ?? ''} ${e?.message ?? e}`.trim() + C.off,
        `  the ${counted} went to stdout instead, so nothing was lost`,
        '  fix the path and run this again with the same id: the snapshot is still there',
      ],
    };
  }
}

// ---------------------------------------------------------------- main

async function resolve() {
  const { id, out, timeoutSec, json, help, bad } = ARGS;

  // ---- arguments

  // Help wins over every other argument, including bad ones, and exits 0.
  if (help) return { ...blank(id), ok: true, exit: 0, lines: USAGE_BLOCK };

  if (bad) {
    return { ...blank(id), error: 'bad_argument', exit: 1, lines: [`${C.bad}x ${bad}${C.off}`, USAGE] };
  }
  if (!id || !id.trim()) {
    return { ...blank(id), error: 'bad_argument', exit: 1, lines: [
      `${C.bad}x this needs the id a trigger gave back${C.off}`,
      USAGE,
      '  example:  node poll.mjs sd_abc123',
      '  no id yet? node trigger.mjs <dataset_id> <url>'] };
  }

  // --json replaces the records on stdout with a report about them, so on its
  // own it has nowhere to put the records themselves.
  if (json && !out) {
    return { ...blank(id), error: 'bad_argument', exit: 1, lines: [
      `${C.bad}x --json puts a report on stdout, so the records need a file: add --out FILE${C.off}`,
      USAGE,
      '  example:  node poll.mjs ' + id + ' --out records.json --json'] };
  }

  // The parent directory is checked before the download: a missing folder found
  // afterwards leaves paid-for records in memory with nowhere to go.
  if (out) {
    const parent = dirname(toAbsolute(out));
    if (!existsSync(parent)) {
      return { ...blank(id, null, out), error: 'bad_argument', exit: 1, lines: [
        `${C.bad}x --out points into ${parent}, which does not exist${C.off}`,
        '  create the folder first, or point --out somewhere that exists',
        USAGE] };
    }
    if (existsSync(out) && statSync(out).isDirectory()) {
      return { ...blank(id, null, out), error: 'bad_argument', exit: 1, lines: [
        `${C.bad}x --out ${out} is a directory, so it cannot be the records file${C.off}`,
        '  give --out a file name inside it',
        USAGE] };
    }
  }

  // ---- the id has to be a job

  for (const wrong of WRONG_KIND) {
    if (wrong.test.test(id)) {
      return { ...blank(id, null, out), error: wrong.error, exit: 1, lines: wrong.lines(id) };
    }
  }

  // ---- credentials

  const { key, illegal } = readApiKey();
  if (illegal) {
    // Never quotes the value, not even a prefix.
    return { ...blank(id, null, out), error: 'bad_api_key', exit: 2, lines: [
      `${C.bad}x the API key cannot be used: the credential file or env var contains an illegal character${C.off}`,
      '  a key is printable ASCII with no spaces, so a stray newline or tab breaks it',
      '  the value is not shown here, on purpose. Set it again from a clean copy:',
      ...FIXES] };
  }
  if (!key) {
    return { ...blank(id, null, out), error: 'no_api_key', exit: 2, lines: [
      `${C.bad}x no API key found - this machine is not logged in${C.off}`,
      '  nothing was polled, and the job this id names is unaffected',
      ...FIXES] };
  }

  return await poll(id, out, timeoutSec, key);
}

/**
 * Wait for the job, then hand over its records.
 *
 * Every return from here is a finished verdict. Returning null from one of the
 * helpers means "not yet", and the loop is the only thing allowed to decide
 * that not-yet has gone on long enough.
 */
async function poll(id, out, timeoutSec, key) {
  const route = routeFor(id);
  const at = (extra = {}) => ({ ...blank(id, route.kind, out), ...extra });

  log(`${C.dim}${route.kind}: ${id}${C.off}`);

  const startedAt = Date.now();
  const deadline = startedAt + timeoutSec * 1000;
  let attempt = 0;
  let last = '';

  // What the run has actually seen, which is what the verdict at the deadline
  // is based on.
  let saw404 = false;
  let sawNon404 = false;
  let lastNetError = null;

  // Only reprint when something actually changed, so long jobs stay readable.
  const note = line => {
    if (line !== last) {
      log(`${C.dim}  ${line}${C.off}`);
      last = line;
    }
  };

  const authFailure = () => at({ error: 'http_401', exit: 2, lines: [
    `${C.bad}x HTTP 401 - the key is invalid or revoked${C.off}`,
    '  the job itself is unaffected: fix the key and poll the same id again',
    ...FIXES] });

  const notFound = () => at({ error: 'not_found', exit: 1, lines: [
    `${C.bad}x HTTP 404 for ${id} - nothing here answers to that id${C.off}`,
    `  ${route.notFound}`,
    '  batch collections stay downloadable for 16 days, real-time ones for 7'] });

  const bodyFailure = res => at({ error: 'body_unreadable', exit: 2, lines: [
    `${C.bad}x the answer started arriving and could not be read to the end${C.off}`,
    `  ${res.bodyError}`,
    '  retrying downloads the same body, so this will not pass by itself',
    '  ask the API for fewer records, or take delivery to a file destination instead'] });

  /**
   * Is the job still going? Asked again after a download refuses, because the
   * two endpoints do not always agree in the same second: a job that /dca/log
   * still calls running will 400 or 404 on its dataset until it does not, and
   * killing the run on the first of those throws away the wait so far.
   */
  const stillRunning = async () => {
    const res = await get(route.progress, key);
    if (!res.ok || !res.parsed) return false;
    const state = stateOf(res.body);
    if (FAILED.includes(state) || READY.includes(state)) return false;
    return RUNNING.includes(state) || (route.dca && !READY.includes(state));
  };

  /** One attempt at the records. A finished verdict, or null for not yet. */
  const download = async () => {
    const res = await get(route.data, key);

    if (res.netError) { note('the download did not answer, retrying'); return null; }
    if (res.status === 401) return authFailure();
    if (res.bodyError) return bodyFailure(res);

    if (!res.ok) {
      if (res.transient) { note(`download busy (HTTP ${res.status}), retrying`); return null; }
      if (await stillRunning()) {
        note(`the records are not there yet (HTTP ${res.status}), and the job is still running`);
        return null;
      }
      return at({ error: `http_${res.status}`, exit: 2, lines: [
        `${C.bad}x the download returned HTTP ${res.status}${C.off}`,
        `  ${excerpt(res.text, key) || '(empty answer)'}`,
        '  batch collections stay downloadable for 16 days, real-time ones for 7'] });
    }

    const verdict = classifyBody(res, key);

    switch (verdict.kind) {
      case 'records':
        return deliver(verdict.text, verdict.count, out, id, route.kind);

      case 'pending':
        note(`${verdict.state || 'pending'}, records not ready`);
        return null;

      case 'empty':
        return at({ records_count: 0, error: 'no_records', exit: 1, lines: [
          `${C.bad}x the job finished and returned no records${C.off}`,
          '  check the inputs, or the fails count in the job log',
          '  nothing is wrong with this id: there is simply nothing under it'] });

      case 'failed':
        return at({ error: 'job_failed', exit: 2, lines: [
          `${C.bad}x the job reports "${verdict.state}", so there are no records to wait for${C.off}`,
          ...(verdict.message ? [`  ${verdict.message}`] : []),
          '  trigger it again once the input is fixed. Nothing further is billed by waiting'] });

      case 'error':
        return at({ error: 'api_error', exit: 2, lines: [
          `${C.bad}x the API answered HTTP ${res.status} and said:${C.off}`,
          `  ${verdict.message}`,
          '  that is the API\'s own words, not a guess from the status code'] });

      default:
        // A 2xx that is not records and not a status. Never written out, and
        // never called pending.
        return at({ error: 'unreadable_body', exit: 2, lines: [
          `${C.bad}x the download answered HTTP ${res.status} in a shape that is not records${C.off}`,
          `  ${verdict.excerpt || '(empty answer)'}`,
          '  nothing was written, because writing that as records would be worse than failing'] });
    }
  };

  for (;;) {
    if (Date.now() > deadline) {
      // A run that never got an answer out of the API cannot report on the job:
      // "still running, nothing is lost" would be a fact the run does not have.
      if (!saw404 && !sawNon404 && lastNetError) {
        return at({ error: 'network', exit: 2, lines: [
          `${C.bad}x could not reach ${API}${C.off}`,
          `  ${lastNetError}`,
          `  nothing was ever answered in ${timeoutSec}s, so this says nothing about the job`,
          '  fix the network, proxy or DNS and poll the same id again'] });
      }
      // A run that only ever saw 404s never found the job at all, so the honest
      // report is the missing id, not a job that ran out of time.
      if (saw404 && !sawNon404) return notFound();
      return at({ error: 'timeout', exit: 1, lines: [
        `${C.bad}x gave up waiting after ${timeoutSec}s${C.off}`,
        '  this stopped the waiting, not the job: it is still running on Bright Data\'s side',
        '  nothing is lost and nothing is billed twice',
        `  poll the same id again later, or raise the ceiling: node poll.mjs ${id} --timeout ${Math.round(timeoutSec * 2)}`] });
    }

    const res = await get(route.progress, key);

    if (res.status === 401) return authFailure();
    if (res.bodyError) return bodyFailure(res);

    if (res.status === 404) {
      saw404 = true;
      // A snapshot id exists before its progress endpoint does. Only after the
      // grace window is a 404 a fact about the id rather than about the clock.
      if (Date.now() - startedAt >= NOT_FOUND_GRACE_MS) return notFound();
      note('not found yet (HTTP 404), retrying in case the job is still registering');
    } else if (res.netError) {
      // Deliberately not counted as an answer: nothing came back at all.
      lastNetError = res.netError;
      note('no answer from the API, retrying');
    } else if (!res.ok && res.transient) {
      sawNon404 = true;
      note(`api busy (HTTP ${res.status}), retrying`);
    } else if (!res.ok) {
      sawNon404 = true;
      return at({ error: `http_${res.status}`, exit: 2, lines: [
        `${C.bad}x HTTP ${res.status} while asking how the job is going${C.off}`,
        `  ${excerpt(res.text, key) || '(empty answer)'}`,
        '  the job is unaffected by this: poll the same id again'] });
    } else {
      sawNon404 = true;
      const state = stateOf(res.body);

      if (FAILED.includes(state)) {
        const message = messageOf(res.body);
        return at({ error: 'job_failed', exit: 2, lines: [
          `${C.bad}x the job reports "${state}", so there are no records to wait for${C.off}`,
          ...(message ? [`  ${message}`] : []),
          '  trigger it again once the input is fixed. Nothing further is billed by waiting'] });
      }

      if (RUNNING.includes(state)) {
        const rows = res.body?.records ?? res.body?.lines;
        note(`${state}${rows != null ? ` (${rows} records)` : ''}`);
      } else if (route.dca && !READY.includes(state)) {
        // The Studio vocabulary is open: it carries states this script has
        // never heard of. Unknown is treated as in flight, never as finished,
        // and the deadline is what ends the wait.
        note(`${state || 'no status reported'}, reading that as still running`);
      } else {
        const done = await download();
        if (done) return done;
      }
    }

    await sleep(waitMs(attempt++));
  }
}

const { lines, exit, ...result } = await resolve();

// The answer goes to stdout and everything else to stderr, which is what keeps
// `poll.mjs sd_x | jq` working. --help prints to stdout because the help block
// is the answer.
if (JSON_OUT) {
  emit(`${JSON.stringify(result, null, 2)}\n`);
  for (const l of lines) log(l);
} else if (ARGS.help) {
  for (const l of lines) emit(`${l}\n`);
} else {
  for (const l of lines) log(l);
}

// process.exitCode, never process.exit(): exiting while a fetch socket is
// still closing crashes Node on Windows (libuv assertion, exit 0xC0000409),
// and it can truncate a stdout write that is still pending on a pipe.
process.exitCode = exit;
