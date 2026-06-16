#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_SECRET_SCAN_EXCLUDES = new Set([
  '.git',
  '.cache',
  '__tests__',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release',
  'vendor',
]);
const BINARY_EXTENSIONS = new Set([
  '.7z',
  '.asar',
  '.avi',
  '.bin',
  '.br',
  '.dll',
  '.dmg',
  '.exe',
  '.gif',
  '.gz',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mkv',
  '.mov',
  '.mp4',
  '.node',
  '.pdf',
  '.png',
  '.rar',
  '.ttf',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
]);

const SECRET_PATTERNS = [
  { type: 'Google API key', pattern: /AIza[0-9A-Za-z_-]{35}/g },
  { type: 'Gemini API key', pattern: /\b(?:GEMINI_API_KEY|GOOGLE_API_KEY)\b\s*[:=]\s*['"]?([A-Za-z0-9_-]{20,})/gi, valueGroup: 1 },
  { type: 'OpenAI API key', pattern: /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}/g },
  { type: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { type: 'Bearer token', pattern: /\bBearer\s+([A-Za-z0-9._~+/=-]{20,})/gi },
  { type: 'private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function isEnvFile(filePath) {
  const name = path.basename(filePath);
  return name === '.env' || (/^\.env\./.test(name) && name !== '.env.example');
}

/**
 * @param {string} filePath
 * @param {string} cwd
 * @returns {boolean}
 */
function shouldIgnorePath(filePath, cwd) {
  const relativeParts = path.relative(cwd, filePath).split(path.sep).filter(Boolean);
  if (relativeParts.some(part => DEFAULT_SECRET_SCAN_EXCLUDES.has(part))) return true;
  if (BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return true;
  return false;
}

/**
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function isBinaryBuffer(buffer) {
  const sampleLength = Math.min(buffer.length, 4096);
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}

/**
 * @param {string} root
 * @param {string} cwd
 * @returns {Array<string>}
 */
function listFiles(root, cwd) {
  const absoluteRoot = path.resolve(cwd, root);
  if (!fs.existsSync(absoluteRoot) || shouldIgnorePath(absoluteRoot, cwd)) return [];
  const stat = fs.statSync(absoluteRoot);
  if (stat.isFile()) return [absoluteRoot];
  if (!stat.isDirectory()) return [];

  return fs.readdirSync(absoluteRoot).flatMap((name) => {
    const fullPath = path.join(absoluteRoot, name);
    if (shouldIgnorePath(fullPath, cwd)) return [];
    const entryStat = fs.statSync(fullPath);
    if (entryStat.isDirectory()) return listFiles(fullPath, cwd);
    return entryStat.isFile() ? [fullPath] : [];
  });
}

/**
 * @param {string} cwd
 * @returns {Array<string>}
 */
function listGitTrackedAndUnignoredFiles(cwd) {
  try {
    const output = execFileSync('git', ['-C', cwd, 'ls-files', '--cached', '--others', '--exclude-standard'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split(/\r?\n/)
      .map(file => file.trim())
      .filter(Boolean)
      .map(file => path.resolve(cwd, file))
      .filter(file => fs.existsSync(file) && fs.statSync(file).isFile() && !shouldIgnorePath(file, cwd));
  } catch {
    return [];
  }
}

/**
 * @param {string} cwd
 * @returns {Array<string>}
 */
function listDefaultFiles(cwd) {
  const gitFiles = listGitTrackedAndUnignoredFiles(cwd);
  if (gitFiles.length > 0) return gitFiles;
  return ['src', 'server', 'scripts', 'build', 'package.json', 'package-lock.json', '.env', '.env.local']
    .flatMap(root => listFiles(root, cwd));
}

/**
 * @param {string} filePath
 * @param {string} cwd
 * @returns {Array<{file: string, line: number, type: string, value: string}>}
 */
function scanFile(filePath, cwd) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_TEXT_FILE_BYTES) return [];

  const buffer = fs.readFileSync(filePath);
  if (isBinaryBuffer(buffer)) return [];

  const findings = [];
  if (isEnvFile(filePath)) {
    findings.push({ file: filePath, line: 1, type: 'env file', value: path.basename(filePath) });
  }

  const lines = buffer.toString('utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    SECRET_PATTERNS.forEach(({ type, pattern, valueGroup = 0 }) => {
      pattern.lastIndex = 0;
      let match = pattern.exec(line);
      while (match) {
        findings.push({
          file: filePath,
          line: index + 1,
          type,
          value: match[valueGroup] || match[0],
        });
        match = pattern.exec(line);
      }
    });
  });

  return findings;
}

/**
 * @param {{roots?: Array<string>, cwd?: string}} [options]
 * @returns {Array<{file: string, line: number, type: string, value: string}>}
 */
function scanForSecrets(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const roots = Array.isArray(options.roots) && options.roots.length > 0 ? options.roots : null;
  const files = roots
    ? roots.flatMap(root => listFiles(root, cwd))
    : listDefaultFiles(cwd);

  return [...new Set(files)]
    .filter(file => !shouldIgnorePath(file, cwd))
    .flatMap(file => scanFile(file, cwd));
}

/**
 * @param {string|null|undefined} value
 * @returns {string}
 */
function redactSecretValue(value) {
  return value ? '[REDACTED]' : '';
}

/**
 * @param {Array<{file: string, line: number, type: string, value: string}>} findings
 * @param {{cwd?: string}} [options]
 * @returns {string}
 */
function formatFindings(findings, options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  if (!findings.length) return 'Secret scan passed.';
  return [
    'Secret scan failed:',
    ...findings.map((finding) => {
      const relativeFile = path.relative(cwd, finding.file).split(path.sep).join('/');
      return `- ${relativeFile}:${finding.line}: ${finding.type} ${redactSecretValue(finding.value)}`.trim();
    }),
  ].join('\n');
}

if (require.main === module) {
  const findings = scanForSecrets({ roots: process.argv.slice(2), cwd: process.cwd() });
  if (findings.length > 0) {
    console.error(formatFindings(findings));
    process.exit(1);
  }
  console.info('Secret scan passed.');
}

module.exports = {
  DEFAULT_SECRET_SCAN_EXCLUDES,
  formatFindings,
  redactSecretValue,
  scanForSecrets,
};
