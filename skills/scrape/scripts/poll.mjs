#!/usr/bin/env node
/**
 * poll.mjs - either id in, records out when the job finishes.
 *
 * Usage:  node poll.mjs <snapshot_or_job_id> [--out FILE] [--timeout SECONDS]
 * Auth:   BRIGHTDATA_API_KEY env var, or the CLI's credentials.json.
 *         The key is never printed, not even on failure.
 * Output: records to stdout (or --out), progress to stderr, so the happy
 *         path stays pipeable:  node poll.mjs s_abc | jq '.[0]'
 * Exit:   0 records written, 1 the job or the API said no, 2 bad arguments.
 *
 * Node 18 or newer, no dependencies.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

const API = process.env.BRIGHTDATA_API_BASE || 'https://api.brightdata.com';
const REQUEST_TIMEOUT_MS = 30000;

const USAGE = 'Usage: node poll.mjs <snapshot_or_job_id> [--out FILE] [--timeout SECONDS]';

const C = process.stderr.isTTY
  ? { ok: '\x1b[32m', bad: '\x1b[31m', dim: '\x1b[90m', off: '\x1b[0m' }
  : { ok: '', bad: '', dim: '', off: '' };

const log = msg => process.stderr.write(`${msg}\n`);

/**
 * Fail carries a message the caller can act on and the exit code to use.
 *
 * Nothing in this file calls process.exit(). process.exit() can truncate a
 * stdout write that is still pending on a pipe, and on Windows it can kill
 * the process mid socket close. Setting process.exitCode and letting the
 * event loop drain avoids both.
 */
class Fail extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const die = msg => { throw new Fail(msg, 1); };
const usageError = msg => { throw new Fail(`${msg}\n${USAGE}`, 2); };

const asText = body => {
  const s = typeof body === 'string' ? body : JSON.stringify(body);
  if (!s) return '';
  return s.length > 300 ? `${s.slice(0, 300)}...` : s;
};

// ---------------------------------------------------------------- args

/** Walk the args once so a flag's value is never mistaken for the id. */
function parseArgs(argv) {
  let id = null, outFile = null, timeoutSec = 600;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) usageError('--out needs a file path.');
      outFile = v;
    } else if (a === '--timeout') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) usageError('--timeout needs a number of seconds.');
      timeoutSec = Number(v);
      if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) {
        usageError(`--timeout wants a positive number of seconds, got "${v}".`);
      }
    } else if (a.startsWith('--')) {
      usageError(`Unknown flag ${a}.`);
    } else if (id === null) {
      id = a;
    } else {
      usageError(`Unexpected argument ${a}.`);
    }
  }

  if (!id) usageError('Missing the snapshot or job id.');
  return { id, outFile, timeoutSec };
}

// ---------------------------------------------------------------- auth

/** Read JSON tolerating a UTF-8 BOM (Windows editors add one). */
const readJson = p => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

/**
 * Resolve the API key the same way the CLI does: env var first, then the
 * credentials file login wrote. Returned, never logged - a key in a terminal
 * scrollback or a CI log is a leaked key.
 */
function readApiKey() {
  if (process.env.BRIGHTDATA_API_KEY) return process.env.BRIGHTDATA_API_KEY.trim();
  const paths = [];
  if (platform() === 'win32' && process.env.APPDATA) {
    paths.push(join(process.env.APPDATA, 'brightdata-cli', 'credentials.json'));
  }
  if (platform() === 'darwin') {
    paths.push(join(homedir(), 'Library', 'Application Support', 'brightdata-cli', 'credentials.json'));
  }
  // Linux path is hardcoded in the CLI, so XDG_CONFIG_HOME is deliberately ignored.
  paths.push(join(homedir(), '.config', 'brightdata-cli', 'credentials.json'));
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const k = readJson(p).api_key;
      if (k) return k.trim();
    } catch { /* corrupt file, try the next candidate */ }
  }
  return null;
}

// ---------------------------------------------------------------- http

/**
 * One GET, with a per-request timeout so a hung socket cannot outlive the
 * overall deadline. This never throws. A network-level failure comes back as
 * status 0 with transient set, so the poll loop retries it like a 5xx.
 */
async function get(url, key) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    let body = text;
    try { body = JSON.parse(text); } catch { /* not JSON, keep the raw text */ }
    return {
      status: res.status,
      ok: res.ok,
      transient: res.status >= 500 || res.status === 429,
      body,
    };
  } catch (e) {
    // Fetch failed, DNS died, the socket hung, the per-request timeout fired.
    // All of those are worth another try inside the overall deadline.
    return { status: 0, ok: false, transient: true, body: e?.message ?? String(e) };
  }
}

// ---------------------------------------------------------------- routing

/**
 * Snapshot ids are prefixed "s_". Anything else is read through /dca.
 * The full id routing story lives in references/snapshots-and-jobs.md.
 */
