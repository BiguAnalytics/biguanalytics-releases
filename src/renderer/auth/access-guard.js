// @ts-check
import { authService } from './auth-service.js';
import { renderAccessBlockedScreen } from './access-blocked-screen.js';
import { renderCreatePasswordScreen } from './create-password-screen.js';
import { renderLoginScreen } from './login-screen.js';
import { renderPersonalInfoScreen } from './personal-info-screen.js';
import { renderVerifyDeviceEmailScreen } from './verify-device-email-screen.js';
import { ACCESS_STATES, isProfilePersonalInfoComplete, licenseService } from './license-service.js';
import { markStartup } from '../startup-timing.js';
import { renderBiguLogo, wireBiguLogoFallback } from '../brand-logo.js';

export const PROTECTED_ROUTES = ['home', 'tagging', 'dashboard', 'clips', 'settings', 'season', 'tactical'];
export const BLOCKING_ACCESS_TIMEOUT_MS = 5000;
export const BACKGROUND_ACCESS_TIMEOUT_MS = 7000;
const ACCESS_CHECK_TIMEOUT_MS = BLOCKING_ACCESS_TIMEOUT_MS;
const PASSWORD_SETUP_AUTH_METHODS = new Set(['otp', 'recovery']);

export const VERIFICATION_STATUS = {
  LOCAL_VERIFIED: 'local_verified',
  VERIFYING_ONLINE: 'verifying_online',
  ONLINE_VERIFIED: 'online_verified',
  OFFLINE_MODE: 'offline_mode',
  SESSION_EXPIRED: 'session_expired',
  LICENSE_EXPIRED: 'license_expired',
};

let currentAccessState = {
  state: ACCESS_STATES.LOADING,
  user: null,
  profile: null,
  club: null,
  device: null,
  reason: 'loading',
};
let checkingTimeoutId = null;

function buildInitialAccessState() {
  return {
    state: ACCESS_STATES.LOADING,
    user: null,
    profile: null,
    club: null,
    device: null,
    reason: 'loading',
  };
}

export function getAccessState() {
  return currentAccessState;
}

export function resetAccessStateForTests() {
  currentAccessState = buildInitialAccessState();
}

/**
 * @param {object|null|undefined} state
 * @returns {boolean}
 */
export function isAllowedAccessState(state) {
  return (state?.state === 'active' || state?.state === 'offline_grace')
    && isProfilePersonalInfoComplete(state?.profile);
}

/**
 * @param {object|null|undefined} state
 * @returns {boolean}
 */
export function isHardDeniedAccessState(state) {
  return [
    ACCESS_STATES.BLOCKED_DEVICE,
    ACCESS_STATES.BLOCKED_USER,
    ACCESS_STATES.EXPIRED_LICENSE,
    ACCESS_STATES.INVALID_LICENSE,
    ACCESS_STATES.SUSPENDED_LICENSE,
  ].includes(state?.state);
}

/**
 * @param {object|null|undefined} state
 * @returns {boolean}
 */
function isValidLocalGraceState(state) {
  return state?.state === ACCESS_STATES.OFFLINE_GRACE && state.allowed !== false && isAllowedAccessState(state);
}

/**
 * @param {object|null|undefined} access
 * @param {string} verificationStatus
 * @returns {object|null|undefined}
 */
function withVerificationStatus(access, verificationStatus) {
  if (!access) return access;
  return {
    ...access,
    verificationStatus,
  };
}

/**
 * @param {object|null|undefined} access
 * @param {function(string, object=): void} mark
 */
function markLocalAccessDebug(access, mark) {
  const graceValid = isValidLocalGraceState(access);
  mark('local-access:user', {
    id: access?.user?.id || access?.profile?.id || '',
    email: access?.user?.email || access?.profile?.email || '',
  });
  mark('local-access:club', {
    id: access?.club?.id || access?.profile?.club_id || '',
    name: access?.club?.name || '',
  });
  mark('local-access:status', {
    state: access?.state || 'missing',
    reason: access?.reason || '',
    localState: access?.localState || '',
    localSource: access?.localSource || '',
  });
  mark('local-access:lastVerifiedAt', {
    lastVerifiedAt: access?.lastVerifiedAt || '',
  });
  mark('local-access:offlineGraceExpiresAt', {
    offlineGraceExpiresAt: access?.offlineGraceExpiresAt || '',
  });
  mark('local-access:grace-valid', { valid: graceValid });
  if (!graceValid && access?.reason) {
    mark('license:block-reason', {
      state: access.state || '',
      reason: access.blockReason || access.reason || '',
    });
  }
}

