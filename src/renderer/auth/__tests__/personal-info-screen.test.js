import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const screenSource = readFileSync(new URL('../personal-info-screen.js', import.meta.url), 'utf8');
const guardSource = readFileSync(new URL('../access-guard.js', import.meta.url), 'utf8');
const deviceSource = readFileSync(new URL('../device-service.js', import.meta.url), 'utf8');
const licenseSource = readFileSync(new URL('../license-service.js', import.meta.url), 'utf8');

describe('required personal profile form', () => {
  it('renders the required profile fields before device approval', () => {
    expect(screenSource).toContain('Completá tu perfil');
    expect(screenSource).toContain('Estos datos ayudan a personalizar la experiencia dentro del club.');
    expect(screenSource).toContain('name="firstName"');
    expect(screenSource).toContain('name="lastName"');
    expect(screenSource).toContain('name="age"');
    expect(screenSource).toContain('name="role"');
    expect(screenSource).toContain('name="position"');
    expect(screenSource).not.toContain('name="isPlayer"');
    expect(screenSource).toContain('jugador');
    expect(screenSource).toContain('PLAYER_POSITION_OPTIONS');
    expect(licenseSource).toContain('apertura');
    expect(screenSource).toContain('Guardar y continuar');
  });

  it('gates startup device approval behind complete personal information', () => {
    expect(licenseSource).toContain('registerNewDeviceWithPersonalInfo');
    expect(licenseSource).toContain('updatePersonalInfo');
    expect(licenseSource).toContain('isProfilePersonalInfoComplete');
    expect(deviceSource).toContain('findDevice');
    expect(deviceSource).toContain('registerPendingDevice');
    expect(deviceSource).toContain('updatePersonalProfile');
    expect(deviceSource).toContain('touchOrMigrateDeviceIdentity');
    expect(deviceSource).toContain('migrate_own_device_identity_v2');
    expect(deviceSource).toContain('touch_own_device_identity_v2');
    expect(deviceSource).not.toContain('checkOrCreateDevice');
    expect(guardSource).not.toContain('new_device_requires_personal_info');
    expect(guardSource).toContain('licenseService.updatePersonalInfo');
  });
});
