export type SupabaseRuntimeConfig = {
  url: string;
  publishableKey: string;
};

const SUPABASE_URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_PUBLISHABLE_KEY = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
const SUPABASE_LEGACY_ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function readSupabaseRuntimeConfig(): SupabaseRuntimeConfig | null {
  const url = readEnv(SUPABASE_URL_KEY);
  const publishableKey =
    readEnv(SUPABASE_PUBLISHABLE_KEY) ?? readEnv(SUPABASE_LEGACY_ANON_KEY);

  if (!url || !publishableKey) {
    return null;
  }

  return { url, publishableKey };
}

export function getSupabaseRuntimeConfig() {
  const config = readSupabaseRuntimeConfig();

  if (!config) {
    throw new Error(
      `Missing Supabase runtime config. Set ${SUPABASE_URL_KEY} and ${SUPABASE_PUBLISHABLE_KEY} in .env.local.`,
    );
  }

  return config;
}
