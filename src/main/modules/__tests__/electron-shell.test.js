import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const mainSource = readFileSync(resolve(process.cwd(), 'src/main/main.js'), 'utf8');
const indexHtml = readFileSync(resolve(process.cwd(), 'src/renderer/index.html'), 'utf8');

describe('Electron shell YouTube integration', () => {
  it('does not enable Electron webview for the YouTube player path', () => {
    expect(mainSource).toContain('webviewTag: false');
    expect(mainSource).not.toContain('webviewTag: true');
  });

  it('allows the official YouTube iframe API through renderer CSP', () => {
    expect(indexHtml).toContain("script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com");
    expect(indexHtml).toContain('frame-src https://www.youtube.com https://www.youtube-nocookie.com');
    expect(indexHtml).toContain('name="referrer" content="strict-origin-when-cross-origin"');
  });
});