/**
 * @param {object|null|undefined} access
 * @returns {object|null|undefined}
 */
function decorateOnlineAccess(access) {
  if (!access || access.verificationStatus) return access;
  if (access.state === ACCESS_STATES.ACTIVE) {
    return withVerificationStatus(access, VERIFICATION_STATUS.ONLINE_VERIFIED);
  }
  if (access.state === ACCESS_STATES.EXPIRED_LICENSE || access.state === ACCESS_STATES.RENEWAL_REQUIRED) {
    return withVerificationStatus(access, VERIFICATION_STATUS.LICENSE_EXPIRED);
  }
  if (access.state === ACCESS_STATES.UNAUTHENTICATED) {
    return withVerificationStatus(access, VERIFICATION_STATUS.SESSION_EXPIRED);
  }
  return access;
}

/**
 * @param {object} access
 * @param {{dispatch?: boolean}} [options]
 */
function setCurrentAccessState(access, options = {}) {
  currentAccessState = access;
  if (options.dispatch === false || !globalThis.window?.dispatchEvent) return;
  window.dispatchEvent(new CustomEvent('bigu:access-state-changed', {
    detail: currentAccessState,
  }));
}

/**
 * @param {string} reason
 * @returns {object}
 */
function buildTimeoutAccessState(reason = 'license_check_timeout') {
  return {
    state: ACCESS_STATES.CONNECTION_ERROR,
    user: currentAccessState.user,
    profile: currentAccessState.profile,
    club: currentAccessState.club,
    device: currentAccessState.device,
    reason,
    detail: 'La verificacion de licencia tardo demasiado. Revisa la conexion o reintenta.',
  };
}

/**
 * @param {Promise<object>} operation
 * @param {{reason?: string, timeoutMs?: number, mark?: function(string, object=): void}} [options]
 * @returns {Promise<object>}
 */
