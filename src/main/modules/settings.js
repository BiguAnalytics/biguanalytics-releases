// @ts-check
const DEFAULT_DASHBOARD_SECTIONS = [
  'set-pieces',
  'rucks',
  'discipline',
  'kicks',
  'break-lines',
  'custom-events',
  'possession',
  'bip',
  'sequences',
  'heatmap'
];

const DEFAULT_TAGGING_HOTKEYS = {
  ruck: 'R',
  scrum: 'S',
  lineout: 'L',
  penal: 'P',
  points: 'T',
  'break-line': 'B',
  kick: 'K',
  maul: 'M',
  turnover: 'V',
  card: 'A',
  note: 'N',
};

const DEFAULT_MICROPHONE_SETTINGS = {
  deviceId: '',
  label: 'Microfono predeterminado',
  language: 'es-AR',
};

const DEFAULT_ONBOARDING_SETTINGS = {
  walkthrough: {
    v1: {
      completed: false,
      identityKey: '',
      completedByIdentity: {},
    },
  },
};

const DEFAULT_SETTINGS = {
  theme: 'dark',
  autoSave: true,
  firstLaunch: true,
  onboarding: DEFAULT_ONBOARDING_SETTINGS,
  clipPreRollSeconds: 3,
  clipPostRollSeconds: 10,
  clipOutputModeDefault: 'separate',
  clipExportQuality: 'copy',
  alerts: {
    penaltiesThreshold: 10,
    turnoversThreshold: 15,
    ruckWinPctMin: 50,
    penaltiesMax: 15,
    lineoutWinPctMin: 40,
    scrumWinPctMin: 50,
    breakLinesConcededMax: 5
  },
  statsOnlyMode: false,
  microphone: DEFAULT_MICROPHONE_SETTINGS,
  tagging: {
    autoCloseMs: 8000,
    hotkeyHintsCollapsed: false,
    hotkeys: DEFAULT_TAGGING_HOTKEYS,
    customHotkeys: []
  },
  dashboard: {
    template: 'general',
    pdfTemplate: 'complete',
    selectedKpis: ['ruckWinPct', 'penalties', 'lineoutWinPct', 'breakLines'],
    sectionOrder: DEFAULT_DASHBOARD_SECTIONS,
    visibleSections: DEFAULT_DASHBOARD_SECTIONS,
    filters: {
      team: 'bigua',
      timeBand: 'all',
      zone: 'all'
    }
  },
  user: {
    name: 'Usuario',
    role: 'ANALISTA'
  }
};

let settingsRepository;

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @returns {number}
 */
function normalizeClipSeconds(value, fallback, min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min) return fallback;
  return Math.min(60, Math.round(numeric));
}

/**
 * @param {unknown} value
 * @returns {'separate'}
 */
function normalizeClipOutputMode(value) {
  return value === 'separate' ? 'separate' : DEFAULT_SETTINGS.clipOutputModeDefault;
}

/**
 * @param {unknown} value
 * @returns {'copy'|'reencode'}
 */
function normalizeClipExportQuality(value) {
  return value === 'reencode' ? 'reencode' : DEFAULT_SETTINGS.clipExportQuality;
}

/**
 * Parses electron-store JSON while tolerating BOM bytes saved by external editors.
 * @param {string} text
 * @returns {object}
 */
function parseSettingsStoreJson(text) {
  return JSON.parse(String(text).replace(/^\uFEFF|^ï»¿|^∩╗┐/, ''));
}

/**
 * @param {unknown} value
 * @returns {Record<string, boolean>}
 */
function normalizeCompletedByIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce((entries, [key, completed]) => {
    if (typeof key === 'string' && key.trim() && completed === true) entries[key] = true;
    return entries;
  }, {});
}

/**
 * @param {object} [onboarding]
 * @returns {object}
 */
