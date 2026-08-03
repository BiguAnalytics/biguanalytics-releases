import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const appSource = readFileSync(resolve(root, 'src/renderer/app.js'), 'utf8');
const homeSource = readFileSync(resolve(root, 'src/renderer/views/home.js'), 'utf8');
const formSource = readFileSync(resolve(root, 'src/renderer/components/new-match-form.js'), 'utf8');
const taggingSource = readFileSync(resolve(root, 'src/renderer/views/tagging.js'), 'utf8');
const baseCss = readFileSync(resolve(root, 'src/styles/base.css'), 'utf8');
const layoutCss = readFileSync(resolve(root, 'src/styles/layout.css'), 'utf8');
const videoPlayerCss = readFileSync(resolve(root, 'src/styles/components/video-player.css'), 'utf8');

describe('workflow feedback contract', () => {
  it('keeps startup progress visible while the shell and initial data become ready', () => {
    expect(appSource).toContain('bigu-startup-progress');
    expect(appSource).toContain('splash.dataset.startupStage');
    expect(appSource).toContain("setStartupSplashStatus(startupSplash, 'ACCESO LOCAL VERIFICADO')");
    expect(baseCss).toContain('.bigu-startup-progress');
    expect(baseCss).toContain('bigu-startup-progress-indicator');
  });

  it('uses an animated loading skeleton for the initial home match list', () => {
    expect(homeSource).toContain('home-loading-skeleton');
    expect(homeSource).toContain('home-loading-skeleton-card');
    expect(layoutCss).toContain('.home-loading-skeleton');
    expect(layoutCss).toContain('home-loading-skeleton-shimmer');
  });

  it('exposes an accessible busy state while a match is being created', () => {
    expect(formSource).toContain('match-form-status');
    expect(formSource).toContain("form.setAttribute('aria-busy', 'true')");
    expect(formSource).toContain("submitButton.classList.add('is-loading')");
    expect(formSource).toContain("submitButton.setAttribute('aria-busy', 'true')");
    expect(formSource).toContain('Validando video...');
  });

  it('renders the Tagging loading state and confirms event persistence without blocking the popup transition', () => {
    expect(taggingSource).toContain('tagging-loading-indicator');
    expect(taggingSource).toContain('tagging-save-status');
    expect(taggingSource).toContain('eventSaveState');
    expect(taggingSource).toContain('void persistTaggedEvent(result.event);');
    expect(taggingSource).not.toContain('await saveEvent(result.event);');
    expect(videoPlayerCss).toContain('.tagging-loading-indicator');
    expect(videoPlayerCss).toContain('.tagging-save-status');
  });
});
