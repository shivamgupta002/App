import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * expo-secure-store has NO web implementation -- calling it in a browser
 * throws "getValueWithKeyAsync is not a function" because the native
 * module simply doesn't exist there. Every caller in this app (token
 * storage, biometric-lock preference) goes through this shim instead of
 * calling `expo-secure-store` directly, so platform branching lives in
 * exactly one place.
 *
 * On native (iOS/Android): backed by Keychain/Keystore via SecureStore, as
 * required by the production-readiness spec ("Move tokens out of
 * AsyncStorage into expo-secure-store").
 *
 * On web: falls back to localStorage. This is NOT encrypted at rest and is
 * a conscious trade-off for local web development/preview only -- web
 * builds are not the primary target per app.json's ios/android config, and
 * nothing in the spec requires secure storage to work in a browser tab.
 * Do not treat this as production-safe on web; if browser-based access
 * becomes a real target, replace this branch with the browser's
 * Credential Management API or drop web support for authenticated routes.
 */
const isWeb = Platform.OS === "web";

async function getItemAsync(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function setItemAsync(key: string, value: string): Promise<void> {
  if (isWeb) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // localStorage can throw in private-browsing/quota-exceeded cases;
      // swallow rather than crash a web preview session.
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItemAsync(key: string): Promise<void> {
  if (isWeb) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // see setItemAsync
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export const secureStorage = { getItemAsync, setItemAsync, deleteItemAsync };