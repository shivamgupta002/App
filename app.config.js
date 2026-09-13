// app.config.js
//
// Replaces the static app.json so we can read env vars at config-eval time
// and expose them to the app via `expo-constants` (Constants.expoConfig.extra).
// This is what src/api/client.ts reads:
//   Constants.expoConfig?.extra?.API_BASE_URL
//   Constants.expoConfig?.extra?.USE_MOCK
//
// Do NOT keep both app.json and app.config.js — Expo prefers app.config.js
// when both exist, but having both is confusing and a common source of
// "why isn't my env change taking effect" bugs. Delete app.json once this
// file is confirmed working (`npx expo config` to print the resolved config).
//
// Env source: APP_ENV picks which .env.<env> file to load (see below).
// Actual secret values are NOT committed — see .env.example for the shape
// each file must have. EAS Build injects the same vars via `eas.json`
// build profile `env` blocks (Phase 8), so this file works identically
// locally and in CI.

const path = require("path");

// dotenv is a transitive dep of Expo CLI, but depend on it explicitly if you
// hit a "cannot find module 'dotenv'" error: `npm install --save-dev dotenv`
require("dotenv").config({
  path: path.resolve(
    __dirname,
    `.env.${process.env.APP_ENV || "development"}`
  ),
});

const APP_ENV = process.env.APP_ENV || "development";

// Distinct bundle identifiers per environment so development / preview /
// production builds can be installed side by side on the same device
// (see Phase 8 EAS Build profiles). Adjust the base identifier to your
// real one before shipping.
const BUNDLE_ID_BASE = "com.parkconnect.app";
const bundleIdSuffix =
  APP_ENV === "production" ? "" : APP_ENV === "preview" ? ".preview" : ".dev";

const APP_NAME =
  APP_ENV === "production"
    ? "ParkConnect"
    : APP_ENV === "preview"
      ? "ParkConnect (Preview)"
      : "ParkConnect (Dev)";

/** @param {import('@expo/config-types').ExpoConfig} config */
module.exports = ({ config }) => {
  return {
    ...config,
    name: APP_NAME,
    slug: "parkconnect",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "parkconnect",
    userInterfaceStyle: "automatic",

    ios: {
      ...config.ios,
      icon: "./assets/expo.icon",
      bundleIdentifier: `${BUNDLE_ID_BASE}${bundleIdSuffix}`,
      // Required Aug 2024+: iOS privacy manifest — declares why the app
      // touches "required reason" APIs. UserDefaults is the common one
      // pulled in transitively by RN/Expo modules; extend this list if
      // Xcode's App Store Connect validation flags additional APIs.
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType:
              "NSPrivacyAccessedAPICategoryUserDefaults",
            NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
          },
        ],
      },
    },

    android: {
      ...config.android,
      package: `${BUNDLE_ID_BASE}${bundleIdSuffix}`,
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
    },

    web: {
      ...config.web,
      output: "static",
      favicon: "./assets/images/favicon.png",
    },

    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#208AEF",
          image: "./assets/images/splash-icon.png",
          imageWidth: 76,
        },
      ],
      [
        "expo-sharing",
        {
          android: { enabled: true },
          ios: { enabled: true },
        },
      ],
        // "Download QR code" (native equivalent of the web download button).
        [
          "expo-media-library",
          {
            photosPermission: "Allow ParkConnect to save your QR sticker to Photos.",
            savePhotosPermission: "Allow ParkConnect to save your QR sticker to Photos.",
            isAccessMediaLocationEnabled: false,
          },
        ],
      ],

    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },

    extra: {
      APP_ENV,
      API_BASE_URL: process.env.API_BASE_URL,
      SCAN_BASE_URL: process.env.SCAN_BASE_URL,
      SENTRY_DSN: process.env.SENTRY_DSN,
      FCM_SENDER_ID: process.env.FCM_SENDER_ID,
      // Runtime mock flag — src/api/client.ts also accepts
      // EXPO_PUBLIC_USE_MOCK directly (picked up without a rebuild on web),
      // this `extra` copy is what native builds read.
      USE_MOCK: process.env.USE_MOCK === "true",
      eas: {
        // Fill in after `eas init` — required for EAS Build/Submit/Update.
        projectId: process.env.EAS_PROJECT_ID,
      },
    },

    updates: {
      // expo-updates (OTA) channel — tie to APP_ENV so `eas update` targets
      // the right channel per environment. Configure matching channels in
      // eas.json's build profiles.
      url: process.env.EAS_PROJECT_ID
        ? `https://u.expo.dev/${process.env.EAS_PROJECT_ID}`
        : undefined,
    },
    runtimeVersion: {
      policy: "appVersion",
    },
  };
};