import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = process.env.GITHUB_OUTPUT;
const summaryPath = process.env.GITHUB_STEP_SUMMARY;

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(rootDir, relativePath), 'utf8'));
}

function readText(relativePath) {
  return readFileSync(resolve(rootDir, relativePath), 'utf8');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseCargoPackageVersion() {
  const cargoToml = readText('src-tauri/Cargo.toml');
  const lines = cargoToml.split(/\r?\n/);
  const packageStart = lines.findIndex((line) => line.trim() === '[package]');
  if (packageStart === -1) {
    fail('Missing [package] section in src-tauri/Cargo.toml.');
  }

  const packageLines = [];
  for (const line of lines.slice(packageStart + 1)) {
    if (/^\s*\[/.test(line)) {
      break;
    }
    packageLines.push(line);
  }

  const version = packageLines.join('\n').match(/^\s*version\s*=\s*"([^"]+)"\s*$/m);
  if (!version) {
    fail('Missing package version in src-tauri/Cargo.toml.');
  }

  return version[1];
}

function parseCargoLockVersion() {
  const cargoLock = readText('src-tauri/Cargo.lock');
  const version = cargoLock.match(/^\[\[package\]\]\nname = "scribeflow"\nversion = "([^"]+)"/m);
  if (!version) {
    fail('Missing scribeflow package version in src-tauri/Cargo.lock.');
  }

  return version[1];
}

function previousPackageVersion(beforeSha) {
  try {
    const previousPackage = execFileSync('git', ['show', `${beforeSha}:package.json`], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(previousPackage).version;
  } catch {
    return null;
  }
}

function releaseExists(tag) {
  if (!process.env.GITHUB_REPOSITORY || !(process.env.GH_TOKEN || process.env.GITHUB_TOKEN)) {
    return false;
  }

  try {
    execFileSync('gh', ['release', 'view', tag, '--repo', process.env.GITHUB_REPOSITORY], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

function writeGithubOutput(values) {
  if (!outputPath) {
    return;
  }

  const lines = Object.entries(values).map(([key, value]) => {
    const normalized = String(value).replaceAll('\n', ' ');
    return `${key}=${normalized}`;
  });
  appendFileSync(outputPath, `${lines.join('\n')}\n`);
}

function writeGithubSummary(values) {
  if (!summaryPath) {
    return;
  }

  appendFileSync(
    summaryPath,
    [
      '## Release version check',
      '',
      `- Version: \`${values.version}\``,
      `- Tag: \`${values.tag}\``,
      `- Publish: \`${values.publish}\``,
      `- Reason: ${values.reason}`,
      '',
    ].join('\n'),
  );
}

const packageVersion = readJson('package.json').version;
const packageLockVersion = readJson('package-lock.json').version;
const packageLockRootVersion = readJson('package-lock.json').packages?.['']?.version;
const tauriVersion = readJson('src-tauri/tauri.conf.json').version;
const cargoVersion = parseCargoPackageVersion();
const cargoLockVersion = parseCargoLockVersion();

const versions = {
  'package.json': packageVersion,
  'package-lock.json': packageLockVersion,
  'package-lock.json packages[""]': packageLockRootVersion,
  'src-tauri/tauri.conf.json': tauriVersion,
  'src-tauri/Cargo.toml': cargoVersion,
  'src-tauri/Cargo.lock': cargoLockVersion,
};

const missing = Object.entries(versions).filter(([, version]) => !version);
if (missing.length > 0) {
  fail(`Missing version values: ${missing.map(([source]) => source).join(', ')}`);
}

const uniqueVersions = new Set(Object.values(versions));
if (uniqueVersions.size !== 1) {
  fail(
    [
      'Release versions are not aligned:',
      ...Object.entries(versions).map(([source, version]) => `- ${source}: ${version}`),
    ].join('\n'),
  );
}

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(packageVersion)) {
  fail(`Version "${packageVersion}" must use semver format like 1.2.3.`);
}

const tag = `v${packageVersion}`;
let publish = true;
let reason = 'manual release check';

if (process.env.GITHUB_ACTIONS) {
  const eventName = process.env.GITHUB_EVENT_NAME;
  const beforeSha = process.env.GITHUB_EVENT_BEFORE;
  const allowExistingRelease = process.env.INPUT_ALLOW_EXISTING_RELEASE === 'true';

  if (eventName === 'push') {
    const previousVersion =
      beforeSha && !/^0+$/.test(beforeSha) ? previousPackageVersion(beforeSha) : null;

    if (previousVersion === packageVersion) {
      publish = false;
      reason = `package version stayed at ${packageVersion}`;
    } else if (previousVersion) {
      reason = `package version changed from ${previousVersion} to ${packageVersion}`;
    } else {
      reason = `no previous package version found; treating ${packageVersion} as releasable`;
    }
  } else if (eventName === 'workflow_dispatch') {
    reason = 'manual workflow dispatch';
  } else {
    publish = false;
    reason = `unsupported event ${eventName}`;
  }

  if (publish && releaseExists(tag) && !allowExistingRelease) {
    publish = false;
    reason = `release ${tag} already exists`;
  }
}

const result = {
  version: packageVersion,
  tag,
  publish: publish ? 'true' : 'false',
  reason,
};

console.log(`ScribeFlow release version: ${result.version}`);
console.log(`Release tag: ${result.tag}`);
console.log(`Publish: ${result.publish}`);
console.log(`Reason: ${result.reason}`);

writeGithubOutput(result);
writeGithubSummary(result);