function mergeOnboardingSettings(onboarding = {}) {
  const walkthrough = onboarding.walkthrough || {};
  const v1 = walkthrough.v1 || {};
  return {
    ...DEFAULT_ONBOARDING_SETTINGS,
    ...onboarding,
    walkthrough: {
      ...DEFAULT_ONBOARDING_SETTINGS.walkthrough,
      ...walkthrough,
      v1: {
        ...DEFAULT_ONBOARDING_SETTINGS.walkthrough.v1,
        ...v1,
        completed: typeof v1.completed === 'boolean' ? v1.completed : DEFAULT_ONBOARDING_SETTINGS.walkthrough.v1.completed,
        identityKey: typeof v1.identityKey === 'string' ? v1.identityKey : DEFAULT_ONBOARDING_SETTINGS.walkthrough.v1.identityKey,
        completedByIdentity: normalizeCompletedByIdentity(v1.completedByIdentity),
      },
    },
  };
}

/**
 * @param {object} current
 * @param {object} partial
 * @returns {object}
 */
function mergeOnboardingUpdate(current = {}, partial = {}) {
  return mergeOnboardingSettings({
    ...current,
    ...partial,
    walkthrough: {
      ...(current.walkthrough || {}),
      ...(partial.walkthrough || {}),
      v1: {
        ...(current.walkthrough?.v1 || {}),
        ...(partial.walkthrough?.v1 || {}),
        completedByIdentity: partial.walkthrough?.v1?.completedByIdentity !== undefined
          ? partial.walkthrough.v1.completedByIdentity
          : current.walkthrough?.v1?.completedByIdentity,
      },
    },
  });
}

/**
 * Merges persisted settings with defaults.
 * @param {object} [settings]
 * @returns {object}
 */
function mergeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    firstLaunch: typeof settings.firstLaunch === 'boolean' ? settings.firstLaunch : DEFAULT_SETTINGS.firstLaunch,
    onboarding: mergeOnboardingSettings(settings.onboarding || {}),
    clipPreRollSeconds: normalizeClipSeconds(settings.clipPreRollSeconds, DEFAULT_SETTINGS.clipPreRollSeconds, 0),
    clipPostRollSeconds: normalizeClipSeconds(settings.clipPostRollSeconds, DEFAULT_SETTINGS.clipPostRollSeconds, 1),
    clipOutputModeDefault: normalizeClipOutputMode(settings.clipOutputModeDefault),
    clipExportQuality: normalizeClipExportQuality(settings.clipExportQuality),
    alerts: {
      ...DEFAULT_SETTINGS.alerts,
      ...(settings.alerts || {})
    },
    tagging: {
      ...DEFAULT_SETTINGS.tagging,
      ...(settings.tagging || {}),
      hotkeys: {
        ...DEFAULT_TAGGING_HOTKEYS,
        ...(settings.tagging?.hotkeys || {})
      },
      customHotkeys: Array.isArray(settings.tagging?.customHotkeys)
        ? settings.tagging.customHotkeys
        : DEFAULT_SETTINGS.tagging.customHotkeys
    },
    microphone: {
      ...DEFAULT_MICROPHONE_SETTINGS,
      ...(settings.microphone || {}),
      language: settings.microphone?.language || DEFAULT_MICROPHONE_SETTINGS.language,
      label: settings.microphone?.label || DEFAULT_MICROPHONE_SETTINGS.label,
      deviceId: settings.microphone?.deviceId || DEFAULT_MICROPHONE_SETTINGS.deviceId,
    },
    dashboard: {
      ...DEFAULT_SETTINGS.dashboard,
      ...(settings.dashboard || {}),
      selectedKpis: Array.isArray(settings.dashboard?.selectedKpis)
        ? settings.dashboard.selectedKpis
        : DEFAULT_SETTINGS.dashboard.selectedKpis,
      sectionOrder: Array.isArray(settings.dashboard?.sectionOrder)
        ? settings.dashboard.sectionOrder
        : DEFAULT_SETTINGS.dashboard.sectionOrder,
      visibleSections: Array.isArray(settings.dashboard?.visibleSections)
        ? settings.dashboard.visibleSections
        : DEFAULT_SETTINGS.dashboard.visibleSections,
      filters: {
        ...DEFAULT_SETTINGS.dashboard.filters,
        ...(settings.dashboard?.filters || {})
      }
    },
    user: {
      ...DEFAULT_SETTINGS.user,
      ...(settings.user || {})
    }
  };
}

