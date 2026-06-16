// @ts-check

/**
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} env
 * @returns {boolean}
 */
function hasSupabaseAuthConfig(env = process.env) {
  return Boolean(String(env.SUPABASE_URL || '').trim() && String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim());
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function normalizeDailyLimit(value, fallback = 30) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

/**
 * @param {{env?: NodeJS.ProcessEnv|Record<string, string|undefined>, createClient?: function(string, string, object): object}} [options]
 */
function createSupabaseAuthService(options = {}) {
  const env = options.env || process.env;
  const supabaseUrl = String(env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  let clientPromise = null;

  async function getClient() {
    if (!clientPromise) {
      clientPromise = (async () => {
        if (!supabaseUrl || !serviceRoleKey) {
          throw new Error('Supabase Auth backend is not configured.');
        }
        const createClient = options.createClient || (await import('@supabase/supabase-js')).createClient;
        return createClient(supabaseUrl, serviceRoleKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
      })();
    }
    return clientPromise;
  }

  return {
    mode: 'supabase',

    /**
     * @param {string} accessToken
     * @returns {Promise<object>}
     */
    async authenticateToken(accessToken) {
      const token = String(accessToken || '').trim();
      if (!token) {
        return { ok: false, status: 401, code: 'unauthorized', message: 'Token Supabase requerido.' };
      }

      const client = await getClient();
      const userResult = await client.auth.getUser(token);
      const user = userResult.data?.user || null;
      if (userResult.error || !user?.id) {
        return { ok: false, status: 401, code: 'unauthorized', message: 'Token Supabase invalido.' };
      }

      const profileResult = await client
        .from('profiles')
        .select('id, status, ai_enabled, ai_daily_limit, ai_revoked_at, role')
        .eq('id', user.id)
        .maybeSingle();

      if (profileResult.error) throw profileResult.error;

      const profile = profileResult.data || null;
      if (!profile || profile.status !== 'approved' || profile.ai_enabled !== true || profile.ai_revoked_at) {
        return {
          ok: false,
          status: 403,
          code: 'ai_forbidden',
          message: 'IA no habilitada para este usuario.',
          userId: user.id,
          user,
          aiAccess: profile ? {
            status: profile.status || null,
            enabled: profile.ai_enabled === true,
            dailyLimit: normalizeDailyLimit(profile.ai_daily_limit, 30),
            role: profile.role || null,
            revokedAt: profile.ai_revoked_at || null,
          } : null,
        };
      }

      return {
        ok: true,
        userId: user.id,
        user,
        aiAccess: {
          status: profile.status || null,
          enabled: true,
          dailyLimit: normalizeDailyLimit(profile.ai_daily_limit, 30),
          role: profile.role || null,
          revokedAt: profile.ai_revoked_at || null,
        },
      };
    },
  };
}

module.exports = {
  createSupabaseAuthService,
  hasSupabaseAuthConfig,
  normalizeDailyLimit,
};
