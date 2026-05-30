// @ts-check
const DEFAULT_DASHBOARD_SECTIONS = [
  'set-pieces',
  'rucks',
  'discipline',
  'kicks',
  'break-lines',
  'possession',
  'bip',
  'sequences',
  'heatmap'
];

const DEFAULT_SETTINGS = {
  theme: 'dark',
  autoSave: true,
  firstLaunch: true,
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
  tagging: {
    autoCloseMs: 8000,
    hotkeyHintsCollapsed: false
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
 * Parses electron-store JSON while tolerating BOM bytes saved by external editors.
 * @param {string} text
 * @returns {object}
 */
function parseSettingsStoreJson(text) {
  return JSON.parse(String(text).replace(/^\uFEFF|^ï»¿|^∩╗┐/, ''));
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
    alerts: {
      ...DEFAULT_SETTINGS.alerts,
      ...(settings.alerts || {})
    },
    tagging: {
      ...DEFAULT_SETTINGS.tagging,
      ...(settings.tagging || {})
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
          ...(partial.tagging || {})
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
        }
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
  createSettingsRepository,
  mergeSettings,
  parseSettingsStoreJson,
  getSettings,
  updateSettings
};
