import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/styles/components/video-player.css'), 'utf8');
const timelineCss = readFileSync(resolve(process.cwd(), 'src/styles/components/timeline.css'), 'utf8');
const baseCss = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

describe('video controls layout CSS', () => {
  it('keeps the scrubber constrained inside the fixed controls row', () => {
    expect(css).toMatch(/\.tagging-view\s*{[^}]*min-width:\s*0;/s);
    expect(css).toMatch(/\.tagging-main\s*{[^}]*min-width:\s*0;/s);
    expect(css).toMatch(/\.video-controls\s*{[^}]*grid-template-columns:\s*auto\s+auto\s+auto\s+minmax\(0,\s*1fr\)\s+max-content\s+92px;/s);
    expect(css).toMatch(/\.video-controls\s*{[^}]*min-width:\s*0;/s);
    expect(css).toMatch(/\.video-scrubber-wrap\s*{[^}]*min-width:\s*0;/s);
    expect(css).toMatch(/\.video-time-readout\s*{[^}]*white-space:\s*nowrap;/s);
    expect(timelineCss).toMatch(/\.timeline-host\s*{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(timelineCss).toMatch(/\.timeline-scroll\s*{[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*min-width:\s*0;/s);
  });

  it('replaces the browser default white focus outline on video controls', () => {
    expect(baseCss).toMatch(/button:focus\s*{[^}]*outline:\s*none;/s);
    expect(baseCss).toMatch(/button:focus-visible\s*{[^}]*box-shadow:\s*none;/s);
    expect(css).toMatch(/\.video-control-btn:focus,[\s\S]*\.video-speed:focus-visible\s*{[^}]*outline:\s*none;[^}]*box-shadow:\s*none;/s);
    expect(css).toMatch(/\.video-scrubber:focus,[\s\S]*\.video-scrubber:focus-visible\s*{[^}]*outline:\s*none;[^}]*box-shadow:\s*none;/s);
  });

  it('shows elapsed playback progress in red on the scrubber', () => {
    expect(css).toContain('--scrubber-progress');
    expect(css).toMatch(/\.video-scrubber::-webkit-slider-runnable-track\s*{[^}]*linear-gradient\(\s*90deg,/s);
  });

  it('uses explicit click/pointer handling for one-click scrubber seeks', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/views/tagging.js'), 'utf8');

    expect(source).toContain("scrubber?.addEventListener('pointerdown', seekFromScrubberPointer)");
    expect(source).toContain("scrubber?.addEventListener('click', seekFromScrubberPointer)");
    expect(source).toContain("scrubber?.addEventListener('change', () => seekTo(Number(scrubber.value)))");
  });
});
