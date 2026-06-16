import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const visibleFiles = [
  '../home.js',
  '../tagging.js',
  '../dashboard.js',
  '../../components/tag-popup.js',
  '../../components/modal.js',
];

describe('visible Spanish copy encoding', () => {
  it('does not contain common UTF-8 mojibake in touched visible UI files', () => {
    const mojibake = /Ã|Â|â€”|â€œ|â€\u009d|â€˜|â€™|�/;

    visibleFiles.forEach((file) => {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(mojibake);
    });
  });
});
