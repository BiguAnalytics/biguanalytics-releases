// @ts-check
import { createDeviceService } from './device-service.js';
import { getSupabaseClient } from './supabase-client.js';
import { timeStartup } from '../startup-timing.js';

export const ACCESS_STATES = {
  LOADING: 'loading',
  ACTIVATION_REQUIRED: 'activation_required',
  UNAUTHENTICATED: 'unauthenticated',
  PENDING_DEVICE: 'pending_device',
  BLOCKED_USER: 'blocked_user',
  PERSONAL_INFO_REQUIRED: 'personal_info_required',
  EXPIRED_LICENSE: 'expired_license',
  SUSPENDED_LICENSE: 'suspended_license',
  BLOCKED_DEVICE: 'blocked_device',
  ACTIVE: 'active',
  OFFLINE_GRACE: 'offline_grace',
  RENEWAL_REQUIRED: 'renewal_required',
  INVALID_LICENSE: 'invalid_license',
  NETWORK_ERROR: 'network_error',
  CONNECTION_ERROR: 'connection_error',
};

const DEFAULT_CLUB_SLUG = 'bigua';
const DEFAULT_PROFILE_VALUES = {
  status: 'approved',
  role: 'analyst',
  ai_enabled: false,
  ai_daily_limit: 30,
  ai_revoked_at: null,
  password_configured: false,
  password_configured_at: null,
};

export const PROFILE_ROLE_OPTIONS = [
  { value: 'jugador', label: 'Jugador' },
  { value: 'entrenador', label: 'Entrenador' },
  { value: 'analista', label: 'Analista' },
  { value: 'staff', label: 'Staff' },
  { value: 'otro', label: 'Otro' },
];

export const PLAYER_POSITION_OPTIONS = [
  { value: 'pilar', label: 'Pilar' },
  { value: 'hooker', label: 'Hooker' },
  { value: 'segunda_linea', label: 'Segunda linea' },
  { value: 'ala', label: 'Ala' },
  { value: 'octavo', label: 'Octavo' },
  { value: 'medio_scrum', label: 'Medio scrum' },
  { value: 'apertura', label: 'Apertura' },
  { value: 'centro', label: 'Centro' },
  { value: 'wing', label: 'Wing' },
  { value: 'fullback', label: 'Fullback' },
  { value: 'otro', label: 'Otro' },
];

const PROFILE_ROLE_VALUES = new Set(PROFILE_ROLE_OPTIONS.map(option => option.value));
const PLAYER_POSITION_VALUES = new Set(PLAYER_POSITION_OPTIONS.map(option => option.value));

/**
 * @param {Promise<object>|object|function(): Promise<object>} clientSource
 * @returns {Promise<object>}
 */
async function resolveClient(clientSource) {
  if (typeof clientSource === 'function') return clientSource();
  return clientSource;
}

/**
 * @param {string|null|undefined} value
 * @param {function(): Date} now
 * @returns {boolean}
 */
