import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
// SDK 54+ moved the old promise-based API (copyAsync, downloadAsync,
// cacheDirectory, etc.) to a dedicated "/legacy" entrypoint — the default
// "expo-file-system" export now points at the new File/Directory classes
// and throws on these calls instead. This file uses the legacy functions
// throughout, so import from there explicitly rather than "expo-file-system".
import * as FileSystem from "expo-file-system/legacy";
// SDK 54 also introduced a new default API for expo-media-library
// (Asset.create(), Query, etc. from "expo-media-library/next"-style
// imports). "/legacy" keeps the familiar requestPermissionsAsync /
// createAssetAsync / createAlbumAsync shape, matching the FileSystem
// legacy import above so this file isn't mixing old- and new-style APIs.
import * as MediaLibrary from "expo-media-library/legacy";

import { buildScanUrl, fetchPublicVehicleByToken, getOrCreateVehicleQr, getVehicle } from "@/api/client";
import { QRCodeResponse, Vehicle } from "@/api/types";

type LoadState = "loading" | "ready" | "error";

/**
 * Owner-facing "My QR code" screen for a single vehicle.
 *
 * Download vs Share — genuinely separate actions now, no share sheet
 * involved in Download at all:
 *   - "Download QR code" (native): fetches the QR PNG via
 *     ensureQrDownloaded(), then writes it directly into the device Photos
 *     library (album "ParkConnect") via expo-media-library. One tap, no
 *     dialog beyond the OS permission prompt (asked once) — the true
 *     native equivalent of a browser download.
 *   - "Share QR code" (native): calls the SAME ensureQrDownloaded() helper
 *     (so it always operates on the exact file Download most recently
 *     produced), then opens the OS share sheet on it for sending
 *     elsewhere. This is unrelated to saving — MediaLibrary is never
 *     touched here.
 *   - Web is untouched: Download triggers a real browser file download
 *     (downloadStickerPng), Share uses the Web Share API.
 *
 * IMPORTANT: expo-media-library is a native module. It does NOT work in
 * plain Expo Go — this screen requires a native rebuild:
 *   npx expo install expo-media-library
 *   (add the expo-media-library config plugin to app.config.js)
 *   npx expo prebuild --clean
 *   npx expo run:android   (or run:ios, or an EAS dev-client build)
 */
