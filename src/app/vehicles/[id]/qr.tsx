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
import * as FileSystem from "expo-file-system";

import { buildScanUrl, fetchPublicVehicleByToken, getOrCreateVehicleQr, getVehicle } from "@/api/client";
import { QRCodeResponse, Vehicle } from "@/api/types";

type LoadState = "loading" | "ready" | "error";

/**
 * Owner-facing "My QR code" screen for a single vehicle.
 *
 * Native (iOS/Android): Print.printToFileAsync -> copy into a known cache
 * path -> Sharing.shareAsync, per the standard expo workaround for the
 * "Not allowed to read file under given URL" FileProvider quirk.
 *
 * Web: expo-print/expo-sharing don't produce a downloadable file in a
 * browser (printToFileAsync just opens the print dialog there too), so
 * web builds the sticker as a PNG on a <canvas> and triggers a real
 * browser download via a blob URL instead.
 */
export default function VehicleQrScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [qr, setQr] = useState<QRCodeResponse | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [verifying, setVerifying] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  const shareQr = useCallback(async () => {
    if (!qr) return;
    const scanUrl = buildScanUrl(qr.token);

    if (Platform.OS === "web") {
      // No filesystem / native share sheet on web — use the Web Share API
      // for the link itself if the browser supports it.
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

    const available = await Sharing.isAvailableAsync();
    if (!available) {
      Alert.alert("Sharing unavailable", `You can share this link manually: ${scanUrl}`);
      return;
    }
    try {
      const { uri } = await Print.printToFileAsync({
        html: buildStickerHtml(scanUrl, qr.qr_image_url, vehicle),
      });
      const safeUri = `${FileSystem.cacheDirectory}parkconnect-qr-${qr.token}.pdf`;
      await FileSystem.copyAsync({ from: uri, to: safeUri });
      await Sharing.shareAsync(safeUri, {
        mimeType: "application/pdf",
        dialogTitle: "Share your ParkConnect QR code",
      });
    } catch (err) {
      console.error("shareQr failed:", err);
      Alert.alert("Couldn't share", "Something went wrong preparing the file to share.");
    }
  }, [qr, vehicle]);

  const exportPdf = useCallback(async () => {
    if (!qr) return;
    setExporting(true);
    try {
      const label = vehicle ? `${vehicle.brand} ${vehicle.model}` : "ParkConnect";

      if (Platform.OS === "web") {
        await downloadStickerPng(qr.qr_image_url, label, `parkconnect-qr-${qr.token}.png`);
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

      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(safeUri, {
          mimeType: "application/pdf",
          dialogTitle: "Save or print your QR sticker",
        });
      } else {
        Alert.alert("Saved", `PDF created at ${safeUri}, but sharing isn't available on this device.`);
      }
    } catch (err) {
      console.error("exportPdf failed:", err);
      Alert.alert("Couldn't export", "Something went wrong preparing the file to export.");
    } finally {
      setExporting(false);
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

      <TouchableOpacity style={styles.buttonPrimary} onPress={shareQr}>
        <Text style={styles.buttonPrimaryText}>Share QR code</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.buttonSecondary}
        onPress={exportPdf}
        disabled={exporting}
      >
        {exporting ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.buttonSecondaryText}>
            {Platform.OS === "web" ? "Download printable sticker" : "Export printable sticker (3in)"}
          </Text>
        )}
      </TouchableOpacity>

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

function buildStickerHtml(scanUrl: string, qrImageUrl: string | null, vehicle: Vehicle | null): string {
  const label = vehicle ? `${vehicle.brand} ${vehicle.model}` : "ParkConnect";
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
// real file. Native platforms never call this — they use expo-print instead.
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