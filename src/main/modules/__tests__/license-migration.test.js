import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../../supabase/migrations/20260529000000_license_access.sql', import.meta.url),
  'utf8'
);

describe('license access migration', () => {
  it('creates license tables with RLS enabled', () => {
    expect(migration).toContain('create table if not exists public.clubs');
    expect(migration).toContain('create table if not exists public.profiles');
    expect(migration).toContain('create table if not exists public.devices');
    expect(migration).toContain('create table if not exists public.license_checks');
    expect(migration).toContain('alter table public.clubs enable row level security');
    expect(migration).toContain('alter table public.profiles enable row level security');
    expect(migration).toContain('alter table public.devices enable row level security');
    expect(migration).toContain('alter table public.license_checks enable row level security');
  });

  it('allows only own pending device inserts and own license logs', () => {
    expect(migration).toContain("status = 'pending'");
    expect(migration).toContain('user_id = auth.uid()');
    expect(migration).toContain('p.club_id = devices.club_id');
    expect(migration).toContain('p.club_id = license_checks.club_id');
    expect(migration).toContain('d.user_id = auth.uid()');
  });

  it('adds a secure RPC for last_seen updates without client-side self-approval', () => {
    expect(migration).toContain('create or replace function public.touch_own_device_last_seen');
    expect(migration).toContain('security definer');
    expect(migration).toContain('set search_path = public');
    expect(migration).toContain('last_seen_at = now()');
    expect(migration).not.toMatch(/create policy[\s\S]+for update[\s\S]+on public\.devices/i);
    expect(migration).not.toMatch(/status\s*=\s*'approved'[\s\S]+with check/i);
  });
});

const personalInfoMigration = readFileSync(
  new URL('../../../../supabase/migrations/20260530000000_personal_device_info.sql', import.meta.url),
  'utf8'
);

describe('personal device information migration', () => {
  it('adds personal fields without allowing users to approve themselves', () => {
    expect(personalInfoMigration).toContain('alter table public.profiles');
    expect(personalInfoMigration).toContain('first_name');
    expect(personalInfoMigration).toContain('last_name');
    expect(personalInfoMigration).toContain('age');
    expect(personalInfoMigration).toContain('app_role');
    expect(personalInfoMigration).toContain('is_player');
    expect(personalInfoMigration).toContain('position');
    expect(personalInfoMigration).toContain('owner_position');
    expect(personalInfoMigration).toContain('prevent_profile_privilege_update');
    expect(personalInfoMigration).toContain('new.status is distinct from old.status');
    expect(personalInfoMigration).toContain('for update');
  });
});

const passwordMigration = readFileSync(
  new URL('../../../../supabase/migrations/20260530010000_password_auth.sql', import.meta.url),
  'utf8'
);

describe('password auth migration', () => {
  it('adds only password metadata to profiles and never stores passwords', () => {
    expect(passwordMigration).toContain('password_configured boolean not null default false');
    expect(passwordMigration).toContain('password_configured_at timestamptz null');
    expect(passwordMigration).toContain('create or replace function public.prevent_profile_privilege_update');
    expect(passwordMigration).toContain('prevent_profile_privilege_update');
    expect(passwordMigration).toContain('create or replace function public.mark_own_password_configured');
    expect(passwordMigration).toContain('security definer');
    expect(passwordMigration).toContain('p_password_configured_at');
    expect(passwordMigration).not.toContain('password text');
    expect(passwordMigration).not.toContain('password_hash');
    expect(passwordMigration).not.toContain('password varchar');
  });
});

const openSignupMigrationUrl = new URL(
  '../../../../supabase/migrations/20260609000000_open_signup_device_approval.sql',
  import.meta.url
);
const openSignupMigration = existsSync(openSignupMigrationUrl)
  ? readFileSync(openSignupMigrationUrl, 'utf8')
  : '';

const requiredProfileMigrationUrl = new URL(
  '../../../../supabase/migrations/20260609010000_required_profile_completion.sql',
  import.meta.url
);
const requiredProfileMigration = existsSync(requiredProfileMigrationUrl)
  ? readFileSync(requiredProfileMigrationUrl, 'utf8')
  : '';