/**
 * Creates a settings repository from an electron-store compatible instance.
 * @param {{get: function(string): object|undefined, set: function(string, object): void}} store
 * @returns {{get: function(): Promise<object>, update: function(object): Promise<object>}}
 */
function createSettingsRepository(store) {
  return {
    async get() {
      return mergeSettings(store.get('settings') || {});
    },
    async update(partial) {
      const current = await this.get();
      const updated = mergeSettings({
        ...current,
        ...partial,
        alerts: {
          ...current.alerts,
          ...(partial.alerts || {})
        },
        tagging: {
          ...current.tagging,
          ...(partial.tagging || {}),
          hotkeys: {
            ...current.tagging.hotkeys,
            ...(partial.tagging?.hotkeys || {})
          },
          customHotkeys: Array.isArray(partial.tagging?.customHotkeys)
            ? partial.tagging.customHotkeys
            : current.tagging.customHotkeys
        },
        dashboard: {
          ...current.dashboard,
          ...(partial.dashboard || {}),
          selectedKpis: Array.isArray(partial.dashboard?.selectedKpis)
            ? partial.dashboard.selectedKpis
            : current.dashboard.selectedKpis,
          sectionOrder: Array.isArray(partial.dashboard?.sectionOrder)
            ? partial.dashboard.sectionOrder
            : current.dashboard.sectionOrder,
          visibleSections: Array.isArray(partial.dashboard?.visibleSections)
            ? partial.dashboard.visibleSections
            : current.dashboard.visibleSections,
          filters: {
            ...current.dashboard.filters,
            ...(partial.dashboard?.filters || {})
          }
        },
        user: {
          ...current.user,
          ...(partial.user || {})
        },
        microphone: {
          ...current.microphone,
          ...(partial.microphone || {}),
          language: partial.microphone?.language || current.microphone.language || DEFAULT_MICROPHONE_SETTINGS.language,
          label: partial.microphone?.label || current.microphone.label || DEFAULT_MICROPHONE_SETTINGS.label,
          deviceId: partial.microphone?.deviceId || current.microphone.deviceId || DEFAULT_MICROPHONE_SETTINGS.deviceId,
        },
        onboarding: mergeOnboardingUpdate(current.onboarding, partial.onboarding)
      });
      store.set('settings', updated);
      return updated;
    }
  };
}

/**
 * Gets the default settings repository.
 * @returns {{get: function(): Promise<object>, update: function(object): Promise<object>}}
 */
function getSettingsRepository() {
  if (!settingsRepository) {
    const Store = require('electron-store');
    const store = new Store({
      name: 'settings',
      deserialize: parseSettingsStoreJson,
      defaults: {
        settings: DEFAULT_SETTINGS
      }
    });
    settingsRepository = createSettingsRepository(store);
  }
  return settingsRepository;
}

/**
 * Gets the app settings
 * @returns {Promise<object>}
 */
async function getSettings() {
  return getSettingsRepository().get();
}

/**
 * Updates the app settings
 * @param {object} partial
 * @returns {Promise<object>}
 */
async function updateSettings(partial) {
  return getSettingsRepository().update(partial);
}

module.exports = {
  DEFAULT_DASHBOARD_SECTIONS,
  DEFAULT_TAGGING_HOTKEYS,
  createSettingsRepository,
  mergeSettings,
  parseSettingsStoreJson,
  getSettings,
  updateSettings
};
