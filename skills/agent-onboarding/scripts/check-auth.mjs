#!/usr/bin/env node
/**
 * check-auth.mjs - run first: probe the token, report the zones.
 *
 * The login success message is not proof, so this asks the API instead:
 *   GET /zone/get_active_zones  -> the key is real, and these zones exist
 *
 * Login creates cli_unlocker and cli_browser, but when that creation fails it
 * only warns and still exits 0. A "successful" login with one of them missing
 * is therefore the normal failure this script exists to catch.
 *
 * Spends no credits: one read-only listing call, the same one `bdata zones`
 * makes. Exits 1 on any failure, so it can gate a setup script.
 *
 * Usage:  node check-auth.mjs [--json]
 * Auth:   BRIGHTDATA_API_KEY env var, or the CLI's credentials.json.
 * --json: {ok, zones, missing, error} - zones is the active zone count,
 *         missing is the required zones that are absent, error is null when ok.
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
const NEEDED = ['cli_unlocker', 'cli_browser'];

const FIXES = [
  '  run:  bdata login               one browser approval (on headless: bdata login --device)',
  '  or:   set BRIGHTDATA_API_KEY    from the account settings page, for CI and containers',
  '  or:   no account yet?           register one by email: SKILL.md, "No account yet"',
];

/** Read JSON tolerating a UTF-8 BOM (Windows editors add one). */
const readJson = p => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));

const C = process.stdout.isTTY && !JSON_OUT
  ? { ok: '\x1b[32m', bad: '\x1b[31m', dim: '\x1b[90m', off: '\x1b[0m' }
  : { ok: '', bad: '', dim: '', off: '' };

/** Read the API key without ever printing it. Same order the CLI resolves it in. */
function readApiKey() {
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
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Zone names out of the listing, in either shape the API uses: a bare array, or
 * {zones: [...]}, each holding name strings or {name} objects.
 *
 * Returns null when the body is neither, which is a different fact from "no
 * zones" - an unreadable listing is no evidence that a zone is absent, so the
 * caller must not send the user back to login over it.
 */
const zoneNames = body => {
  const list = Array.isArray(body) ? body : Array.isArray(body?.zones) ? body.zones : null;
  return list && list.map(z => (typeof z === 'string' ? z : z?.name)).filter(Boolean);
};

/**
 * The whole check. Returns the report - never the key, and no field derived
 * from it, so the caller cannot print the secret by accident.
 */
async function check() {
  const key = readApiKey();
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
    return { ok: false, zones: null, missing: null, error: `network: ${e.message}`, lines: [
      `${C.bad}x could not reach ${API}${C.off}`,
      `  ${e.message} - the key was never checked, so this is not an auth failure`,
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

  const names = zoneNames(body);
  if (!names) {
    return { ok: false, zones: null, missing: null, error: 'unrecognized_response_shape', lines: [
      `${C.bad}x the API answered, but the shape of the zone listing was not understood${C.off}`,
      '  the listing could not be read, so it says nothing about your zones or your key',
      '  run this again, and report it if it keeps happening'] };
  }

  const missing = NEEDED.filter(n => !names.includes(n));
  if (missing.length) {
    return { ok: false, zones: names.length, missing, error: 'missing_zones', lines: [
      `${names.length} active zone${names.length === 1 ? '' : 's'}`,
      `${C.bad}x missing zone: ${missing.join(', ')}${C.off}`,
      '  the key itself works - do NOT run bdata login again, it silently replaces the stored key',
      '  create the missing zone with one free call instead:  POST https://api.brightdata.com/zone',
      '  body: {"zone":{"name":"cli_unlocker","type":"unblocker"},"plan":{"type":"unblocker"}}',
      '  (for cli_browser use "browser_api" as both type and plan)   then run this check again'] };
  }

  return { ok: true, zones: names.length, missing: [], error: null, lines: [
    `${names.length} active zone${names.length === 1 ? '' : 's'}`,
    `${C.dim}${NEEDED.join(' and ')} both present${C.off}`,
    `${C.ok}account ready${C.off}`] };
}

const { lines, ...result } = await check();

if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
else for (const l of lines) console.log(l);

// process.exitCode, never process.exit(): exiting while a fetch socket is
// still closing crashes Node on Windows (libuv assertion, exit 0xC0000409).
process.exitCode = result.ok ? 0 : 1;