const deviceIdentityV2MigrationUrl = new URL(
  '../../../../supabase/migrations/20260610000000_device_identity_v2.sql',
  import.meta.url
);
const deviceIdentityV2Migration = existsSync(deviceIdentityV2MigrationUrl)
  ? readFileSync(deviceIdentityV2MigrationUrl, 'utf8')
  : '';

describe('open signup device approval migration', () => {
  it('supports pending, approved, rejected and revoked device statuses', () => {
    expect(openSignupMigration).toContain("status in ('pending', 'approved', 'rejected', 'revoked')");
    expect(openSignupMigration).toContain("update public.devices set status = 'rejected' where status = 'blocked'");
    expect(openSignupMigration).toContain('revoked_at');
    expect(openSignupMigration).toContain('approved_at');
  });

  it('allows own profile creation with safe defaults but not self-admin changes', () => {
    expect(openSignupMigration).toContain('create policy "insert own approved analyst profile"');
    expect(openSignupMigration).toContain('id = auth.uid()');
    expect(openSignupMigration).toContain("status = 'approved'");
    expect(openSignupMigration).toContain("role = 'analyst'");
    expect(openSignupMigration).toContain('ai_enabled = false');
    expect(openSignupMigration).toContain('ai_daily_limit = 30');
    expect(openSignupMigration).toContain('ai_revoked_at is null');
    expect(openSignupMigration).toContain('profiles_prevent_admin_field_update');
    expect(openSignupMigration).toContain('new.ai_enabled is distinct from old.ai_enabled');
  });

  it('lets clients create only their own pending devices without self approval', () => {
    expect(openSignupMigration).toContain('create policy "insert own pending device"');
    expect(openSignupMigration).toContain('user_id = auth.uid()');
    expect(openSignupMigration).toContain("status = 'pending'");
    expect(openSignupMigration).toContain('approved_at is null');
    expect(openSignupMigration).toContain('revoked_at is null');
    expect(openSignupMigration).not.toMatch(/for update[\s\S]+on public\.devices[\s\S]+status\s*=\s*'approved'/i);
    expect(openSignupMigration).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});

describe('required profile completion migration', () => {
  it('adds generated profile display names without making admin role self-assignable', () => {
    expect(requiredProfileMigration).toContain('add column if not exists display_name');
    expect(requiredProfileMigration).toContain('set_profile_display_name');
    expect(requiredProfileMigration).toContain("profiles_app_role_visible_check");
    expect(requiredProfileMigration).toContain("profiles_player_position_visible_check");
    expect(requiredProfileMigration).toContain("role");
    expect(requiredProfileMigration).not.toMatch(/profiles_role_check[\s\S]*jugador/i);
    expect(requiredProfileMigration).not.toContain('ai_enabled = true');
    expect(requiredProfileMigration).not.toContain("devices.status = 'approved'");
  });
});

describe('device identity v2 migration', () => {
  it('adds stable non-network identity columns and v2 migration RPCs', () => {
    expect(deviceIdentityV2Migration).toContain('add column if not exists fingerprint_version integer not null default 1');
    expect(deviceIdentityV2Migration).toContain('add column if not exists installation_id_hash text null');
    expect(deviceIdentityV2Migration).toContain('add column if not exists machine_id_hash text null');
    expect(deviceIdentityV2Migration).toContain('add column if not exists updated_at timestamptz not null default now()');
    expect(deviceIdentityV2Migration).toContain('create or replace function public.touch_own_device_identity_v2');
    expect(deviceIdentityV2Migration).toContain('create or replace function public.migrate_own_device_identity_v2');
    expect(deviceIdentityV2Migration).toContain('fingerprint_version = 2');
    expect(deviceIdentityV2Migration).toContain("status = 'rejected'");
    expect(deviceIdentityV2Migration).not.toMatch(/ip_address|ssid|gateway|dns|mac_address|network/i);
  });

  it('does not add policies that let clients approve or revoke arbitrary devices', () => {
    expect(deviceIdentityV2Migration).not.toMatch(/create policy[\s\S]+for update[\s\S]+on public\.devices/i);
    expect(deviceIdentityV2Migration).not.toMatch(/status\s*=\s*'approved'[\s\S]+auth\.uid/i);
    expect(deviceIdentityV2Migration).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(deviceIdentityV2Migration).not.toContain('service_role');
  });
});
