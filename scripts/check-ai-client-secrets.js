#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const roots = process.argv.slice(2);
const targets = roots.length > 0
  ? roots
  : ['src/main', 'src/renderer', 'build'];

const dangerousPatterns = [
  { name: 'GEMINI_API_KEY', pattern: /GEMINI_API_KEY/g },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', pattern: /SUPABASE_SERVICE_ROLE_KEY/g },
  { name: 'Supabase secret key', pattern: /sb_secret_[0-9A-Za-z_-]{20,}/g },
  { name: '.env.local', pattern: /\.env\.local/g },
  { name: '.env.production', pattern: /\.env\.production/g },
  { name: '@google/genai', pattern: /@google\/genai/g },
  { name: 'generativelanguage.googleapis.com', pattern: /generativelanguage\.googleapis\.com/g },
  { name: 'Google AI direct API URL', pattern: /ai\.google\.dev\/gemini-api/g },
  { name: 'Google API key', pattern: /AIzaSy[0-9A-Za-z_-]{25,}/g },
  { name: 'OpenAI-style API key', pattern: /sk-(?:proj|live|test|ant|or-v1)-[A-Za-z0-9_-]{20,}/g },
];

const ignoredParts = new Set(['__tests__', 'vendor']);
function shouldIgnore(filePath) {
  return filePath.split(path.sep).some(part => ignoredParts.has(part));
}

function listFiles(root) {
  const absoluteRoot = path.resolve(root);
  if (!fs.existsSync(absoluteRoot)) return [];
  const stat = fs.statSync(absoluteRoot);
  if (stat.isFile()) return [absoluteRoot];
  return fs.readdirSync(absoluteRoot).flatMap((name) => {
    const fullPath = path.join(absoluteRoot, name);
    if (shouldIgnore(fullPath)) return [];
    const entryStat = fs.statSync(fullPath);
    if (entryStat.isDirectory()) return listFiles(fullPath);
    return [fullPath];
  });
}

const findings = [];

targets.flatMap(listFiles).forEach((filePath) => {
  const content = fs.readFileSync(filePath).toString('latin1');
  dangerousPatterns.forEach(({ name, pattern }) => {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      findings.push(`${path.relative(process.cwd(), filePath)}: ${name}`);
    }
  });
});

if (findings.length > 0) {
  console.error('AI client secret scan failed:');
  findings.forEach(finding => console.error(`- ${finding}`));
  process.exit(1);
}

console.info('AI client secret scan passed.');
