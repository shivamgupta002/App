import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  verifyOtp as apiVerifyOtp,
  registerAuthFailureHandler,
  tokenStorage,
} from "@/api/client";
import { TokenResponse } from "@/api/types";

type AuthStatus = "loading" | "signedIn" | "signedOut";

interface AuthContextValue {
  status: AuthStatus;
  /** True once tokens are found on disk but before we've asked biometrics
   * to unlock them (see BiometricGate). Screens gated behind auth should
   * treat "signedIn" the same regardless of biometric lock state -- the
   * lock is a UI overlay, not an auth state -- but expose it in case a
   * screen wants to react. */
  register: typeof apiRegister;
  login: (email: string, password: string) => Promise<TokenResponse>;
  verifyOtp: (phone_number: string, code: string) => Promise<TokenResponse>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");

  // On mount, check whether we already have a stored access token so we can
  // skip the login screen on a warm start.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await tokenStorage.getAccessToken();
      if (!cancelled) setStatus(token ? "signedIn" : "signedOut");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // This is the missing wiring called out in the production prompt: when
  // the axios interceptor's refresh attempt fails, it invokes whatever
  // handler was registered here, and we flip global auth state so the
  // navigator swaps back to the login stack.
  useEffect(() => {
    registerAuthFailureHandler(() => {
      setStatus("signedOut");
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await apiLogin(email, password);
    setStatus("signedIn");
    return tokens;
  }, []);

  const verifyOtp = useCallback(async (phone_number: string, code: string) => {
    const tokens = await apiVerifyOtp(phone_number, code);
    setStatus("signedIn");
    return tokens;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setStatus("signedOut");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, register: apiRegister, login, verifyOtp, logout }),
    [status, login, verifyOtp, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}