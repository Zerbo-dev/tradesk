import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env";

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (!client) {
    const env = getEnv();
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export async function rpc<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}
