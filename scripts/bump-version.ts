import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(rootDir, relativePath), 'utf8'));
}

function writeJson(relativePath, data) {
  writeFileSync(resolve(rootDir, relativePath), `${JSON.stringify(data, null, 2)}\n`);
}

function readText(relativePath) {
  return readFileSync(resolve(rootDir, relativePath), 'utf8');
}

function writeText(relativePath, text) {
  writeFileSync(resolve(rootDir, relativePath), text);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function bumpPatch(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    fail(`Version "${version}" must use plain semver format like 1.2.3.`);
  }

  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

function replaceCargoVersion(text, nextVersion) {
  const lines = text.split(/\r?\n/);
  const packageStart = lines.findIndex((line) => line.trim() === '[package]');
  if (packageStart === -1) {
    fail('Missing [package] section in src-tauri/Cargo.toml.');
  }

  for (let index = packageStart + 1; index < lines.length; index += 1) {
    if (/^\s*\[/.test(lines[index])) {
      break;
    }
    if (/^\s*version\s*=/.test(lines[index])) {
      lines[index] = lines[index].replace(/version\s*=\s*"[^"]+"/, `version = "${nextVersion}"`);
      return lines.join('\n');
    }
  }

  fail('Missing package version in src-tauri/Cargo.toml.');
}

function replaceCargoLockVersion(text, nextVersion) {
  const packageHeader = text.match(/(^\[\[package\]\]\nname = "scribeflow"\nversion = )"[^"]+"/m);
  if (!packageHeader) {
    fail('Missing scribeflow package version in src-tauri/Cargo.lock.');
  }

  return text.replace(
    /(^\[\[package\]\]\nname = "scribeflow"\nversion = )"[^"]+"/m,
    `$1"${nextVersion}"`,
  );
}

const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');
const tauriConfig = readJson('src-tauri/tauri.conf.json');
const cargoToml = readText('src-tauri/Cargo.toml');
const cargoLock = readText('src-tauri/Cargo.lock');

const currentVersion = packageJson.version;
const expectedVersions = [
  ['package-lock.json', packageLock.version],
  ['package-lock.json packages[""]', packageLock.packages?.['']?.version],
  ['src-tauri/tauri.conf.json', tauriConfig.version],
];

for (const [source, version] of expectedVersions) {
  if (version !== currentVersion) {
    fail(`${source} is ${version}, but package.json is ${currentVersion}. Run release:check-version before bumping.`);
  }
}

const cargoVersion = cargoToml.match(/^\[package\][\s\S]*?^\s*version\s*=\s*"([^"]+)"/m)?.[1];
if (cargoVersion !== currentVersion) {
  fail(`src-tauri/Cargo.toml is ${cargoVersion}, but package.json is ${currentVersion}. Run release:check-version before bumping.`);
}

const cargoLockVersion = cargoLock.match(/^\[\[package\]\]\nname = "scribeflow"\nversion = "([^"]+)"/m)?.[1];
if (cargoLockVersion !== currentVersion) {
  fail(`src-tauri/Cargo.lock is ${cargoLockVersion}, but package.json is ${currentVersion}. Run release:check-version before bumping.`);
}

const nextVersion = bumpPatch(currentVersion);
packageJson.version = nextVersion;
packageLock.version = nextVersion;
packageLock.packages[''].version = nextVersion;
tauriConfig.version = nextVersion;
const nextCargoToml = replaceCargoVersion(cargoToml, nextVersion);
const nextCargoLock = replaceCargoLockVersion(cargoLock, nextVersion);

if (dryRun) {
  console.log(`ScribeFlow version would bump from ${currentVersion} to ${nextVersion}.`);
  process.exit(0);
}

writeJson('package.json', packageJson);
writeJson('package-lock.json', packageLock);
writeJson('src-tauri/tauri.conf.json', tauriConfig);
writeText('src-tauri/Cargo.toml', nextCargoToml);
writeText('src-tauri/Cargo.lock', nextCargoLock);

console.log(`ScribeFlow version bumped from ${currentVersion} to ${nextVersion}.`);
