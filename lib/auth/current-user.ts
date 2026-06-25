import { cache } from "react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

type CurrentUserResult = {
  user: User | null;
  error: Error | null;
};

export const getCurrentUser = cache(async (): Promise<CurrentUserResult> => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return {
    user,
    error: error ?? null,
  };
});

export async function requireCurrentUser(
  message: string,
): Promise<User> {
  const { user, error } = await getCurrentUser();

  if (error || !user) {
    throw new Error(message);
  }

  return user;
}

export async function requireCurrentUserId(message: string): Promise<string> {
  const user = await requireCurrentUser(message);

  return user.id;
}
