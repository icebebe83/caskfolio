import { assertSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { AppUser } from "@/lib/types";
import {
  currentOrigin,
  ensureProfile,
  readUserProfileMetadata,
  toSupabaseError,
} from "@/lib/data/shared";

export async function syncAuthProfile(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): Promise<AppUser> {
  await ensureProfile(user);

  const metadata = readUserProfileMetadata(user);
  return {
    uid: user.id,
    email: user.email ?? "",
    firstName: metadata.firstName,
    lastName: metadata.lastName,
    dateOfBirth: metadata.dateOfBirth,
  };
}

export async function signInWithEmail(email: string, password: string) {
  assertSupabaseConfigured();
  const { data, error } = await supabase!.auth.signInWithPassword({ email, password });
  if (error) throw toSupabaseError(error, "Unable to sign in.");
  if (data.user) {
    void ensureProfile(data.user).catch(() => undefined);
  }
  return data;
}

export async function registerWithEmail(input: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  dateOfBirth: string;
}): Promise<{
  credential: { user: { email: string; firstName: string; lastName: string } };
  verificationEmailSent: boolean;
}> {
  assertSupabaseConfigured();
  const { data, error } = await supabase!.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: currentOrigin() ? `${currentOrigin()}/login` : undefined,
      data: {
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        date_of_birth: input.dateOfBirth,
        terms_accepted_at: new Date().toISOString(),
      },
    },
  });
  if (error) throw toSupabaseError(error, "Unable to create account.");
  if (data.user) {
    await ensureProfile(data.user, {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      dateOfBirth: input.dateOfBirth,
      termsAcceptedAt: new Date().toISOString(),
    });
  }
  return {
    credential: {
      user: {
        email: data.user?.email ?? input.email,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
      },
    },
    verificationEmailSent: Boolean(data.user),
  };
}

export async function signInWithGoogle() {
  assertSupabaseConfigured();
  const { data, error } = await supabase!.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: currentOrigin() ? `${currentOrigin()}/mypage` : undefined,
    },
  });
  if (error) throw toSupabaseError(error, "Unable to continue with Google.");
  return {
    credential: data,
    isNewUser: false,
  };
}

export async function signOutUser() {
  assertSupabaseConfigured();
  const { error } = await supabase!.auth.signOut();
  if (error) throw toSupabaseError(error, "Unable to sign out.");
}