function routeFor(id) {
  return id.startsWith('s_')
    ? {
        kind: 'Web Scraper API snapshot',
        progress: `${API}/datasets/v3/progress/${encodeURIComponent(id)}`,
        data: `${API}/datasets/v3/snapshot/${encodeURIComponent(id)}?format=json`,
      }
    : {
        kind: 'Scraper Studio job',
        progress: `${API}/dca/log/${encodeURIComponent(id)}`,
        data: `${API}/dca/dataset?id=${encodeURIComponent(id)}`,
      };
}

/** Both status endpoints report state under a lowercase "status" key. */
const stateOf = body => String(body?.status ?? '').toLowerCase();

/** The CLI's own set of running states. Anything else is terminal. */
const RUNNING = ['starting', 'building', 'running', 'pending', 'queued'];

/** Exponential backoff, capped. Fast enough to feel live, slow enough to be polite. */
const waitMs = attempt => Math.min(2000 * 2 ** Math.min(attempt, 4), 30000);

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- download

function writeRecords(payload, count, outFile) {
  if (outFile) {
    writeFileSync(outFile, payload, 'utf8');
    log(`${C.ok}wrote ${outFile}${C.off}${count != null ? `${C.dim} (${count} records)${C.off}` : ''}`);
  } else {
    process.stdout.write(payload + '\n');
  }
}

/**
 * Ask for the records. Returns true once they are written.
 *
 * A JSON array is the records. A JSON object is the API still saying "not
 * yet", for example {"status":"building"}, so the caller keeps polling.
 */
async function download(route, key, outFile, note) {
  const res = await get(route.data, key);

  if (res.status === 401) die('401 from the API. The key is invalid or revoked. Run: bdata login --device');
  if (!res.ok) {
    if (res.transient) {
      note(`download busy (HTTP ${res.status || 'no response'}), retrying`);
      return false;
    }
    die(`The download returned HTTP ${res.status}. Batch collections stay downloadable for 16 days, real-time collections for 7. ${asText(res.body)}`.trim());
  }

  if (Array.isArray(res.body)) {
    if (res.body.length === 0) {
      die('Job finished but returned no records. Check the inputs, or the fails count in the job log.');
    }
    writeRecords(JSON.stringify(res.body, null, 2), res.body.length, outFile);
    return true;
  }

  if (res.body === null) {
    die('Job finished but returned no records. Check the inputs, or the fails count in the job log.');
  }

  if (typeof res.body === 'string') {
    // Not JSON, so it is raw record text such as NDJSON or CSV.
    if (!res.body.trim()) {
      note('records not ready yet');
      return false;
    }
    writeRecords(res.body, null, outFile);
    return true;
  }

  // A JSON object is a status envelope, not records.
  note(`${stateOf(res.body) || 'pending'}, records not ready`);
  return false;
}

// ---------------------------------------------------------------- main

async function main() {
  const { id, outFile, timeoutSec } = parseArgs(process.argv.slice(2));

  const key = readApiKey();
  if (!key) die('No API key found. Set BRIGHTDATA_API_KEY, or run: bdata login --device');

  const route = routeFor(id);
  log(`${C.dim}${route.kind}: ${id}${C.off}`);

  const deadline = Date.now() + timeoutSec * 1000;
  let attempt = 0;
  let last = '';

  // Only reprint when something actually changed, so long jobs stay readable.
  const note = line => {
    if (line !== last) {
      log(`${C.dim}  ${line}${C.off}`);
      last = line;
    }
  };

  for (;;) {
    if (Date.now() > deadline) {
      die(`Timed out after ${timeoutSec}s. The job may still be running. Re-run with a larger --timeout.`);
    }

    const res = await get(route.progress, key);

    if (res.status === 401) die('401 from the API. The key is invalid or revoked. Run: bdata login --device');
    if (res.status === 404) die(`404 for ${id}. Wrong id, wrong account, or the job has expired.`);
    if (!res.ok && !res.transient) {
      die(`HTTP ${res.status} while polling: ${asText(res.body)}`);
    }

    if (!res.ok) {
      // 5xx, 429 and network trouble are all normal on a busy job.
      note(`api busy (HTTP ${res.status || 'no response'}), retrying`);
    } else {
      const state = stateOf(res.body);
      if (RUNNING.includes(state)) {
        const rows = res.body?.records ?? res.body?.lines;
        note(`${state}${rows != null ? ` (${rows} records)` : ''}`);
      } else {
        // Not a running state, so let the download decide whether it is done.
        if (await download(route, key, outFile, note)) return;
      }
    }

    await sleep(waitMs(attempt++));
  }
}

try {
  await main();
} catch (e) {
  if (e instanceof Fail) {
    // Expected and already explained.
    log(`${C.bad}x ${e.message}${C.off}`);
    process.exitCode = e.code;
  } else {
    // A real bug, so show the stack rather than swallowing it.
    log(`${C.bad}x ${e?.stack ?? e}${C.off}`);
    process.exitCode = 1;
  }
}
