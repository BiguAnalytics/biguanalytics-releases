import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../../supabase/migrations/20260531000000_cloud_sync_lightweight.sql', import.meta.url),
  'utf8'
);
const accessHardeningMigrationUrl = new URL(
  '../../../../supabase/migrations/20260607000000_rls_access_hardening.sql',
  import.meta.url
);
const accessHardeningMigration = existsSync(accessHardeningMigrationUrl)
  ? readFileSync(accessHardeningMigrationUrl, 'utf8')
  : '';
const deviceApprovedMigrationUrl = new URL(
  '../../../../supabase/migrations/20260607010000_device_approved_rls.sql',
  import.meta.url
);
const deviceApprovedMigration = existsSync(deviceApprovedMigrationUrl)
  ? readFileSync(deviceApprovedMigrationUrl, 'utf8')
  : '';
const scoreMigrationUrl = new URL(
  '../../../../supabase/migrations/20260609020000_match_score_columns.sql',
  import.meta.url
);
const scoreMigrationExists = existsSync(scoreMigrationUrl);
const scoreMigration = scoreMigrationExists
  ? readFileSync(scoreMigrationUrl, 'utf8')
  : '';
const clubSyncContractMigrationUrl = new URL(
  '../../../../supabase/migrations/20260616000000_club_cloud_sync_contract.sql',
  import.meta.url
);
const clubSyncContractMigrationExists = existsSync(clubSyncContractMigrationUrl);
const clubSyncContractMigration = clubSyncContractMigrationExists
  ? readFileSync(clubSyncContractMigrationUrl, 'utf8')
  : '';

describe('cloud sync lightweight migration', () => {
  it('creates only lightweight rugby sync tables with RLS enabled', () => {
    [
      'matches',
      'video_references',
      'match_events',
      'match_possessions',
      'match_sequences',
      'match_notes',
    ].forEach((table) => {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    });

    expect(migration).not.toMatch(/dashboard/i);
    expect(migration).not.toMatch(/mp4_blob|video_blob|pdf_blob|rendered_dashboard/i);
  });

  it('uses profiles.club_id policies to prevent cross-club access', () => {
    expect(migration).toContain('p.id = auth.uid()');
    expect(migration).toContain('p.club_id = matches.club_id');
    expect(migration).toContain('p.club_id = match_events.club_id');
    expect(migration).toContain('p.club_id = match_possessions.club_id');
    expect(migration).toContain('p.club_id = match_sequences.club_id');
    expect(migration).toContain('p.club_id = m.club_id');
    expect(migration).toContain('profiles p');
  });

  it('does not introduce privileged Electron credentials', () => {
    expect(migration).not.toContain('service_role');
    expect(migration).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(migration).not.toContain('jwt_secret');
  });
});

describe('cloud sync approved device RLS migration', () => {
  it('requires an approved device fingerprint header for business data access', () => {
    expect(deviceApprovedMigration).toContain('create or replace function public.request_device_fingerprint_hash');
    expect(deviceApprovedMigration).toContain("current_setting('request.headers', true)");
    expect(deviceApprovedMigration).toContain('x-bigu-device-fingerprint');
    expect(deviceApprovedMigration).toContain('create or replace function public.has_approved_request_device');
    expect(deviceApprovedMigration).toContain("d.status = 'approved'");
    expect(deviceApprovedMigration).toContain('d.fingerprint_hash = public.request_device_fingerprint_hash()');
    expect(deviceApprovedMigration).toContain('public.has_approved_request_device(p_club_id)');
    expect(deviceApprovedMigration).not.toMatch(/\bto\s+anon\b/i);
  });
});

describe('cloud sync RLS access hardening migration', () => {
  it('keeps business table policies authenticated-only and gated by approved active clubs', () => {
    expect(accessHardeningMigration).toContain('create or replace function public.is_active_club_member');
    expect(accessHardeningMigration).toContain("p.status = 'approved'");
    expect(accessHardeningMigration).toContain("c.license_status in ('trial', 'active')");
    expect(accessHardeningMigration).toContain('(c.expires_at is null or c.expires_at > now())');
    expect(accessHardeningMigration).not.toMatch(/\bto\s+anon\b/i);

    [
      'matches',
      'video_references',
      'match_events',
      'match_possessions',
      'match_sequences',
      'match_notes',
    ].forEach((table) => {
      expect(accessHardeningMigration).toContain(`on public.${table}`);
      expect(accessHardeningMigration).toContain('to authenticated');
      expect(accessHardeningMigration).toContain('public.is_active_club_member');
    });
  });

  it('does not let direct clients approve users, licenses, clubs, or devices', () => {
    expect(accessHardeningMigration).not.toMatch(/create policy[\s\S]+for update[\s\S]+on public\.clubs/i);
    expect(accessHardeningMigration).not.toMatch(/create policy[\s\S]+for update[\s\S]+on public\.devices/i);
    expect(accessHardeningMigration).not.toMatch(/on public\.profiles[\s\S]+for update[\s\S]+status\s*=\s*'approved'/i);
    expect(accessHardeningMigration).not.toMatch(/on public\.devices[\s\S]+for update[\s\S]+status\s*=\s*'approved'/i);
    expect(accessHardeningMigration).not.toMatch(/on public\.clubs[\s\S]+license_status[\s\S]+with check/i);
  });
});

describe('cloud sync match score migration', () => {
  it('adds persistent match score columns with safe defaults and backfill', () => {
    expect(scoreMigrationExists).toBe(true);
    [
      'local_score',
      'rival_score',
      'bigua_score',
      'opponent_score',
      'winner_team',
      'result_for_bigua',
      'score_updated_at',
    ].forEach((column) => {
      expect(scoreMigration).toContain(column);
    });
    expect(scoreMigration).toContain("default 0");
    expect(scoreMigration).toContain("default 'unknown'");
    expect(scoreMigration).toContain("check (result_for_bigua in ('win', 'loss', 'draw', 'unknown'))");
    expect(scoreMigration).toContain('match_events');
    expect(scoreMigration).toContain("event_type = 'points'");
    expect(scoreMigration).not.toContain('service_role');
  });
});

describe('cloud sync club visibility contract migration', () => {
  it('documents club-level visibility and keeps created_by as audit metadata only', () => {
    expect(clubSyncContractMigrationExists).toBe(true);
    expect(clubSyncContractMigration).toContain('comment on table public.matches');
    expect(clubSyncContractMigration).toContain('club-level visibility');
    expect(clubSyncContractMigration).toContain('created_by is audit metadata');
    expect(clubSyncContractMigration).toContain('comment on policy "matches read active club" on public.matches');
    expect(clubSyncContractMigration).toContain('public.is_active_club_member(matches.club_id)');
    expect(clubSyncContractMigration).not.toContain('created_by = auth.uid() and public.is_active_club_member(matches.club_id)');
  });

  it('adds club-scoped indexes for cloud hydration tables without cross-club reads', () => {
    expect(clubSyncContractMigrationExists).toBe(true);
    [
      'match_events_club_match_updated_idx',
      'match_possessions_club_match_start_idx',
      'match_sequences_club_match_start_idx',
      'match_notes_club_match_updated_idx',
    ].forEach((indexName) => {
      expect(clubSyncContractMigration).toContain(indexName);
    });
    expect(clubSyncContractMigration).not.toContain('to anon');
    expect(clubSyncContractMigration).not.toContain('service_role');
  });
});
