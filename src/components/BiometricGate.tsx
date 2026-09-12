import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";

import { secureStorage } from "@/utils/secureStorage";

// Key used to persist the user's app-lock preference. Stored via the
// secureStorage shim (SecureStore on native, localStorage on web) for
// consistency with tokenStorage, even though this value itself isn't
// sensitive -- keeps all auth-adjacent state in one storage backend.
const BIOMETRIC_LOCK_ENABLED_KEY = "pc_biometric_lock_enabled";

export async function isBiometricLockEnabled(): Promise<boolean> {
  const value = await secureStorage.getItemAsync(BIOMETRIC_LOCK_ENABLED_KEY);
  return value === "true";
}

export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  await secureStorage.setItemAsync(BIOMETRIC_LOCK_ENABLED_KEY, enabled ? "true" : "false");
}

export async function isBiometricAvailable(): Promise<boolean> {
  // expo-local-authentication also has no web implementation -- there is no
  // Face ID / fingerprint sensor API in a browser tab, so treat web as
  // "never available" instead of calling into a native module that isn't
  // there.
  if (Platform.OS === "web") return false;
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && isEnrolled;
}

/**
 * Wraps children behind an optional biometric prompt. If the user hasn't
 * enabled the app-lock setting, this renders children immediately with no
 * extra step. If enabled, it blocks rendering until Face ID / Touch ID /
 * fingerprint succeeds, with a manual "Unlock" retry button on failure
 * (auth can fail transiently -- e.g. user cancels -- and shouldn't strand
 * them on a blank screen with no way to retry).
 */
export function BiometricGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [locked, setLocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [failed, setFailed] = useState(false);

  const attemptUnlock = useCallback(async () => {
    setAuthenticating(true);
    setFailed(false);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock ParkConnect",
        fallbackLabel: "Use passcode",
        disableDeviceFallback: false,
      });
      if (result.success) {
        setLocked(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setAuthenticating(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const enabled = await isBiometricLockEnabled();
      const available = enabled && (await isBiometricAvailable());
      if (cancelled) return;

      if (available) {
        setLocked(true);
        setChecking(false);
        // Kick off the prompt immediately rather than waiting for a tap,
        // matching typical app-lock UX (Signal, banking apps, etc).
        attemptUnlock();
      } else {
        setLocked(false);
        setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptUnlock]);

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (locked) {
    return (
      <View style={styles.center}>
        {authenticating ? (
          <ActivityIndicator size="large" />
        ) : (
          <>
            <Text style={styles.title}>ParkConnect is locked</Text>
            {failed ? (
              <Text style={styles.subtitle}>Authentication failed or was cancelled.</Text>
            ) : null}
            <TouchableOpacity style={styles.button} onPress={attemptUnlock}>
              <Text style={styles.buttonText}>Unlock</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#fff",
  },
  title: { fontSize: 18, fontWeight: "600" },
  subtitle: { fontSize: 14, color: "#888", textAlign: "center" },
  button: {
    backgroundColor: "#208AEF",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});