export default function VehicleQrScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [qr, setQr] = useState<QRCodeResponse | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [verifying, setVerifying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setState("loading");
    try {
      const [v, code] = await Promise.all([getVehicle(id), getOrCreateVehicleQr(id)]);
      setVehicle(v);
      setQr(code);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const verifyCodeIsLive = useCallback(async () => {
    if (!qr) return;
    setVerifying(true);
    try {
      await fetchPublicVehicleByToken(qr.token);
      Alert.alert("Code verified", "This QR code is active and resolves correctly.");
    } catch {
      Alert.alert(
        "Code not resolving",
        "This QR code did not resolve when checked just now. It may be inactive — check your subscription status."
      );
    } finally {
      setVerifying(false);
    }
  }, [qr]);

  /**
   * Native-only helper: downloads the hosted QR PNG into the app cache dir
   * and returns its local file:// uri. Used by BOTH downloadQr() and
   * shareQr() — it's the single source of truth for "what file are we
   * acting on", so Share always operates on exactly what Download most
   * recently fetched instead of running its own separate download logic.
   *
   * Cheap to call repeatedly: FileSystem.downloadAsync overwrites the same
   * cache path each time, so calling this twice in a row (Download, then
   * Share) just re-fetches the same bytes rather than accumulating files.
   */
  const ensureQrDownloaded = useCallback(async (): Promise<string> => {
    if (!qr?.qr_image_url) {
      throw new Error("No QR image available to download");
    }
    const targetUri = `${FileSystem.cacheDirectory}parkconnect-qr-${qr.token}.png`;
    const result = await FileSystem.downloadAsync(qr.qr_image_url, targetUri);
    return result.uri;
  }, [qr]);

  /**
   * "Download QR code" — the true one-tap equivalent of the web download:
   * fetches the QR PNG to cache, then writes it straight into the device's
   * Photos library inside a "ParkConnect" album via expo-media-library.
   * No share sheet, no second tap — once permission is granted, this is
   * the entire flow, same as clicking "download" in a browser.
   *
   * Requires a native rebuild (npx expo prebuild + a dev client or EAS
   * build) since expo-media-library is a native module — this will throw
   * "Cannot find native module" if run inside plain Expo Go.
   */
  const downloadQr = useCallback(async () => {
    if (!qr) return;
    setDownloading(true);
    try {
      const label = vehicle ? `${vehicle.brand} ${vehicle.model}` : "ParkConnect";

      if (Platform.OS === "web") {
        await downloadStickerPng(qr.qr_image_url, label, `parkconnect-qr-${qr.token}.png`);
        return;
      }

      const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync();

      if (status !== "granted") {
        if (!canAskAgain) {
          Alert.alert(
            "Permission needed",
            "Photo library access is off for ParkConnect. Enable it in your device Settings to download the QR code."
          );
        } else {
          Alert.alert("Permission denied", "Couldn't save to Photos without permission.");
        }
        return;
      }

      const localUri = await ensureQrDownloaded();
      const asset = await MediaLibrary.createAssetAsync(localUri);
      await MediaLibrary.createAlbumAsync("ParkConnect", asset, false);

      Alert.alert("Downloaded", "The QR code has been saved to your Photos (ParkConnect album).");
    } catch (err) {
      console.error("downloadQr failed:", err);
      Alert.alert("Couldn't download", "Something went wrong saving the QR code to Photos.");
    } finally {
      setDownloading(false);
    }
  }, [qr, vehicle, ensureQrDownloaded]);

  /**
   * "Share QR code" — reuses whatever ensureQrDownloaded() produces (the
   * exact same file Download creates) and opens the native share sheet on
   * it. This is also where the user gets to "Save Image"/"Save to
   * Downloads" on their OS, since that lives inside the share sheet itself.
   */
  const shareQr = useCallback(async () => {
    if (!qr) return;

    if (Platform.OS === "web") {
      const scanUrl = buildScanUrl(qr.token);
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        try {
          await (navigator as any).share({ title: "ParkConnect QR code", url: scanUrl });
        } catch {
          // user cancelled the browser's share sheet — not an error
        }
      } else {
        Alert.alert("Sharing unavailable", `You can share this link manually: ${scanUrl}`);
      }
      return;
    }

    setSharing(true);
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert(
          "Sharing unavailable",
          `You can share this link manually: ${buildScanUrl(qr.token)}`
        );
        return;
      }

      const localUri = await ensureQrDownloaded();
      await Sharing.shareAsync(localUri, {
        mimeType: "image/png",
        dialogTitle: "Share your ParkConnect QR code",
        UTI: "public.png",
      });
    } catch (err) {
      console.error("shareQr failed:", err);
      Alert.alert("Couldn't share", "Something went wrong preparing the file to share.");
    } finally {
      setSharing(false);
    }
  }, [qr, ensureQrDownloaded]);

  /**
   * "Export printable sticker" — unchanged from before: a separate, more
   * elaborate artifact (a 3in PDF with the vehicle name/caption baked in
   * via expo-print), distinct from the plain QR PNG that Download/Share
   * now handle. Kept as its own action since it's a different output, not
   * a duplicate of Share.
   */
  const [exportingSticker, setExportingSticker] = useState(false);
  const exportStickerPdf = useCallback(async () => {
    if (!qr) return;
    setExportingSticker(true);
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("Sharing unavailable", "This device can't open the save/share dialog.");
        return;
      }

      // Fixed 3in square sticker, per spec: 3in * 72pt/in = 216pt.
      const { uri } = await Print.printToFileAsync({
        html: buildStickerHtml(buildScanUrl(qr.token), qr.qr_image_url, vehicle),
        width: 216,
        height: 216,
      });
      const safeUri = `${FileSystem.cacheDirectory}parkconnect-sticker-${qr.token}.pdf`;
      await FileSystem.copyAsync({ from: uri, to: safeUri });

      await Sharing.shareAsync(safeUri, {
        mimeType: "application/pdf",
        dialogTitle: "Save or print your QR sticker",
      });
    } catch (err) {
      console.error("exportStickerPdf failed:", err);
      Alert.alert("Couldn't export", "Something went wrong preparing the sticker PDF.");
    } finally {
      setExportingSticker(false);
    }
  }, [qr, vehicle]);

  if (state === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (state === "error" || !qr) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Couldn't load your QR code</Text>
        <TouchableOpacity style={styles.buttonSecondary} onPress={load}>
          <Text style={styles.buttonSecondaryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>
        {vehicle ? `${vehicle.brand} ${vehicle.model}` : "Your QR code"}
      </Text>

      {qr.qr_image_url ? (
        <Image source={{ uri: qr.qr_image_url }} style={styles.qrImage} resizeMode="contain" />
      ) : (
        <View style={[styles.qrImage, styles.qrPlaceholder]}>
          <Text style={styles.subtitle}>QR image unavailable</Text>
        </View>
      )}

      <Text style={styles.tokenLabel} selectable>
        {buildScanUrl(qr.token)}
      </Text>

      <TouchableOpacity
        style={styles.buttonPrimary}
        onPress={downloadQr}
        disabled={downloading}
      >
        {downloading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonPrimaryText}>Download QR code</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.buttonSecondary}
        onPress={shareQr}
        disabled={sharing}
      >
        {sharing ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.buttonSecondaryText}>Share QR code</Text>
        )}
      </TouchableOpacity>

      {Platform.OS !== "web" ? (
        <TouchableOpacity
          style={styles.buttonSecondary}
          onPress={exportStickerPdf}
          disabled={exportingSticker}
        >
          {exportingSticker ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.buttonSecondaryText}>Export printable sticker (3in PDF)</Text>
          )}
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={styles.buttonTertiary}
        onPress={verifyCodeIsLive}
        disabled={verifying}
      >
        {verifying ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.buttonTertiaryText}>Verify this code is active</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function buildStickerHtml(
  scanUrl: string,
  qrImageUrl: string | null,
  vehicle: Vehicle | null,
  overrideLabel?: string
): string {
  const label = overrideLabel ?? (vehicle ? `${vehicle.brand} ${vehicle.model}` : "ParkConnect");
  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 12pt;
            font-family: -apple-system, Helvetica, Arial, sans-serif;
            text-align: center;
          }
          img { width: 160pt; height: 160pt; }
          .label { font-size: 9pt; margin-top: 6pt; color: #333; }
          .caption { font-size: 7pt; margin-top: 2pt; color: #777; }
        </style>
      </head>
      <body>
        ${qrImageUrl ? `<img src="${qrImageUrl}" />` : `<p>${scanUrl}</p>`}
        <div class="label">${label}</div>
        <div class="caption">Scan to contact the owner &middot; ParkConnect</div>
      </body>
    </html>
  `;
}

// ---------------------------------------------------------------------------
// Web-only: compose the sticker as a PNG on a canvas and download it as a
// real file. Native platforms never call this — they use expo-file-system
// (ensureQrDownloaded) instead.
// ---------------------------------------------------------------------------

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new (window as any).Image();
    img.crossOrigin = "anonymous"; // needed to read pixels back out via canvas
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
}

function triggerBrowserDownload(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function downloadStickerPng(
  qrImageUrl: string | null,
  label: string,
  filename: string
): Promise<void> {
  if (typeof document === "undefined") return;

  if (!qrImageUrl) {
    throw new Error("No QR image to download");
  }

  try {
    const size = 600;
    const padding = 48;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size + 120;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = await loadImage(qrImageUrl);
    ctx.drawImage(img, padding, padding, size - padding * 2, size - padding * 2);

    ctx.fillStyle = "#333333";
    ctx.font = "600 26px -apple-system, Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, canvas.width / 2, size + 44);

    ctx.fillStyle = "#777777";
    ctx.font = "18px -apple-system, Helvetica, Arial, sans-serif";
    ctx.fillText("Scan to contact the owner · ParkConnect", canvas.width / 2, size + 76);

    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
    );
    triggerBrowserDownload(URL.createObjectURL(blob), filename);
  } catch {
    // Canvas compositing can fail if the image host doesn't send permissive
    // CORS headers ("tainted canvas"). Fall back to downloading the raw
    // hosted QR PNG as a blob instead of the composed sticker.
    try {
      const resp = await fetch(qrImageUrl);
      const blob = await resp.blob();
      triggerBrowserDownload(URL.createObjectURL(blob), filename);
    } catch {
      // Last resort: open it so the user can save manually.
      window.open(qrImageUrl, "_blank");
    }
  }
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: "center", padding: 24, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 18, fontWeight: "600", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#666" },
  qrImage: { width: 220, height: 220, backgroundColor: "#f2f2f2", borderRadius: 12 },
  qrPlaceholder: { alignItems: "center", justifyContent: "center" },
  tokenLabel: { fontSize: 12, color: "#888", textAlign: "center" },
  buttonPrimary: {
    backgroundColor: "#208AEF",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
  },
  buttonPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: "#208AEF",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
  },
  buttonSecondaryText: { color: "#208AEF", fontWeight: "600", fontSize: 16 },
  buttonTertiary: { paddingVertical: 10, alignItems: "center" },
  buttonTertiaryText: { color: "#888", fontSize: 14 },
});