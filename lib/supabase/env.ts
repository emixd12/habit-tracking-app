export type SupabaseRuntimeConfig = {
  url: string;
  publishableKey: string;
};

export type SupabaseServiceRoleConfig = {
  url: string;
  serviceRoleKey: string;
};

const SUPABASE_URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_PUBLISHABLE_KEY = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
const SUPABASE_LEGACY_ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
const SUPABASE_SERVICE_ROLE_KEY = "SUPABASE_SERVICE_ROLE_KEY";

function normalizeEnvValue(value: string | undefined) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

export function readSupabaseRuntimeConfig(): SupabaseRuntimeConfig | null {
  const url = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey =
    normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !publishableKey) {
    return null;
  }

  return { url, publishableKey };
}

export function getSupabaseRuntimeConfig() {
  const config = readSupabaseRuntimeConfig();

  if (!config) {
    throw new Error(
      `Missing Supabase runtime config. Set ${SUPABASE_URL_KEY} and ${SUPABASE_PUBLISHABLE_KEY} in .env.local. ${SUPABASE_LEGACY_ANON_KEY} is also accepted for older local setups.`,
    );
  }

  return config;
}

export function readSupabaseServiceRoleConfig(): SupabaseServiceRoleConfig | null {
  const url = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!url || !serviceRoleKey) {
    return null;
  }

  return { url, serviceRoleKey };
}

export function getSupabaseServiceRoleConfig(): SupabaseServiceRoleConfig {
  const config = readSupabaseServiceRoleConfig();

  if (!config) {
    throw new Error(
      `Missing Supabase service-role config. Set ${SUPABASE_URL_KEY} and ${SUPABASE_SERVICE_ROLE_KEY} in .env.local for protected server processes.`,
    );
  }

  return config;
}
