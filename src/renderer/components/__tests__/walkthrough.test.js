import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  WALKTHROUGH_COMPLETED_FLAG,
  WALKTHROUGH_STEPS,
  buildWalkthroughCompletedSettings,
  buildWalkthroughResetSettings,
  getWalkthroughIdentityKey,
  getWalkthroughPopoverPosition,
  getWalkthroughScrollParents,
  getWalkthroughSpotlightRect,
  isWalkthroughEligible,
  resolveAvailableWalkthroughSteps,
} from '../walkthrough.js';

const activeAccess = {
  state: 'active',
  user: { id: 'user-1', email: 'analyst@bigua.test' },
  profile: {
    id: 'profile-1',
    email: 'analyst@bigua.test',
    profile_complete: true,
    status: 'approved',
  },
  device: { id: 'device-1', status: 'approved' },
};

const pendingDeviceAccess = {
  ...activeAccess,
  state: 'pending_device',
  device: { id: 'device-1', status: 'pending' },
};

const incompleteProfileAccess = {
  ...activeAccess,
  state: 'personal_info_required',
  profile: { id: 'profile-1', profile_complete: false },
};

function settingsFor(completedByIdentity = {}) {
  return {
    onboarding: {
      walkthrough: {
        v1: {
          completed: false,
          identityKey: '',
          completedByIdentity,
        },
      },
    },
  };
}

function createTarget(width = 80, height = 44) {
  return {
    hidden: false,
    getBoundingClientRect() {
      return { top: 20, left: 20, right: 20 + width, bottom: 20 + height, width, height };
    },
  };
}

describe('walkthrough first-use state', () => {
  it('builds a per-user and per-device identity key', () => {
    expect(getWalkthroughIdentityKey(activeAccess)).toBe('profile-1::device-1');
    expect(getWalkthroughIdentityKey({
      ...activeAccess,
      profile: { id: 'profile-2', profile_complete: true },
    })).toBe('profile-2::device-1');
    expect(getWalkthroughIdentityKey({
      ...activeAccess,
      device: { id: 'device-2', status: 'approved' },
    })).toBe('profile-1::device-2');
  });

  it('appears only on Home for an approved device, complete profile and incomplete identity flag', () => {
    expect(isWalkthroughEligible({
      accessState: activeAccess,
      settings: settingsFor(),
      route: 'home',
      homeReady: true,
    })).toBe(true);

    expect(isWalkthroughEligible({
      accessState: activeAccess,
      settings: settingsFor({ 'profile-1::device-1': true }),
      route: 'home',
      homeReady: true,
    })).toBe(false);

    expect(isWalkthroughEligible({
      accessState: activeAccess,
      settings: settingsFor(),
      route: 'settings',
      homeReady: true,
    })).toBe(false);

    expect(isWalkthroughEligible({
      accessState: pendingDeviceAccess,
      settings: settingsFor(),
      route: 'home',
      homeReady: true,
    })).toBe(false);

    expect(isWalkthroughEligible({
      accessState: incompleteProfileAccess,
      settings: settingsFor(),
      route: 'home',
      homeReady: true,
    })).toBe(false);
  });

  it('persists finish and skip as completed for the current identity and reset only clears that identity', () => {
    const completed = buildWalkthroughCompletedSettings(settingsFor(), activeAccess);

    expect(completed.onboarding.walkthrough.v1.completed).toBe(true);
    expect(completed.onboarding.walkthrough.v1.identityKey).toBe('profile-1::device-1');
    expect(completed.onboarding.walkthrough.v1.completedByIdentity['profile-1::device-1']).toBe(true);

    const reset = buildWalkthroughResetSettings(completed, activeAccess);

    expect(reset.onboarding.walkthrough.v1.completed).toBe(false);
    expect(reset.onboarding.walkthrough.v1.completedByIdentity['profile-1::device-1']).toBeUndefined();
  });
});