function withAccessTimeout(operation, options = {}) {
  const config = typeof options === 'string' ? { reason: options } : options;
  const reason = config.reason || 'license_check_timeout';
  const timeoutMs = Number(config.timeoutMs || ACCESS_CHECK_TIMEOUT_MS);
  const mark = config.mark || markStartup;
  const timerApi = globalThis.window || globalThis;
  let timeoutId = null;
  return Promise.race([
    operation,
    new Promise((resolve) => {
      timeoutId = timerApi.setTimeout(() => {
        mark('license-check:timeout', { timeoutMs, reason });
        mark('license:online-check:timeout', { timeoutMs, reason });
        resolve(buildTimeoutAccessState(reason));
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId !== null) timerApi.clearTimeout?.(timeoutId);
  });
}

/**
 * @param {{mark?: function(string, object=): void, api?: object}} [options]
 * @returns {Promise<object|null>}
 */
export async function readLocalAccessState(options = {}) {
  const mark = options.mark || markStartup;
  const api = options.api || globalThis.window?.api;
  mark('local-access:read:start');
  let access = null;
  try {
    access = await api?.auth?.getAccessStatus?.() || null;
  } catch {
    access = null;
  }
  mark('local-access:read:end');

  if (isValidLocalGraceState(access)) {
    mark('local-access:valid');
    mark('offline-grace:expiresAt', { expiresAt: access.offlineGraceExpiresAt || '' });
    return withVerificationStatus(access, VERIFICATION_STATUS.LOCAL_VERIFIED);
  }
  return decorateOnlineAccess(access);
}

/**
 * @param {function(): Promise<object>} onlineCheck
 * @param {{label: string, timeoutMs: number, reason?: string, mark?: function(string, object=): void}} options
 * @returns {Promise<object>}
 */
async function runTimedAccessCheck(onlineCheck, options) {
  const mark = options.mark || markStartup;
  mark(`${options.label}:start`);
  mark('license:online-check:start', { label: options.label });
  const access = await withAccessTimeout(Promise.resolve().then(() => onlineCheck()), {
    timeoutMs: options.timeoutMs,
    reason: options.reason || 'license_check_timeout',
    mark,
  });
  mark(`${options.label}:end`);
  mark('license:online-check:end', {
    label: options.label,
    state: access?.state || '',
    reason: access?.reason || '',
  });
  return decorateOnlineAccess(access);
}

function clearCheckingTimeout() {
  if (!checkingTimeoutId) return;
  window.clearTimeout(checkingTimeoutId);
  checkingTimeoutId = null;
}

export async function refreshAccessState() {
  const access = await runTimedAccessCheck(() => licenseService.checkAccess(), {
    label: 'license:blocking-check',
    timeoutMs: BLOCKING_ACCESS_TIMEOUT_MS,
  });
  setCurrentAccessState(access);
  return currentAccessState;
}

/**
 * @param {{readLocalAccessState?: function(): Promise<object|null>, onlineCheck?: function(): Promise<object>, blockingTimeoutMs?: number, mark?: function(string, object=): void, onLocalAccess?: function(object): void, onBlockingStart?: function(): void}} [options]
 * @returns {Promise<{source: string, access: object, shouldRunBackgroundVerification: boolean}>}
 */
export async function resolveStartupAccess(options = {}) {
  const mark = options.mark || markStartup;
  const localReader = options.readLocalAccessState || (() => readLocalAccessState({ mark }));
  const onlineCheck = options.onlineCheck || (() => licenseService.checkAccess());
  const localAccess = await localReader();
  markLocalAccessDebug(localAccess, mark);

  if (isValidLocalGraceState(localAccess)) {
    const access = withVerificationStatus(localAccess, VERIFICATION_STATUS.LOCAL_VERIFIED);
    setCurrentAccessState(access, { dispatch: false });
    mark('app:enter:local-grace');
    mark('license:enter-from-local-grace', {
      localSource: access.localSource || '',
      offlineGraceExpiresAt: access.offlineGraceExpiresAt || '',
    });
    options.onLocalAccess?.(access);
    return {
      source: 'local_grace',
      access,
      shouldRunBackgroundVerification: true,
    };
  }

  if (isHardDeniedAccessState(localAccess)) {
    const access = decorateOnlineAccess(localAccess);
    setCurrentAccessState(access, { dispatch: false });
    return {
      source: 'local_denied',
      access,
      shouldRunBackgroundVerification: false,
    };
  }

  options.onBlockingStart?.();
  const access = await runTimedAccessCheck(onlineCheck, {
    label: 'license:blocking-check',
    timeoutMs: options.blockingTimeoutMs || BLOCKING_ACCESS_TIMEOUT_MS,
    mark,
  });
  setCurrentAccessState(access, { dispatch: false });
  if (isAllowedAccessState(access)) mark('app:enter:online-verified');
  return {
    source: 'blocking_online',
    access,
    shouldRunBackgroundVerification: false,
  };
}

/**
 * @param {object} access
 * @returns {Promise<object>}
 */
async function revokeMainProcessAccess(access) {
  if (!globalThis.window?.api?.auth?.revokeLocalAccess) return access;
  return window.api.auth.revokeLocalAccess(access);
}

/**
 * @param {{onlineCheck?: function(): Promise<object>, timeoutMs?: number, mark?: function(string, object=): void, onUpdate?: function(object): void|Promise<void>, onDenied?: function(object): void|Promise<void>, revokeLocalAccess?: function(object): Promise<object>|object}} [options]
 * @returns {Promise<object>}
 */
export async function runBackgroundAccessVerification(options = {}) {
  const mark = options.mark || markStartup;
  const onlineCheck = options.onlineCheck || (() => licenseService.checkAccess());
  const startingAccess = currentAccessState;

  if (isAllowedAccessState(startingAccess)) {
    const verifyingAccess = withVerificationStatus(startingAccess, VERIFICATION_STATUS.VERIFYING_ONLINE);
    setCurrentAccessState(verifyingAccess);
    await options.onUpdate?.(verifyingAccess);
  }

  const onlineAccess = await runTimedAccessCheck(onlineCheck, {
    label: 'license:background-check',
    timeoutMs: options.timeoutMs || BACKGROUND_ACCESS_TIMEOUT_MS,
    mark,
  });

  if (onlineAccess.state === ACCESS_STATES.OFFLINE_GRACE && isValidLocalGraceState(startingAccess)) {
    const offline = {
      ...startingAccess,
      reason: onlineAccess.reason || startingAccess.reason,
      verificationStatus: VERIFICATION_STATUS.OFFLINE_MODE,
    };
    setCurrentAccessState(offline);
    await options.onUpdate?.(offline);
    return offline;
  }

  if (isHardDeniedAccessState(onlineAccess)) {
    const revoke = options.revokeLocalAccess || revokeMainProcessAccess;
    const revoked = await revoke(onlineAccess);
    const denied = {
      ...onlineAccess,
      ...revoked,
      state: onlineAccess.state,
      reason: onlineAccess.reason,
    };
    setCurrentAccessState(denied);
    await options.onDenied?.(denied);
    return denied;
  }

  if (isAllowedAccessState(onlineAccess)) {
    const verified = decorateOnlineAccess(onlineAccess);
    setCurrentAccessState(verified);
    mark('app:enter:online-verified');
    await options.onUpdate?.(verified);
    return verified;
  }

  if (isValidLocalGraceState(startingAccess)) {
    const verificationStatus = onlineAccess.state === ACCESS_STATES.UNAUTHENTICATED
      ? VERIFICATION_STATUS.SESSION_EXPIRED
      : VERIFICATION_STATUS.OFFLINE_MODE;
    const offline = {
      ...startingAccess,
      reason: onlineAccess.reason || startingAccess.reason,
      verificationStatus,
    };
    setCurrentAccessState(offline);
    await options.onUpdate?.(offline);
    return offline;
  }

  setCurrentAccessState(onlineAccess);
  await options.onDenied?.(onlineAccess);
  return onlineAccess;
}

/**
 * @param {string} route
 * @returns {boolean}
 */
export function canAccessRoute(route) {
  if (!PROTECTED_ROUTES.includes(route)) return true;
  if (route === 'home' && currentAccessState.state === ACCESS_STATES.LOADING) return true;
  return isAllowedAccessState(currentAccessState);
}

export async function ensureActiveAccess() {
  if (isAllowedAccessState(currentAccessState)) return currentAccessState;
  return refreshAccessState();
}

/**
 * @param {object} access
 * @returns {{clubName: string, clubSlug: string, userEmail: string, deviceStatus: string}|null}
 */
export function getPrintLicensePayload(access = currentAccessState) {
  if (!isAllowedAccessState(access)) return null;
  return {
    clubName: access.club?.name || '',
    clubSlug: access.club?.slug || '',
    userEmail: access.user?.email || access.profile?.email || '',
    deviceStatus: access.device?.status || '',
  };
}

/**
 * @param {HTMLElement} app
 * @param {{onTimeout?: function(object): void}} [options]
 */
function renderCheckingLicense(app, options = {}) {
  clearCheckingTimeout();
  app.innerHTML = `
    <main class="access-shell">
      <section class="access-card">
        <div class="access-brand" aria-label="BiguAnalytics">
          ${renderBiguLogo({ className: 'access-brand-mark' })}
          <div class="access-brand-name">Bigu<span>Analytics</span></div>
        </div>
        <div class="access-skeleton" aria-live="polite">VERIFICANDO LICENCIA...</div>
      </section>
    </main>
  `;
  wireBiguLogoFallback(app);
  checkingTimeoutId = window.setTimeout(() => {
    const timeoutState = buildTimeoutAccessState();
    currentAccessState = timeoutState;
    options.onTimeout?.(timeoutState);
  }, ACCESS_CHECK_TIMEOUT_MS);
}

/**
 * @param {object} access
 * @param {string} [authMethod]
 * @returns {boolean}
 */
export function shouldShowPasswordSetup(access, authMethod = 'session') {
  if (!PASSWORD_SETUP_AUTH_METHODS.has(authMethod)) return false;
  if (!access?.user || !access?.profile || !access?.club) return false;
  if (![ACCESS_STATES.ACTIVE, ACCESS_STATES.PENDING_DEVICE].includes(access.state)) return false;
  if (!isProfilePersonalInfoComplete(access.profile)) return false;
  if (authService.hasPassword(access.profile)) return false;
  return true;
}

/**
 * @param {object} access
 * @param {string} authMethod
 * @param {{hasPassword?: function(object): boolean, markPasswordConfigured?: function(string=): Promise<object>}} [service]
 * @returns {Promise<object>}
 */
export async function syncPasswordConfiguredAfterPasswordLogin(access, authMethod, service = authService) {
  if (authMethod !== 'password') return access;
  if (!access?.user || !access?.profile) return access;
  if (service.hasPassword?.(access.profile)) return access;
  if (typeof service.markPasswordConfigured !== 'function') return access;

  try {
    const updatedProfile = await service.markPasswordConfigured(access.user.id || access.profile.id);
    if (!updatedProfile) return access;
    return {
      ...access,
      profile: {
        ...access.profile,
        ...updatedProfile,
        password_configured: true,
      },
    };
  } catch {
    return access;
  }
}

function resetToUnauthenticated(reason = 'signed_out') {
  currentAccessState = {
    state: ACCESS_STATES.UNAUTHENTICATED,
    user: null,
    profile: null,
    club: null,
    device: null,
    reason,
  };
}

/**
 * @param {HTMLElement} app
 * @param {{onActive?: function(object): void|Promise<void>, initialAccess?: object}} [options]
 * @returns {Promise<object>}
 */
export async function renderAccessGate(app, options = {}) {
  const renderBlocked = (state) => {
    clearCheckingTimeout();
    renderAccessBlockedScreen(app, {
      accessState: state,
      onRetry: async () => {
        showChecking();
        const next = await refreshAccessState();
        clearCheckingTimeout();
        await handleAccessState(next, { authMethod: 'session' });
      },
      onSignOut: async () => {
        try {
          await authService.signOut();
        } catch {
          await window.api?.auth?.logout?.();
          await window.api?.authSession?.clear?.();
        }
        resetToUnauthenticated('signed_out');
        renderLogin();
      },
    });
  };

  const showChecking = () => renderCheckingLicense(app, { onTimeout: renderBlocked });

  const renderLogin = (loginOptions = {}) => renderLoginScreen(app, {
    ...loginOptions,
    onAuthenticated: async ({ method: authMethod, email } = {}) => {
      showChecking();
      const next = await refreshAccessState();
      clearCheckingTimeout();
      await handleAccessState(next, { authMethod, email });
    },
  });

  const renderPersonalInfo = () => renderPersonalInfoScreen(app, {
    onSubmit: async (personalInfo) => {
      showChecking();
      const next = await withAccessTimeout(
        licenseService.updatePersonalInfo(personalInfo),
        'device_registration_timeout'
      );
      clearCheckingTimeout();
      currentAccessState = next;
      await handleAccessState(next, { authMethod: 'otp' });
    },
  });

  const renderCreatePassword = (state, authMethod = 'otp') => {
    currentAccessState = {
      ...state,
      state: 'password_required',
      reason: 'password_not_set',
    };
    renderCreatePasswordScreen(app, {
      onPasswordCreated: async () => {
        showChecking();
        const next = await refreshAccessState();
        clearCheckingTimeout();
        await handleAccessState(next, { authMethod });
      },
    });
  };

  const renderVerifyDeviceEmail = async (state, email = '') => {
    try {
      await authService.signOut();
    } catch {
      await window.api?.auth?.logout?.();
      await window.api?.authSession?.clear?.();
    }
    currentAccessState = {
      ...state,
      state: 'device_email_verification_required',
      reason: 'password_login_new_device_requires_otp',
    };
    renderVerifyDeviceEmailScreen(app, {
      email: email || state?.user?.email || '',
      onUseEmailCode: () => renderLogin({ initialMode: 'otp', initialEmail: email || state?.user?.email || '' }),
      onSignOut: async () => {
        resetToUnauthenticated('signed_out');
        renderLogin();
      },
    });
  };

  async function handleAccessState(state, context = {}) {
    const authMethod = context.authMethod || 'session';
    const email = context.email || state?.user?.email || '';
    const nextState = await syncPasswordConfiguredAfterPasswordLogin(state, authMethod);
    currentAccessState = nextState;

    if (shouldShowPasswordSetup(nextState, authMethod)) {
      renderCreatePassword(nextState, authMethod);
      return;
    }

    if (isAllowedAccessState(nextState)) {
      await options.onActive?.(nextState);
      return;
    }

    if (nextState.state === ACCESS_STATES.PERSONAL_INFO_REQUIRED) {
      renderPersonalInfo();
      return;
    }

    renderBlocked(nextState);
  }

  if (!options.initialAccess) showChecking();
  const access = options.initialAccess || await refreshAccessState();
  clearCheckingTimeout();

  if (access.state === 'unauthenticated') {
    renderLogin();
  } else if (isAllowedAccessState(access) && !shouldShowPasswordSetup(access, 'session')) {
    return access;
  } else {
    await handleAccessState(access, { authMethod: 'session' });
  }

  return currentAccessState;
}
