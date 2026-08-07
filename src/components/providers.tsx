"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

import type { AppUser } from "@/lib/types";
import { syncAuthProfile } from "@/lib/data/store";
import { withTimeout } from "@/lib/data/shared";
import { LANGUAGE_STORAGE_KEY, type Language } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
});

const AUTH_SESSION_TIMEOUT_MS = 4000;

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: () => undefined,
});

function mapSessionUser(nextUser: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): AppUser {
  return {
    uid: nextUser.id,
    email: nextUser.email ?? "",
    firstName:
      typeof nextUser.user_metadata?.first_name === "string"
        ? nextUser.user_metadata.first_name
        : "",
    lastName:
      typeof nextUser.user_metadata?.last_name === "string"
        ? nextUser.user_metadata.last_name
        : "",
    displayName:
      typeof nextUser.user_metadata?.display_name === "string"
        ? nextUser.user_metadata.display_name
        : "",
    dateOfBirth:
      typeof nextUser.user_metadata?.date_of_birth === "string"
        ? nextUser.user_metadata.date_of_birth
        : "",
  };
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguageState] = useState<Language>("en");
  const profileSyncSignatureRef = useRef("");

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const applySessionUser = (
      nextUser:
        | {
            id: string;
            email?: string | null;
            user_metadata?: Record<string, unknown> | null;
          }
        | null
        | undefined,
    ) => {
      if (!nextUser) {
        profileSyncSignatureRef.current = "";
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(mapSessionUser(nextUser));
      setLoading(false);
      const profileSyncSignature = `${nextUser.id}:${JSON.stringify(
        nextUser.user_metadata ?? {},
      )}`;
      if (profileSyncSignatureRef.current === profileSyncSignature) return;
      profileSyncSignatureRef.current = profileSyncSignature;

      void syncAuthProfile(nextUser)
        .then((profileUser) => {
          setUser(profileUser);
        })
        .catch(() => undefined);
    };

    void withTimeout(
      supabase.auth.getSession(),
      AUTH_SESSION_TIMEOUT_MS,
      "Authentication check timed out.",
    )
      .then(({ data }) => {
        applySessionUser(data.session?.user);
      })
      .catch(() => {
        applySessionUser(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySessionUser(session?.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (savedLanguage === "en" || savedLanguage === "kr") {
      setLanguageState(savedLanguage);
    }
  }, []);

  const setLanguage = (nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      <AuthContext.Provider value={{ user, loading }}>
        {children}
      </AuthContext.Provider>
    </LanguageContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useLanguage() {
  return useContext(LanguageContext);
}