describe('walkthrough positioning and targets', () => {
  it('uses viewport coordinates for the fixed spotlight without duplicating scroll offsets', () => {
    const spotlight = getWalkthroughSpotlightRect(
      { top: 110, left: 42, right: 142, bottom: 154, width: 100, height: 44 },
      8,
      { width: 1280, height: 720 },
    );

    expect(spotlight).toEqual({
      top: 102,
      left: 34,
      width: 116,
      height: 60,
    });
  });

  it('detects scrollable parents so internal app scrolling can reposition the active target', () => {
    const windowListeners = [];
    const scrollParent = {
      parentElement: null,
      addEventListener: (...args) => windowListeners.push(args),
      removeEventListener() {},
    };
    const target = {
      parentElement: scrollParent,
      ownerDocument: {
        defaultView: {
          getComputedStyle(node) {
            return node === scrollParent
              ? { overflow: 'hidden', overflowX: 'hidden', overflowY: 'auto' }
              : { overflow: 'visible', overflowX: 'visible', overflowY: 'visible' };
          },
        },
        scrollingElement: null,
        documentElement: null,
        body: null,
      },
    };

    expect(getWalkthroughScrollParents(target)).toEqual([scrollParent]);
  });

  it('keeps the popover inside the viewport when the target is near an edge', () => {
    const position = getWalkthroughPopoverPosition(
      { top: 584, left: 820, right: 880, bottom: 628, width: 60, height: 44 },
      { width: 360, height: 220 },
      { width: 900, height: 640 },
    );

    expect(position.left).toBeGreaterThanOrEqual(16);
    expect(position.top).toBeGreaterThanOrEqual(16);
    expect(position.left + 360).toBeLessThanOrEqual(884);
    expect(position.top + 220).toBeLessThanOrEqual(624);
  });

  it('skips missing targets without throwing', async () => {
    const documentRef = {
      querySelector(selector) {
        if (selector === '[data-tour-id="sidebar-tagging"]') return createTarget();
        return null;
      },
    };

    const steps = await resolveAvailableWalkthroughSteps([
      { id: 'missing', targetIds: ['missing'], targetWaitMs: 0 },
      { id: 'tagging', targetIds: ['sidebar-tagging'], targetWaitMs: 0 },
    ], { documentRef, intervalMs: 1 });

    expect(steps.map(step => step.id)).toEqual(['tagging']);
  });

  it('defines a multi-step professional walkthrough', () => {
    expect(WALKTHROUGH_COMPLETED_FLAG).toBe('onboarding.walkthrough.v1.completed');
    expect(WALKTHROUGH_STEPS.map(step => step.id)).toEqual([
      'new-match',
      'sidebar-tagging',
      'sidebar-dashboard',
      'ai',
      'export-pdf',
      'settings',
    ]);
  });
});

describe('walkthrough renderer integration', () => {
  const appSource = readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
  const homeSource = readFileSync(new URL('../../views/home.js', import.meta.url), 'utf8');
  const sidebarSource = readFileSync(new URL('../sidebar.js', import.meta.url), 'utf8');
  const dashboardSource = readFileSync(new URL('../../views/dashboard.js', import.meta.url), 'utf8');
  const topbarSource = readFileSync(new URL('../topbar.js', import.meta.url), 'utf8');
  const settingsSource = readFileSync(new URL('../../views/settings.js', import.meta.url), 'utf8');
  const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

  it('mounts the walkthrough globally outside the Home render path', () => {
    expect(appSource).toContain("import { createWalkthroughController } from './components/walkthrough.js';");
    expect(appSource).toContain('createWalkthroughController');
    expect(homeSource).not.toContain('home-first-launch-tooltip');
    expect(homeSource).not.toContain('renderFirstLaunchHomeTooltip');
  });

  it('marks the real UI targets used by the walkthrough', () => {
    expect(homeSource).toContain('data-tour-id="new-match"');
    expect(sidebarSource).toContain("data-tour-id=\"${getSidebarTourId(item.id)}\"");
    expect(sidebarSource).toContain("tagging: 'sidebar-tagging'");
    expect(sidebarSource).toContain("dashboard: 'sidebar-dashboard'");
    expect(sidebarSource).toContain("settings: 'settings'");
    expect(dashboardSource).toContain('data-tour-id="ai-panel"');
    expect(topbarSource).toContain("export: 'export-pdf'");
  });

  it('exposes a reset action in Settings and loads walkthrough styles', () => {
    expect(settingsSource).toContain('Ver tutorial de nuevo');
    expect(settingsSource).toContain('data-walkthrough-restart');
    expect(settingsSource).toContain('bigu:walkthrough-restart');
    expect(indexHtml).toContain('../styles/components/walkthrough.css');
  });

  it('scrolls offscreen targets into view before measuring and then repositions after layout', () => {
    const walkthroughSource = readFileSync(new URL('../walkthrough.js', import.meta.url), 'utf8');

    expect(walkthroughSource).toContain('scrollWalkthroughTargetIntoView');
    expect(walkthroughSource).toContain("target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });");
    expect(walkthroughSource).toContain('const cleanupScrollParents = watchWalkthroughScrollParents');
    expect(walkthroughSource).toContain('schedulePosition();');
  });
});
