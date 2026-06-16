import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const serviceFiles = [
  '../supabase-client.js',
  '../auth-service.js',
  '../device-service.js',
  '../license-service.js',
].map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'));

describe('Supabase licensing locality', () => {
  it('does not import or read local sports data modules from Supabase services', () => {
    const combined = serviceFiles.join('\n');

    [
      /from ['"].*storage/i,
      /from ['"].*events/i,
      /from ['"].*analytics/i,
      /from ['"].*drawings/i,
      /match\.json/i,
    ].forEach((forbidden) => {
      expect(combined).not.toMatch(forbidden);
    });
  });
});
