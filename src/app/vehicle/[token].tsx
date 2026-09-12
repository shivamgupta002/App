import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { fetchPublicVehicleByToken } from "@/api/client";
import { PublicVehicleResponse } from "@/api/types";

/**
 * Deep-link destination for a scanned QR sticker:
 *   https://parkconnect.app/vehicle/{token}  (universal link / app link)
 *   app://vehicle/{token}                     (custom scheme, dev/testing)
 *
 * Expo Router wires this up automatically from the file path — no manual
 * linking config beyond app.json's associatedDomains/intentFilters (see
 * app.json) is needed for routing itself.
 *
 * This screen intentionally renders the SAME narrow, privacy-safe fields
 * the backend's public GET /vehicle/{token} returns (vehicle_type, brand,
 * model, color, is_active) — see PublicVehicleResponse in src/api/types.ts
 * and the privacy-boundary comment in app/routers/qr.py. It does not (and
 * must not) show owner info, plate number, or emergency contact directly;
 * those stay behind the masked-call flow (Phase 5), not this screen.
 *
 * Not-found / deactivated / expired all render the same generic message,
 * mirroring the backend's refusal to distinguish those cases publicly.
 */
export default function ScannedVehicleScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [vehicle, setVehicle] = useState<PublicVehicleResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!token) {
        setStatus("error");
        return;
      }
      try {
        const result = await fetchPublicVehicleByToken(token);
        if (!cancelled) {
          setVehicle(result);
          setStatus("ready");
        }
      } catch {
        // Covers 404 (inactive/expired/nonexistent) and any network error —
        // deliberately generic, same as the backend's own generic 404.
        if (!cancelled) setStatus("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (status === "error" || !vehicle) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>This QR code is no longer active</Text>
        <Text style={styles.subtitle}>
          It may have expired, been deactivated, or never existed.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {vehicle.color} {vehicle.brand} {vehicle.model}
      </Text>
      <Text style={styles.subtitle}>
        {vehicle.vehicle_type === "car" ? "Car" : "Bike"}
        {vehicle.is_active ? "" : " · inactive"}
      </Text>
      {/* Call/report actions (Phase 5 masked calling, Report an Issue) hang
          off this same screen in later phases — not built out here since
          this file's scope is deep linking, not the calling flow itself. */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 20, fontWeight: "600", textAlign: "center" },
  subtitle: { fontSize: 15, color: "#666", marginTop: 8, textAlign: "center" },
});