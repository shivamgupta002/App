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

import { buildScanUrl, fetchPublicVehicleByToken, getOrCreateVehicleQr, getVehicle } from "@/api/client";
import { QRCodeResponse, Vehicle } from "@/api/types";

type LoadState = "loading" | "ready" | "error";

/**
 * Owner-facing "My QR code" screen for a single vehicle.
 *
 * Covers PRODUCTION_PROMPT.md §3 items:
 *   - in-app SVG/image render (existing qr_image_url from Cloudinary)
 *   - "share QR" via the native share sheet
 *   - printable PDF export at a fixed 3in square sticker size
 *   - a distinct confirmation state after regenerate — see the callout
 *     below on why there is currently no regenerate action to confirm.
 *
 * IMPORTANT — regeneration: the backend endpoint this screen calls
 * (POST /vehicles/{id}/qr, see app/routers/qr.py) is idempotent by design:
 * it always returns the vehicle's one existing token if one exists, and
 * never issues a new one. There is no "regenerate old code deactivated"
 * flow to build here because the backend has no such capability yet. If
 * that capability gets added server-side, this screen's "Regenerate" button
 * (currently omitted) and its confirmation state should be added together
 * with it — do not simulate invalidation client-side, since the old token
 * would still resolve on the backend.
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

  // Confirms the freshly issued/fetched token actually resolves via the
  // public scan endpoint before telling the owner their sticker is good —
  // this is the "confirm regenerate flow actually invalidates/works
  // server-side before the UI claims success" requirement from the spec,
  // adapted to the idempotent issue flow that actually exists today.
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
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      Alert.alert("Sharing unavailable", `You can share this link manually: ${scanUrl}`);
      return;
    }
    // expo-sharing shares a local file URI most reliably across platforms;
    // for a plain link share, generate a tiny HTML file with the link and
    // let the share sheet's own "copy link"/"message" targets handle it,
    // rather than trying to share a bare string (unsupported on iOS).
    try {
      const { uri } = await Print.printToFileAsync({
        html: buildStickerHtml(scanUrl, qr.qr_image_url, vehicle),
      });
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Share your ParkConnect QR code",
      });
    } catch (err) {
      Alert.alert("Couldn't share", "Something went wrong preparing the file to share.");
    }
  }, [qr, vehicle]);

  const exportPdf = useCallback(async () => {
    if (!qr) return;
    setExporting(true);
    try {
      // Fixed 3in square sticker, per spec: 3in * 72pt/in = 216pt.
      const { uri } = await Print.printToFileAsync({
        html: buildStickerHtml(buildScanUrl(qr.token), qr.qr_image_url, vehicle),
        width: 216,
        height: 216,
      });

      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Save or print your QR sticker",
        });
      } else if (Platform.OS === "web") {
        // On web, Print.printToFileAsync isn't meaningful the same way —
        // fall back to the browser print dialog for the current page.
        await Print.printAsync({ html: buildStickerHtml(buildScanUrl(qr.token), qr.qr_image_url, vehicle) });
      } else {
        Alert.alert("Saved", `PDF created at ${uri}, but sharing isn't available on this device.`);
      }
    } catch {
      Alert.alert("Export failed", "Couldn't generate the PDF. Please try again.");
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
          <Text style={styles.buttonSecondaryText}>Export printable sticker (3in)</Text>
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
  // Minimal, print-safe HTML: no external fonts/scripts, since this is
  // rendered to PDF on-device via expo-print, not in a browser.
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