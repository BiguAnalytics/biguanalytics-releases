// @ts-check
const DEFAULT_SETTINGS = {
  theme: 'dark',
  autoSave: true,
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
  user: {
    name: 'Jorge G.',
    role: 'ENTRENADOR'
  }
};

let settingsRepository;

/**
 * Merges persisted settings with defaults.
 * @param {object} [settings]
 * @returns {object}
 */
function mergeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    alerts: {
      ...DEFAULT_SETTINGS.alerts,
      ...(settings.alerts || {})
    },
    tagging: {
      ...DEFAULT_SETTINGS.tagging,
      ...(settings.tagging || {})
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
  createSettingsRepository,
  mergeSettings,
  getSettings,
  updateSettings
};
