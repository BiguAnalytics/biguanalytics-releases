import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const readStylesheet = (name) => readFileSync(
  resolve(process.cwd(), 'src/styles/components', name),
  'utf8',
);

const layout = readFileSync(resolve(process.cwd(), 'src/styles/layout.css'), 'utf8');

describe('light theme component contrast contract', () => {
  const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
  const theme = readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf8');
  const matchCard = readStylesheet('match-card.css');
  const videoPlayer = readStylesheet('video-player.css');

  it('keeps the dark-mode brand gradients in the light token set', () => {
    const lightTokens = tokens.slice(tokens.indexOf(':root[data-theme="light"]'));

    expect(lightTokens).toContain(
      '--gradient-brand-text:  linear-gradient(110deg, #E15A6B 0%, #DDE7F4 34%, #4F79AE 68%, #C8102E 100%);',
    );
    expect(lightTokens).toContain(
      '--gradient-brand:       linear-gradient(110deg, #C8102E 0%, #26405F 48%, #C8102E 100%);',
    );
  });

  it('uses white text inside light-mode gradient controls', () => {
    expect(theme).toMatch(
      /:root\[data-theme="light"\] \.btn-primary,[\s\S]*color: var\(--color-brand-white\);/,
    );
    expect(theme).toMatch(
      /:root\[data-theme="light"\] \.video-play-btn\s*{[\s\S]*color: var\(--color-brand-white\);/,
    );
  });

  it('keeps the startup wordmark and active sidebar indicator readable', () => {
    expect(theme).toMatch(
      /:root\[data-theme="light"\] \.bigu-startup-wordmark\s*{[\s\S]*color: var\(--color-text-primary\);/,
    );
    expect(theme).toMatch(
      /:root\[data-theme="light"\] \.sidebar-active-indicator::before\s*{[\s\S]*background: var\(--color-brand-white\);/,
    );
  });

  it('uses the brand gradient without the pale text stop for app and user names', () => {
    expect(theme).toMatch(
      /:root\[data-theme="light"\] \.home-welcome span,[\s\S]*:root\[data-theme="light"\] \.access-brand-name span\s*{[\s\S]*background: var\(--gradient-brand\);/,
    );
    expect(theme).toMatch(
      /:root\[data-theme="light"\] \.topbar-logo-text \.accent,[\s\S]*:root\[data-theme="light"\] \.sidebar-profile-name[\s\S]*background: var\(--gradient-brand\);/,
    );
  });

  it('keeps match status colors while ending light-mode card thumbnails on a light surface', () => {
    expect(matchCard).toMatch(
      /:root\[data-theme="light"\] \.match-card\.win \.match-card-thumbnail[\s\S]*linear-gradient\(180deg,[\s\S]*#f8fafc/s,
    );
    expect(matchCard).toMatch(
      /:root\[data-theme="light"\] \.match-card\.loss \.match-card-thumbnail[\s\S]*linear-gradient\(180deg,[\s\S]*#f8fafc/s,
    );
    expect(theme).not.toMatch(
      /:root\[data-theme="light"\] \.match-card-thumbnail[\s\S]*rgba\(16, 26, 42, 0\.94\)/,
    );
  });

  it('keeps light-mode gradient buttons readable with white labels', () => {
    const dashboard = readStylesheet('dashboard.css');
    const drawingEditor = readStylesheet('drawing-editor.css');
    const tacticalBoard = readStylesheet('tactical-board.css');

    expect(theme).toMatch(
      /:root\[data-theme="light"\] \.btn-primary,[\s\S]*color: var\(--color-brand-white\);/,
    );
    expect(dashboard).toMatch(
      /:root\[data-theme="light"\] \.dashboard-view \.dashboard-ai-button\.primary\s*{[\s\S]*color: (?:var\(--color-brand-white\)|#fff);/i,
    );
    expect(drawingEditor).toMatch(
      /:root\[data-theme="light"\] \.drawing-action-btn\.primary\s*{[\s\S]*color: var\(--color-brand-white\);/,
    );
    expect(tacticalBoard).toMatch(
      /:root\[data-theme="light"\] \.tactical-new-sequence-btn,[\s\S]*:root\[data-theme="light"\] \.tactical-play-btn[\s\S]*color: var\(--color-brand-white\);/,
    );
  });

  it('gives the match edit pencil and tagging scoreboard a clean light treatment', () => {
    expect(videoPlayer).toMatch(
      /:root\[data-theme="light"\] \.tagging-match-edit-button\s*{[\s\S]*background: #[0-9a-f]+;[\s\S]*color: var\(--color-text-primary\);/i,
    );
    expect(videoPlayer).toMatch(
      /:root\[data-theme="light"\] \.status-score-card\s*{[\s\S]*background: var\(--gradient-surface\);[\s\S]*border-color: var\(--color-border-strong\);/,
    );
  });

  it('gives media and editing surfaces an explicit light-mode treatment', () => {
    const styles = {
      clipPlayer: readStylesheet('clip-player.css'),
      videoPlayer: readStylesheet('video-player.css'),
      pdfEditor: readStylesheet('pdf-template-editor.css'),
      season: readStylesheet('season.css'),
      hotkeys: readStylesheet('hotkey-bar.css'),
      modal: readStylesheet('modal.css'),
    };

    expect(styles.clipPlayer).toMatch(/:root\[data-theme="light"\][\s\S]*\.clip-player-view/);
    expect(styles.videoPlayer).toMatch(/:root\[data-theme="light"\][\s\S]*\.video-controls/);
    expect(styles.pdfEditor).toMatch(/:root\[data-theme="light"\][\s\S]*\.pdf-template-editor-view/);
    expect(styles.season).toMatch(/:root\[data-theme="light"\][\s\S]*\.season-view/);
    expect(styles.hotkeys).toMatch(/:root\[data-theme="light"\][\s\S]*\.hotkey-bar/);
    expect(styles.modal).toMatch(/:root\[data-theme="light"\][\s\S]*\.modal-container/);
  });

  it('keeps light settings controls white and native selects free of repeated arrows', () => {
    expect(theme).toMatch(
      /:root\[data-theme="light"\] \.settings-subsection-link,[\s\S]*background: var\(--color-bg-surface\);/,
    );
    expect(theme).toMatch(
      /:root\[data-theme="light"\] \.settings-microphone-card,[\s\S]*:root\[data-theme="light"\] \.settings-ai-card,[\s\S]*background: var\(--color-bg-surface\);/,
    );
    expect(theme).toMatch(
      /:root\[data-theme="light"\] \.settings-ai-test,[\s\S]*background: var\(--color-bg-surface\);/,
    );
    expect(theme).toMatch(
      /:root\[data-theme="light"\] \.form-select,[\s\S]*appearance: auto;[\s\S]*background-image: none;[\s\S]*color-scheme: light;/,
    );
    expect(theme).toMatch(
      /:root\[data-theme="light"\] \.form-select\.settings-microphone-select,[^}]*appearance: auto;[^}]*background-image: none;/,
    );
    expect(theme).toMatch(
      /:root\[data-theme="light"\] \.form-select\.settings-microphone-select option\s*{[\s\S]*background-color: var\(--color-bg-surface\);[\s\S]*color: var\(--color-text-primary\);/,
    );
    expect(layout).toContain('.form-select.settings-microphone-select option');
  });

  it('keeps sensitive account actions visibly red in light mode', () => {
    expect(theme).toMatch(
      /:root\[data-theme="light"\] \.settings-account-danger\s*{[\s\S]*border-color: var\(--color-border-accent\);[\s\S]*background: var\(--color-accent-muted\);/,
    );
    expect(theme).toMatch(
      /:root\[data-theme="light"\] \.settings-account-button\s*{[\s\S]*border-color: var\(--color-border-accent\);[\s\S]*background: rgba\(200, 16, 46, 0\.09\);/,
    );
    expect(theme).toMatch(
      /:root\[data-theme="light"\] \.settings-account-delete\s*{[\s\S]*background: rgba\(200, 16, 46, 0\.16\);/,
    );
  });

  it('keeps the light sidebar selection marker white over the brand gradient', () => {
    expect(theme).toMatch(
      /:root\[data-theme="light"\] \.sidebar-active-indicator::before\s*{[\s\S]*background: var\(--color-brand-white\);/,
    );
  });
});
