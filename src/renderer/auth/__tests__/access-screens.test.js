import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const loginSource = readFileSync(new URL('../login-screen.js', import.meta.url), 'utf8');
const blockedSource = readFileSync(new URL('../access-blocked-screen.js', import.meta.url), 'utf8');
const personalInfoSource = readFileSync(new URL('../personal-info-screen.js', import.meta.url), 'utf8');
const createPasswordSource = readFileSync(new URL('../create-password-screen.js', import.meta.url), 'utf8');
const verifyDeviceEmailSource = readFileSync(new URL('../verify-device-email-screen.js', import.meta.url), 'utf8');
const brandLogoSource = readFileSync(new URL('../../brand-logo.js', import.meta.url), 'utf8');
const accessCss = readFileSync(new URL('../../../styles/components/access-control.css', import.meta.url), 'utf8');
const licenseSource = readFileSync(new URL('../license-service.js', import.meta.url), 'utf8');
const accessScreenSources = [
  loginSource,
  personalInfoSource,
  createPasswordSource,
  verifyDeviceEmailSource,
].join('\n');

describe('license access screens', () => {
  it('renders the OTP login copy, controls and accessible live state', () => {
    expect(loginSource).toContain('Ingresá con tu email para acceder a BiguAnalytics');
    expect(loginSource).toContain('Iniciar sesion');
    expect(loginSource).toContain('Primer acceso');
    expect(loginSource).toContain('<small>Email + clave</small>');
    expect(loginSource).toContain('<small>Codigo email</small>');
    expect(loginSource).toContain('Te enviaremos un código por email. Luego podrás crear tu contraseña y tu dispositivo quedará pendiente de aprobación.');
    expect(loginSource).toContain('Ingresá con la contraseña que creaste después del primer acceso.');
    expect(loginSource).not.toContain('<small>Te enviaremos un código por email. Luego podrás crear tu contraseña y tu dispositivo quedará pendiente de aprobación.</small>');
    expect(loginSource).not.toContain('<small>Ingresá con la contraseña que creaste después del primer acceso.</small>');
    expect(loginSource).toContain('access-auth-option');
    expect(loginSource).toContain('signInWithPassword');
    expect(loginSource).toContain('Olvidé mi contraseña');
    expect(loginSource).toContain('Email o contraseña incorrectos. Si todavía no configuraste contraseña, usá Primer acceso.');
    expect(loginSource).not.toContain('renderCreatePassword');
    expect(loginSource).toContain('access-brand-mark');
    expect(accessScreenSources).toContain('renderBiguLogo');
    expect(accessScreenSources).toContain('wireBiguLogoFallback');
    expect(accessScreenSources).not.toContain('../../LOGO.svg');
    expect(brandLogoSource).toContain('data-bigu-logo');
    expect(brandLogoSource).toContain('image.hidden = true');
    expect(loginSource).toContain('Bigu<span>Analytics</span>');
    expect(loginSource).toContain('Enviar codigo');
    expect(loginSource).toContain('Entrar');
    expect(loginSource).toContain('inputmode="email"');
    expect(loginSource).toContain('inputmode="numeric"');
    expect(loginSource).toContain('maxlength="8"');
    expect(loginSource).toContain('size="8"');
    expect(loginSource).toContain('pattern="[0-9]{8}"');
    expect(accessCss).toContain('.access-otp-input');
    expect(accessCss).toContain('width: 100%');
    expect(loginSource).toContain('aria-live="polite"');
  });

  it('renders device approval and blocked states with the required copy', () => {
    expect(blockedSource).toContain('Dispositivo pendiente de aprobación');
    expect(blockedSource).toContain('Tu usuario fue creado correctamente. Un administrador debe aprobar este dispositivo para entrar a BiguAnalytics.');
    expect(blockedSource).toContain('Usuario no autorizado');
    expect(blockedSource).toContain('Tu usuario no tiene acceso a BiguAnalytics.');
    expect(blockedSource).toContain('Licencia vencida');
    expect(blockedSource).toContain('Licencia suspendida');
    expect(blockedSource).toContain('Dispositivo no autorizado');
    expect(blockedSource).toContain('Este dispositivo no está autorizado para usar BiguAnalytics.');
    expect(blockedSource).toContain('No se pudo verificar la licencia');
    expect(blockedSource).toContain('Activacion requerida');
    expect(blockedSource).toContain('Conecta internet para renovar acceso');
    expect(blockedSource).toContain('Licencia revocada o invalida');
    expect(blockedSource).toContain('missing_supabase_config');
    expect(blockedSource).toContain('missing_password_schema');
    expect(blockedSource).toContain('missing_personal_info_schema');
    expect(blockedSource).toContain('access-detail');
    expect(blockedSource).toContain('Dispositivo:');
    expect(blockedSource).toContain('showRetry');
    expect(blockedSource).toContain('Reintentar');
    expect(blockedSource).toContain('Cerrar sesion');
  });

  it('renders password setup and new-device email verification screens', () => {
    expect(createPasswordSource).toContain('Creá tu contraseña');
    expect(createPasswordSource).toContain('La vas a usar para iniciar sesión más rápido la próxima vez.');
    expect(createPasswordSource).toContain('validatePasswordForm');
    expect(createPasswordSource).toContain('data-password-requirements');
    expect(createPasswordSource).toContain('minlength="8"');
    expect(createPasswordSource).toContain('Repetir contraseña');
    expect(createPasswordSource).toContain('setPassword');
    expect(verifyDeviceEmailSource).toContain('Dispositivo nuevo');
    expect(verifyDeviceEmailSource).toContain('verifica tu email');
    expect(verifyDeviceEmailSource).toContain('Codigo por email');
    expect(accessCss).toContain('.access-auth-options');
    expect(accessCss).toContain('.access-auth-option small');
  });

  it('uses the existing dark elevated card language and Bigua accent', () => {
    expect(accessCss).toContain('var(--color-bg-base)');
    expect(accessCss).toContain('var(--color-bg-elevated)');
    expect(accessCss).toContain('var(--color-accent)');
    expect(accessCss).toContain('480px');
    expect(accessCss).toContain('.access-brand-mark');
    expect(accessCss).toContain('112px');
  });

  it('renders the required profile form before startup device approval', () => {
    expect(personalInfoSource).toContain('Completá tu perfil');
    expect(personalInfoSource).toContain('Estos datos ayudan a personalizar la experiencia dentro del club.');
    expect(personalInfoSource).toContain('Guardar y continuar');
    expect(personalInfoSource).toContain('jugador');
    expect(personalInfoSource).toContain('PLAYER_POSITION_OPTIONS');
    expect(licenseSource).toContain('fullback');
    expect(personalInfoSource).not.toContain('Sos jugador');
    expect(accessCss).toContain('.access-form-grid');
    expect(blockedSource).toContain('pending_device');
    expect(blockedSource).toContain('Dispositivo pendiente de aprobación');
  });
});