function isExpired(value, now) {
  if (!value) return false;
  const expiresAt = new Date(value);
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= now().getTime();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function trimText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function hasHtmlLikeCharacters(value) {
  return /[<>]/.test(String(value || ''));
}

/**
 * @param {string} firstName
 * @param {string} lastName
 * @returns {string}
 */
export function buildDisplayName(firstName, lastName) {
  const first = trimText(firstName);
  const last = trimText(lastName);
  if (!first) return '';
  return [first, last ? `${last.charAt(0).toUpperCase()}.` : ''].filter(Boolean).join(' ');
}

/**
 * @param {unknown} value
 * @param {Set<string>} allowed
 * @returns {string}
 */
function normalizeOptionValue(value, allowed) {
  const normalized = trimText(value).toLowerCase();
  return allowed.has(normalized) ? normalized : '';
}

/**
 * @param {object|null} profile
 * @returns {boolean}
 */
export function isProfilePersonalInfoComplete(profile) {
  if (!profile) return false;
  if (profile.profile_complete === true || profile.personal_info_complete === true) return true;
  const firstName = trimText(profile.first_name);
  const lastName = trimText(profile.last_name);
  const age = Number(profile.age);
  const appRole = normalizeOptionValue(profile.app_role, PROFILE_ROLE_VALUES);
  const isPlayerKnown = typeof profile.is_player === 'boolean';
  const expectedPlayer = appRole === 'jugador';
  const hasMatchingPlayerFlag = isPlayerKnown && profile.is_player === expectedPlayer;
  const position = normalizeOptionValue(profile.position, PLAYER_POSITION_VALUES);
  const hasPositionIfPlayer = expectedPlayer ? Boolean(position) : true;
  return Boolean(
    firstName
      && lastName
      && Number.isFinite(age)
      && age >= 12
      && age <= 100
      && appRole
      && hasMatchingPlayerFlag
      && hasPositionIfPlayer
  );
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function getConnectionReason(error) {
  const message = getErrorDetail(error);
  if (/SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|cliente publico de Supabase/i.test(message)) {
    return 'missing_supabase_config';
  }
  if (/(password_configured|password_configured_at|password_set_at).*(schema cache|does not exist)|could not find .*(password_configured|password_configured_at|password_set_at)|column .*(password_configured|password_configured_at|password_set_at)/i.test(message)) {
    return 'missing_password_schema';
  }
  if (/first_name|last_name|age|app_role|is_player|position|display_name/i.test(message) && /schema cache|does not exist|could not find|column/i.test(message)) {
    return 'missing_personal_info_schema';
  }
  if (/relation .*profiles.*does not exist|relation .*clubs.*does not exist|relation .*devices.*does not exist|relation .*license_checks.*does not exist/i.test(message)) {
    return 'missing_license_schema';
  }
  return 'connection_error';
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function getErrorDetail(error) {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === 'object' && 'message' in error
      ? String(error.message || '')
      : String(error || '');
  return message
    .replace(/(sb_publishable_[A-Za-z0-9_-]+)/g, '[supabase-key]')
    .replace(/(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g, '[jwt]')
    .slice(0, 220);
}

/**
 * @returns {Promise<object|null>}
 */
async function getMainProcessAccessStatus() {
  if (!globalThis.window?.api?.auth?.getAccessStatus) return null;
  try {
    return await window.api.auth.getAccessStatus();
  } catch {
    return null;
  }
}

/**
 * @param {object} access
 * @returns {Promise<object>}
 */
async function activateMainProcessAccess(access) {
  if (!globalThis.window?.api?.auth?.activateOnline || access?.state !== ACCESS_STATES.ACTIVE) return access;
  const activation = await window.api.auth.activateOnline({
    user: access.user,
    profile: access.profile,
    club: access.club,
    device: access.device,
  });
  if (activation?.state === ACCESS_STATES.ACTIVE) {
    await cacheApprovedDeviceAccess(access, activation);
    return {
      ...access,
      ...activation,
      state: ACCESS_STATES.ACTIVE,
      user: access.user,
      profile: access.profile,
      club: access.club,
      device: access.device,
      reason: activation.reason || access.reason,
    };
  }
  return {
    ...activation,
    user: access.user,
    profile: access.profile,
    club: access.club,
    device: access.device,
  };
}

/**
 * @param {object} access
 * @param {object} activation
 */
async function cacheApprovedDeviceAccess(access = {}, activation = {}) {
  if (!globalThis.window?.api?.device?.cacheApprovedDevice) return;
  const deviceStatus = String(access.device?.status || '').trim().toLowerCase();
  if (!access.device?.id || deviceStatus !== 'approved' || access.device.revoked_at) return;
  try {
    await window.api.device.cacheApprovedDevice({
      deviceId: access.device.id,
      fingerprintVersion: Number(access.device.fingerprint_version || 2),
      lastKnownDeviceName: access.device.device_name || access.device.display_name || '',
      lastVerifiedAt: activation.lastVerifiedAt || new Date().toISOString(),
      offlineGraceExpiresAt: activation.offlineGraceExpiresAt || access.offlineGraceExpiresAt || '',
    });
  } catch {
    // Local cache failures must not change the license decision.
  }
}

/**
 * @returns {boolean}
 */
function isBrowserOfflineHint() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * @param {object|null} status
 * @returns {boolean}
 */
function canUseMainAccessStatus(status) {
  return [
    ACCESS_STATES.OFFLINE_GRACE,
    ACCESS_STATES.RENEWAL_REQUIRED,
    ACCESS_STATES.INVALID_LICENSE,
  ].includes(status?.state) || (status?.state === ACCESS_STATES.ACTIVATION_REQUIRED && isBrowserOfflineHint());
}

/**
 * @param {object} input
 * @returns {{state: string, user: object|null, profile: object|null, club: object|null, device: object|null, reason: string}}
 */
export function resolveLicenseState(input = {}) {
  const now = input.now || (() => new Date());
  const user = input.user || input.session?.user || null;
  const profile = input.profile || null;
  const club = input.club || null;
  const device = input.device || null;

  if (input.error) {
    return {
      state: ACCESS_STATES.CONNECTION_ERROR,
      user,
      profile,
      club,
      device,
      reason: getConnectionReason(input.error),
      detail: getErrorDetail(input.error),
    };
  }
  if (!input.session || !user) {
    return { state: ACCESS_STATES.UNAUTHENTICATED, user: null, profile: null, club: null, device: null, reason: 'missing_session' };
  }
  if (!profile) {
    return { state: ACCESS_STATES.BLOCKED_USER, user, profile, club, device, reason: 'profile_missing' };
  }
  const profileStatus = String(profile.status || '').trim().toLowerCase();
  if (profileStatus === 'suspended' || profileStatus === 'rejected' || profileStatus === 'blocked') {
    const reasonStatus = profileStatus === 'blocked' ? 'rejected' : profileStatus;
    return { state: ACCESS_STATES.BLOCKED_USER, user, profile, club, device, reason: `profile_${reasonStatus}` };
  }
  if (profileStatus !== 'approved') {
    return { state: ACCESS_STATES.BLOCKED_USER, user, profile, club, device, reason: 'profile_not_approved' };
  }
  if (!isProfilePersonalInfoComplete(profile)) {
    return { state: ACCESS_STATES.PERSONAL_INFO_REQUIRED, user, profile, club, device, reason: 'profile_incomplete' };
  }
  if (!club) {
    return { state: ACCESS_STATES.CONNECTION_ERROR, user, profile, club: null, device, reason: 'missing_club' };
  }
  if (club.license_status === 'suspended') {
    return { state: ACCESS_STATES.SUSPENDED_LICENSE, user, profile, club, device, reason: 'license_suspended' };
  }
  if (club.license_status === 'expired' || isExpired(club.expires_at, now)) {
    return { state: ACCESS_STATES.EXPIRED_LICENSE, user, profile, club, device, reason: 'license_expired' };
  }
  if (!['trial', 'active'].includes(club.license_status)) {
    return { state: ACCESS_STATES.SUSPENDED_LICENSE, user, profile, club, device, reason: 'license_not_active' };
  }
  if (!device) {
    return { state: ACCESS_STATES.PENDING_DEVICE, user, profile, club, device, reason: 'device_missing' };
  }
  const deviceStatus = String(device.status || '').trim().toLowerCase();
  if (device.revoked_at || deviceStatus === 'revoked') {
    return { state: ACCESS_STATES.BLOCKED_DEVICE, user, profile, club, device, reason: 'device_revoked' };
  }
  if (deviceStatus === 'pending') {
    return { state: ACCESS_STATES.PENDING_DEVICE, user, profile, club, device, reason: 'device_pending' };
  }
  if (deviceStatus === 'rejected' || deviceStatus === 'blocked') {
    const reasonStatus = deviceStatus === 'blocked' ? 'rejected' : deviceStatus;
    return { state: ACCESS_STATES.BLOCKED_DEVICE, user, profile, club, device, reason: `device_${reasonStatus}` };
  }
  if (deviceStatus !== 'approved') {
    return { state: ACCESS_STATES.BLOCKED_DEVICE, user, profile, club, device, reason: 'device_not_approved' };
  }
  return { state: ACCESS_STATES.ACTIVE, user, profile, club, device, reason: 'allowed' };
}

/**
 * @param {object} client
 * @param {{state: string, user: object|null, profile: object|null, club: object|null, device: object|null, reason: string}} access
 * @param {object|null} fingerprint
 */
async function recordLicenseCheck(client, access, fingerprint = null) {
  if (!access.user?.id || !access.profile?.club_id) return;
  try {
    await client.from('license_checks').insert({
      club_id: access.club?.id || access.profile.club_id,
      user_id: access.user.id,
      device_id: access.device?.id || null,
      result: access.state === ACCESS_STATES.ACTIVE ? 'allowed' : 'denied',
      reason: access.reason,
      app_version: access.device?.app_version || fingerprint?.appVersion || null,
    });
  } catch {
    // Logging must not change the license decision.
  }
}

/**
 * @param {object} error
 * @returns {boolean}
 */
function isMissingRowError(error) {
  return Boolean(error && (
    error.code === 'PGRST116'
    || /no rows|0 rows|json object requested/i.test(String(error.message || ''))
  ));
}

/**
 * @param {object} client
 * @returns {Promise<object>}
 */
async function fetchDefaultClub(client) {
  const result = await client
    .from('clubs')
    .select('*')
    .eq('slug', DEFAULT_CLUB_SLUG)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error('No se encontro el club Bigua default.');
  return result.data;
}

/**
 * @param {object} client
 * @param {object} user
 * @param {object} club
 * @returns {Promise<object>}
 */
async function createDefaultProfile(client, user, club) {
  const email = String(user.email || '').trim().toLowerCase();
  const inserted = await client
    .from('profiles')
    .insert({
      id: user.id,
      email,
      club_id: club.id,
      ...DEFAULT_PROFILE_VALUES,
    })
    .select('*')
    .single();
  if (inserted.error) throw inserted.error;
  return inserted.data;
}

/**
 * @param {object} client
 * @param {object} user
 * @returns {Promise<{profile: object, club: object}>}
 */
async function getOrCreateProfileContext(client, user) {
  const profileResult = await timeStartup('supabase:profile', () => client
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle());
  if (profileResult.error && !isMissingRowError(profileResult.error)) throw profileResult.error;

  if (profileResult.data) {
    const clubResult = await timeStartup('supabase:license-profile', () => client
      .from('clubs')
      .select('*')
      .eq('id', profileResult.data.club_id)
      .single());
    if (clubResult.error) throw clubResult.error;
    return { profile: profileResult.data, club: clubResult.data };
  }

  const club = await timeStartup('supabase:default-club', () => fetchDefaultClub(client));
  const profile = await timeStartup('supabase:create-profile', () => createDefaultProfile(client, user, club));
  return { profile, club };
}

/**
 * @param {object} activeDeviceService
 * @param {object} profile
 * @param {object} club
 * @returns {Promise<{device: object|null, fingerprint: object|null}>}
 */
async function getOrCreateDevice(activeDeviceService, profile, club) {
  const found = await activeDeviceService.findDevice(profile, club);
  if (found.device) return found;
  if (typeof activeDeviceService.registerPendingDevice !== 'function') {
    return { device: null, fingerprint: found.fingerprint || null };
  }
  const registered = await activeDeviceService.registerPendingDevice(profile, club);
  return {
    device: registered.device,
    fingerprint: registered.fingerprint || found.fingerprint || null,
  };
}

/**
 * @param {Promise<object>|object|function(): Promise<object>} clientSource
 * @param {function(): Date} now
 * @param {{allowIncompleteProfile?: boolean}} [options]
 * @returns {Promise<{client: object, session: object, user: object, profile: object, club: object, access?: undefined}|{access: object}>}
 */
async function getAuthenticatedLicenseContext(clientSource, now, options = {}) {
  const client = await resolveClient(clientSource);
  const sessionResult = await client.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  const session = sessionResult.data?.session || null;
  if (!session?.user) return { access: resolveLicenseState({ session: null, now }) };

  const user = session.user;
  const { profile, club } = await getOrCreateProfileContext(client, user);
  const gate = resolveLicenseState({
    session,
    user,
    profile,
    club,
    device: { status: 'approved' },
    now,
  });
  if (options.allowIncompleteProfile && gate.state === ACCESS_STATES.PERSONAL_INFO_REQUIRED) {
    return { client, session, user, profile, club };
  }
  if (gate.state !== ACCESS_STATES.ACTIVE) return { access: gate };
  return { client, session, user, profile, club };
}

/**
 * @param {{clientSource?: Promise<object>|object|function(): Promise<object>, deviceService?: object, now?: function(): Date}} [deps]
 */
export function createLicenseService(deps = {}) {
  const clientSource = deps.clientSource || getSupabaseClient;
  const now = deps.now || (() => new Date());
  const activeDeviceService = deps.deviceService || createDeviceService(clientSource);

  return {
    async checkAccess() {
      try {
        const client = await timeStartup('supabase:client', () => resolveClient(clientSource));
        const sessionResult = await timeStartup('supabase:session', () => client.auth.getSession());
        if (sessionResult.error) throw sessionResult.error;
        const session = sessionResult.data?.session || null;
        if (!session?.user) {
          const mainAccess = await getMainProcessAccessStatus();
          if (canUseMainAccessStatus(mainAccess)) return mainAccess;
          return resolveLicenseState({ session: null, now });
        }

        const user = session.user;
        const { profile, club } = await getOrCreateProfileContext(client, user);
        const preDeviceAccess = resolveLicenseState({
          session,
          user,
          profile,
          club,
          device: { status: 'approved' },
          now,
        });
        if (preDeviceAccess.state !== ACCESS_STATES.ACTIVE) {
          void recordLicenseCheck(client, preDeviceAccess, null);
          return preDeviceAccess;
        }

        const { device, fingerprint } = await timeStartup('supabase:device-license', () => getOrCreateDevice(activeDeviceService, profile, club));
        const access = resolveLicenseState({ session, user, profile, club, device, now });
        void recordLicenseCheck(client, access, fingerprint);
        return timeStartup('auth:activate-local-access', () => activateMainProcessAccess(access));
      } catch (error) {
        const mainAccess = await getMainProcessAccessStatus();
        if (canUseMainAccessStatus(mainAccess)) return mainAccess;
        return resolveLicenseState({ error, now });
      }
    },

    /**
     * @param {{firstName: string, lastName: string, age: number|string, role: string, isPlayer?: boolean|string, position?: string}} personalInfo
     */
    async registerNewDeviceWithPersonalInfo(personalInfo) {
      try {
        const context = await getAuthenticatedLicenseContext(clientSource, now, { allowIncompleteProfile: true });
        if (context.access) return context.access;

        const normalized = normalizePersonalInfo(personalInfo);
        const { device: existingDevice, fingerprint } = await activeDeviceService.findDevice(context.profile, context.club);
        let device = existingDevice;
        let updatedProfile;
        if (existingDevice) {
          const updated = await activeDeviceService.updatePersonalProfile(context.profile, normalized);
          updatedProfile = updated.profile;
        } else {
          const registered = await activeDeviceService.registerPendingDevice(context.profile, context.club, normalized);
          updatedProfile = registered.profile;
          device = registered.device;
        }
        const access = resolveLicenseState({
          session: context.session,
          user: context.user,
          profile: updatedProfile,
          club: context.club,
          device,
          now,
        });
        void recordLicenseCheck(context.client, access, fingerprint);
        await syncLocalUserSettings(updatedProfile);
        if (access.state === ACCESS_STATES.ACTIVE) return activateMainProcessAccess(access);
        return access;
      } catch (error) {
        return resolveLicenseState({ error, now });
      }
    },

    async registerCurrentDeviceFromProfile() {
      try {
        const context = await getAuthenticatedLicenseContext(clientSource, now);
        if (context.access) return context.access;
        const { device: existingDevice, fingerprint } = await activeDeviceService.findDevice(context.profile, context.club);
        let device = existingDevice;
        let profile = context.profile;
        if (!device) {
          const registered = await activeDeviceService.registerPendingDevice(context.profile, context.club);
          device = registered.device;
          profile = registered.profile;
        }
        const access = resolveLicenseState({
          session: context.session,
          user: context.user,
          profile,
          club: context.club,
          device,
          now,
        });
        void recordLicenseCheck(context.client, access, fingerprint);
        await syncLocalUserSettings(profile);
        if (access.state === ACCESS_STATES.ACTIVE) return activateMainProcessAccess(access);
        return access;
      } catch (error) {
        return resolveLicenseState({ error, now });
      }
    },

    /**
     * @param {{firstName: string, lastName: string, age: number|string, role: string, isPlayer?: boolean|string, position?: string}} personalInfo
     */
    async updatePersonalInfo(personalInfo) {
      try {
        const context = await getAuthenticatedLicenseContext(clientSource, now, { allowIncompleteProfile: true });
        if (context.access) return context.access;

        const normalized = normalizePersonalInfo(personalInfo);
        const updated = await activeDeviceService.updatePersonalProfile(context.profile, normalized);
        const { device: existingDevice, fingerprint } = await activeDeviceService.findDevice(updated.profile, context.club);
        let device = existingDevice;
        let registrationFingerprint = fingerprint;
        if (!device && typeof activeDeviceService.registerPendingDevice === 'function') {
          const registered = await activeDeviceService.registerPendingDevice(updated.profile, context.club);
          device = registered.device;
          registrationFingerprint = registered.fingerprint || fingerprint;
        }
        const access = resolveLicenseState({
          session: context.session,
          user: context.user,
          profile: updated.profile,
          club: context.club,
          device,
          now,
        });
        void recordLicenseCheck(context.client, access, registrationFingerprint);
        await syncLocalUserSettings(updated.profile);
        if (access.state === ACCESS_STATES.ACTIVE) return activateMainProcessAccess(access);
        return access;
      } catch (error) {
        return resolveLicenseState({ error, now });
      }
    },
  };
}

export const licenseService = createLicenseService();
export const checkAccess = (...args) => licenseService.checkAccess(...args);

/**
 * @param {{firstName: string, lastName: string, age: number|string, role: string, isPlayer?: boolean|string, position?: string}} personalInfo
 * @returns {{firstName: string, lastName: string, age: number, role: string, isPlayer: boolean, position: string}}
 */
export function normalizePersonalInfo(personalInfo) {
  const firstName = trimText(personalInfo.firstName);
  const lastName = trimText(personalInfo.lastName);
  const age = Number.parseInt(String(personalInfo.age || ''), 10);
  const role = normalizeOptionValue(personalInfo.role, PROFILE_ROLE_VALUES);
  const isPlayer = role === 'jugador';
  const position = isPlayer ? normalizeOptionValue(personalInfo.position, PLAYER_POSITION_VALUES) : '';
  if ([firstName, lastName].some(hasHtmlLikeCharacters)) {
    throw new Error('No uses caracteres HTML en el perfil.');
  }
  if (!firstName || !lastName) {
    throw new Error('Completa nombre y apellido.');
  }
  if (!Number.isFinite(age) || age < 12 || age > 100) {
    throw new Error('Ingresa una edad valida entre 12 y 100.');
  }
  if (!role) {
    throw new Error('Selecciona un rol dentro del club.');
  }
  if (isPlayer && !position) {
    throw new Error('Selecciona la posicion del jugador.');
  }
  return { firstName, lastName, age, role, isPlayer, position, displayName: buildDisplayName(firstName, lastName) };
}

/**
 * @param {object} profile
 * @returns {{firstName: string, lastName: string, age: number, role: string, isPlayer: boolean, position: string}}
 */
function personalInfoFromProfile(profile) {
  const role = normalizeOptionValue(profile.app_role || profile.role, PROFILE_ROLE_VALUES);
  return {
    firstName: trimText(profile.first_name),
    lastName: trimText(profile.last_name),
    age: Number(profile.age),
    role,
    isPlayer: role === 'jugador',
    position: normalizeOptionValue(profile.position, PLAYER_POSITION_VALUES),
  };
}

/**
 * @param {object} profile
 */
async function syncLocalUserSettings(profile) {
  if (typeof window === 'undefined' || !window.api?.settings?.set) return;
  const firstName = profile?.first_name || '';
  const lastName = profile?.last_name || '';
  const role = profile?.app_role || profile?.role || '';
  const displayName = trimText(profile?.display_name) || buildDisplayName(firstName, lastName);
  try {
    await window.api.settings.set({
      user: {
        name: displayName || 'Usuario',
        displayName,
        role: String(role || 'ANALISTA').toUpperCase(),
        profileRole: profile?.app_role || '',
        appRole: profile?.app_role || '',
        firstName,
        lastName,
        age: profile?.age || null,
        email: profile?.email || '',
        isPlayer: Boolean(profile?.is_player),
        position: profile?.position || '',
      },
    });
  } catch {
    window.dispatchEvent?.(new CustomEvent('bigu:settings-sync-failed', {
      detail: { reason: 'settings_sync_failed' },
    }));
  }
}

export function getDisplayUserFromProfile(profile = {}) {
  const firstName = profile.first_name || '';
  const lastName = profile.last_name || '';
  const displayName = trimText(profile.display_name) || buildDisplayName(firstName, lastName);
  return {
    name: displayName || 'Usuario',
    displayName,
    role: String(profile.app_role || profile.role || 'ANALISTA').toUpperCase(),
    profileRole: profile.app_role || '',
    appRole: profile.app_role || '',
    firstName,
    lastName,
    age: profile.age || null,
    email: profile.email || '',
    isPlayer: Boolean(profile.is_player),
    position: profile.position || '',
  };
}
