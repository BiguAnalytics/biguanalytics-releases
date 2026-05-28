import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/styles/components/video-player.css'), 'utf8');

describe('video player layout CSS', () => {
  it('keeps the video in the left column and the detail panel in its own right column', () => {
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) minmax(360px, 460px);');
    expect(css).toContain('.tagging-video-frame {\n  position: relative;\n  width: 100%;');
    expect(css).toMatch(/\.tagging-side-panel\s*{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/s);
    expect(css).not.toContain('.tagging-video-stage > .tag-popup-host {\n  position: absolute;');
  });

  it('defines explicit height through every ancestor of the YouTube iframe player', () => {
    expect(css).toMatch(/\.tagging-main\s*{[^}]*height:\s*100%;/s);
    expect(css).toMatch(/\.tagging-video-stage\s*{[^}]*height:\s*100%;/s);
    expect(css).toMatch(/\.tagging-video-frame\s*{[^}]*height:\s*100%;/s);
    expect(css).toMatch(/\.tagging-media-host\s*{[^}]*position:\s*absolute;[^}]*inset:\s*0;/s);
    expect(css).toMatch(/\.youtube-iframe-shell\s*{[^}]*position:\s*absolute;[^}]*inset:\s*0;/s);
    expect(css).toMatch(/\.youtube-player-frame\s*{[^}]*position:\s*absolute;[^}]*inset:\s*0;/s);
  });

  it('does not force a 16:9 aspect ratio on the YouTube iframe player', () => {
    expect(css).not.toMatch(/\.tagging-video-frame \.youtube-player-frame,\s*\.tagging-video-frame \.tagging-video\s*{[^}]*aspect-ratio:\s*16 \/ 9;/s);
    expect(css).toMatch(/\.tagging-video-frame \.tagging-video\s*{[^}]*aspect-ratio:\s*16 \/ 9;/s);
  });

  it('keeps the custom HUD above the iframe layer', () => {
    expect(css).toMatch(/\.tagging-video-frame\s*{[^}]*isolation:\s*isolate;/s);
    expect(css).toMatch(/\.tagging-media-host\s*{[^}]*z-index:\s*1;/s);
    expect(css).toMatch(/\.youtube-player-frame\s*{[^}]*z-index:\s*0;/s);
    expect(css).toMatch(/\.tagging-timecode\s*{[^}]*z-index:\s*20;/s);
  });

  it('keeps the fixed tagging chrome compact so the video stage receives vertical priority', () => {
    expect(css).toMatch(/\.tagging-view\s*{[^}]*--tagging-timeline-height:\s*clamp\(220px,\s*24vh,\s*280px\);[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s*var\(--tagging-timeline-height\)\s*40px;/s);
    expect(css).toMatch(/\.tagging-main\s*{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s*54px;[^}]*padding:\s*var\(--space-4\)\s*var\(--space-6\)\s*var\(--space-2\);/s);
    expect(css).toMatch(/\.tagging-video-stage\s*{[^}]*flex:\s*1;/s);
  });

  it('replaces the status inspector with popups inside the same right panel', () => {
    expect(css).toMatch(/\.tagging-side-panel\.has-active-popup\s+\.tagging-status-panel\s*{[^}]*display:\s*none;/s);
    expect(css).toMatch(/\.tagging-side-panel\.has-active-popup\s+\.tag-popup-host:not\(:empty\)\s*{[^}]*display:\s*flex;/s);
    expect(css).toMatch(/\.tagging-side-panel\s+\.tag-popup-host\s*{[^}]*display:\s*none;/s);
  });

  it('gives edit forms breathing room below the inspector header', () => {
    expect(css).toMatch(/\.event-inspector-form\s*{[^}]*padding:\s*var\(--space-3\)\s+var\(--space-4\)\s+var\(--space-3\);/s);
  });

  it('styles inspector zone pickers as compact rugby field selectors', () => {
    expect(css).toMatch(/\.event-inspector-zone-picker\s*{[^}]*grid-column:\s*1\s*\/\s*-1;/s);
    expect(css).toMatch(/\.event-inspector-field-grid\s*{[^}]*grid-template-columns:\s*repeat\(5,\s*1fr\);/s);
    expect(css).toMatch(/\.event-inspector-zone-cell\.active\s*{[^}]*background:\s*rgba\(200,\s*16,\s*46,\s*0\.28\);/s);
  });

  it('keeps the right status panel compact without a decorative scrollbar', () => {
    expect(css).toMatch(/\.tagging-status-panel\s*{[^}]*gap:\s*var\(--space-2\);[^}]*overflow-y:\s*hidden;[^}]*padding-bottom:\s*0;/s);
    expect(css).toMatch(/\.status-card\s*{[^}]*gap:\s*var\(--space-2\);[^}]*padding:\s*var\(--space-2\);/s);
  });

  it('styles the simplified manual score controls as a single scoreline', () => {
    expect(css).toMatch(/\.status-score-card\s*{[^}]*padding:\s*var\(--space-2\)\s+var\(--space-3\);/s);
    expect(css).toMatch(/\.scoreboard-compact\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\);/s);
    expect(css).toMatch(/\.scoreline\s*{[^}]*font:\s*900\s+24px\s+var\(--font-brand\);/s);
    expect(css).toMatch(/\.score-stepper button\s*{[^}]*min-width:\s*28px;[^}]*cursor:\s*pointer;/s);
  });

  it('keeps possession compact without duplicated detail rows or a second history strip', () => {
    expect(css).toMatch(/\.status-card-header strong\s*{[^}]*font:\s*900\s+16px\s+var\(--font-brand\);/s);
    expect(css).not.toContain('.possession-lines');
    expect(css).not.toContain('.possession-history-strip');
    expect(css).not.toContain('.possession-card');
  });

  it('styles the module entry selector as a focused selectable video grid', () => {
    expect(css).toMatch(/\.tagging-match-select-view\s*{[^}]*display:\s*grid;[^}]*overflow-y:\s*auto;/s);
    expect(css).toMatch(/\.tagging-match-select-grid\s*{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(260px,\s*1fr\)\);/s);
    expect(css).toMatch(/\.tagging-match-card\s*{[^}]*cursor:\s*pointer;[^}]*text-align:\s*left;/s);
    expect(css).toMatch(/\.tagging-match-card:focus,[\s\S]*\.tagging-match-card:focus-visible\s*{[^}]*outline:\s*none;/s);
  });
});
