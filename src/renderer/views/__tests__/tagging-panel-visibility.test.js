import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const taggingSource = readFileSync(resolve(root, 'src/renderer/views/tagging.js'), 'utf8');
const videoPlayerCss = readFileSync(resolve(root, 'src/styles/components/video-player.css'), 'utf8');
const tokensCss = readFileSync(resolve(root, 'src/styles/tokens.css'), 'utf8');

describe('tagging side-panel visibility contract', () => {
  it('uses one explicit panel mode and unmounts inactive surfaces', () => {
    expect(taggingSource).toContain('data-panel-mode');
    expect(taggingSource).toContain('data-panel-surface="status"');
    expect(taggingSource).toContain('data-panel-surface="tag-popup"');
    expect(taggingSource).toContain('data-panel-surface="sequence"');
    expect(taggingSource).toContain('data-panel-surface="inspector"');
    expect(taggingSource).toContain('surface.hidden = !isActive;');
    expect(taggingSource).toContain('if (!isActive) surface.replaceChildren();');
  });

  it('uses hidden as the sole visibility gate and removes the old overlapping selectors', () => {
    expect(videoPlayerCss).toContain('.tagging-side-panel [hidden]');
    expect(videoPlayerCss).toContain('display: none !important;');
    expect(videoPlayerCss).not.toContain('.tagging-side-panel.has-active-popup .tagging-status-panel');
    expect(videoPlayerCss).not.toContain('.tagging-side-panel.has-event-inspector .tagging-status-panel');
    expect(videoPlayerCss).not.toContain('.tagging-side-panel.has-active-popup .tag-popup-host');
    expect(videoPlayerCss).not.toContain('.tagging-side-panel.has-event-inspector .event-inspector-host');
  });

  it('declares the z-index layers used by panel surfaces', () => {
    expect(tokensCss).toContain('--z-panel-surface: 20;');
    expect(tokensCss).toMatch(/--z-overlay:\s+1000;/);
    expect(videoPlayerCss).toContain('z-index: var(--z-panel-surface);');
  });
});
