// Repo validation - run with: node --test tests/validate.mjs
// Checks structure, frontmatter, links, scripts, manifests, and alignment
// with the Bright Data CLI's skill registry. Zero dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = join(ROOT, 'skills');

// The full v2 skill set. Every folder under skills/ must be one of these,
// and every one of these must exist.
const SKILLS = [
  'agent-onboarding', 'billing', 'brightdata-cli', 'brightdata-mcp',
  'brightdata-sdk', 'browser', 'fetch', 'scrape', 'search',
];

// The names the Bright Data CLI's installer registry must resolve. Keep in
// sync with src/utils/skill-installer/brightdata-skills.ts in brightdata/cli.
// Until the CLI ships the v2 registry this equals SKILLS; if the CLI adds or
// renames entries, update this list to match that file.
const CLI_REGISTRY_NAMES = [
  'agent-onboarding', 'billing', 'brightdata-cli', 'brightdata-mcp',
  'brightdata-sdk', 'browser', 'fetch', 'scrape', 'search',
];

// Names removed in v2. Nothing that ships may reference them as a skill.
const REMOVED = [
  'brand-listening', 'brd-browser-debug', 'bright-data-best-practices',
  'bright-data-mcp', 'competitive-intel', 'data-feeds', 'design-mirror',
  'discover-api', 'js-sdk-best-practices', 'live-research',
  'price-comparison', 'proxy', 'python-sdk-best-practices', 'rag-pipeline',
  'scraper-builder', 'scraper-studio', 'seo-audit',
];

const walk = (dir) => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
};

const mdFiles = () => walk(SKILLS_DIR).filter(p => p.endsWith('.md'));
const mjsFiles = () => walk(SKILLS_DIR).filter(p => p.endsWith('.mjs'));
const read = (p) => readFileSync(p, 'utf8');

test('skills/ holds exactly the 9 v2 folders', () => {
  const folders = readdirSync(SKILLS_DIR)
    .filter(n => statSync(join(SKILLS_DIR, n)).isDirectory()).sort();
  assert.deepEqual(folders, [...SKILLS].sort());
});

test('every skill has SKILL.md with frontmatter name matching the folder and a description', () => {
  for (const skill of SKILLS) {
    const p = join(SKILLS_DIR, skill, 'SKILL.md');
    assert.ok(existsSync(p), `${skill}/SKILL.md missing`);
    const text = read(p);
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(fm, `${skill}/SKILL.md has no frontmatter`);
    const name = fm[1].match(/^name:\s*(\S+)\s*$/m);
    assert.ok(name, `${skill}: frontmatter has no name`);
    assert.equal(name[1], skill, `${skill}: frontmatter name is "${name[1]}"`);
    assert.match(fm[1], /^description:\s*\S/m, `${skill}: no description`);
  }
});

test('CLI registry alignment: every registry name resolves to a SKILL.md', () => {
  for (const name of CLI_REGISTRY_NAMES) {
    const p = join(SKILLS_DIR, name, 'SKILL.md');
    assert.ok(existsSync(p), `CLI registry name "${name}" has no skills/${name}/SKILL.md - bdata skill add would fail`);
    assert.ok(read(p).trim().length > 0, `skills/${name}/SKILL.md is empty`);
  }
});

test('CLI installer simulation: every skill folder walk yields SKILL.md plus non-empty files', () => {
  // Mirrors fetch_skill_files in the CLI: recursive walk, every file downloaded.
  for (const skill of SKILLS) {
    const files = walk(join(SKILLS_DIR, skill));
    assert.ok(files.some(f => f.endsWith('SKILL.md')), `${skill}: walk found no SKILL.md`);
    for (const f of files)
      assert.ok(statSync(f).size > 0, `${skill}: empty file would install: ${f}`);
  }
});

test('marketplace.json and plugin.json are valid and point at this repo layout', () => {
  const plugin = JSON.parse(read(join(ROOT, '.claude-plugin', 'plugin.json')));
  const market = JSON.parse(read(join(ROOT, '.claude-plugin', 'marketplace.json')));
  assert.equal(plugin.skills, './skills/');
  assert.ok(Array.isArray(market.plugins) && market.plugins.length === 1);
  for (const name of REMOVED) {
    assert.ok(!plugin.description.includes(name), `plugin.json mentions removed skill ${name}`);
    assert.ok(!market.plugins[0].description.includes(name), `marketplace.json mentions removed skill ${name}`);
  }
});

test('every relative link and local path in every md resolves', () => {
  const linkRe = /\]\(([^)#\s]+)(?:#[^)\s]*)?\)/g;
  for (const p of mdFiles()) {
    const text = read(p);
    for (const m of text.matchAll(linkRe)) {
      const target = m[1];
      if (/^[a-z]+:/i.test(target)) continue; // absolute URL
      const full = resolve(dirname(p), target);
      assert.ok(existsSync(full), `${p}: broken link -> ${target}`);
    }
  }
});

test('no shipped file references a removed skill by its skill name', () => {
  // Word-boundary match; "scraper-studio.md" the FILE inside scrape/references
  // is allowed - only cross-skill references like "the scraper-studio skill"
  // or skills/<removed> paths are errors.
  const allowed = /scraper-studio(\.md|\))/;
  for (const p of [...mdFiles(), join(ROOT, 'README.md')]) {
    const text = read(p);
    for (const name of REMOVED) {
      const re = new RegExp(`skills/${name}\\b|\\b${name} skill\\b|bdata skill add ${name}\\b`);
      const hit = text.match(re);
      if (hit && name === 'scraper-studio' && allowed.test(hit[0])) continue;
      assert.ok(!hit, `${p}: references removed skill "${name}" (${hit && hit[0]})`);
    }
  }
});

test('every .mjs under skills/ passes node --check', () => {
  for (const p of mjsFiles())
    execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' });
});

test('no em dash and no CRLF in shipped skill files', () => {
  for (const p of [...mdFiles(), ...mjsFiles(), join(ROOT, 'README.md')]) {
    const text = read(p);
    assert.ok(!text.includes('—'), `${p}: contains an em dash`);
    assert.ok(!text.includes('\r\n'), `${p}: contains CRLF line endings`);
  }
});

test('no credential-looking strings in shipped files', () => {
  const bad = /(api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]{20,})|(Bearer\s+[A-Za-z0-9]{20,})/;
  for (const p of [...mdFiles(), ...mjsFiles()]) {
    assert.ok(!bad.test(read(p)), `${p}: credential-looking string`);
  }
});
