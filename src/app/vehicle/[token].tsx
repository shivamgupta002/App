import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";

import { fetchPublicVehicleByToken, initiateCall, initiateText } from "@/api/client";
import { PublicVehicleResponse } from "@/api/types";
import { validatePhoneNumber } from "@/utils/validation";

type ScreenStatus = "loading" | "ready" | "error";
type ActionKind = "call" | "emergency" | "text" | null;

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
  const [status, setStatus] = useState<ScreenStatus>("loading");

  const [activeAction, setActiveAction] = useState<ActionKind>(null);
  const [scannerPhone, setScannerPhone] = useState("");
  const [message, setMessage] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        if (!cancelled) setStatus("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const openAction = useCallback((kind: ActionKind) => {
    setActiveAction(kind);
    setScannerPhone("");
    setMessage("");
    setPhoneError(null);
  }, []);

  const closeAction = useCallback(() => {
    if (submitting) return;
    setActiveAction(null);
  }, [submitting]);

  const handleSubmit = useCallback(async () => {
    if (!token || !activeAction) return;

    const phoneCheck = validatePhoneNumber(scannerPhone);
    if (!phoneCheck.valid) {
      setPhoneError(phoneCheck.error ?? "Enter a valid phone number");
      return;
    }
    if (activeAction === "text" && !message.trim()) {
      Alert.alert("Message required", "Please enter a short message for the owner.");
      return;
    }

    setSubmitting(true);
    try {
      if (activeAction === "text") {
        await initiateText(token, scannerPhone.trim(), message.trim());
        setActiveAction(null);
        Alert.alert("Message sent", "Your message has been sent to the vehicle owner.");
      } else {
        await initiateCall(
          token,
          scannerPhone.trim(),
          activeAction === "emergency" ? "emergency" : "owner"
        );
        setActiveAction(null);
        Alert.alert("Calling you now", "You'll receive a call shortly to connect you.");
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const statusCode = err?.response?.status;
      if (statusCode === 400 && detail) {
        Alert.alert("Can't do that", detail);
      } else if (statusCode === 429) {
        Alert.alert("Too many attempts", "Please wait a bit before trying again.");
      } else {
        Alert.alert("Something went wrong", detail ?? "Please try again shortly.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [token, activeAction, scannerPhone, message]);

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

      {vehicle.is_active ? (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.buttonPrimary} onPress={() => openAction("call")}>
            <Text style={styles.buttonPrimaryText}>Call Owner</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.buttonSecondary} onPress={() => openAction("text")}>
            <Text style={styles.buttonSecondaryText}>Text Owner</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.buttonDanger}
            onPress={() => openAction("emergency")}
          >
            <Text style={styles.buttonDangerText}>Emergency Contact</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal
        visible={activeAction !== null}
        transparent
        animationType="fade"
        onRequestClose={closeAction}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {activeAction === "call"
                ? "Call Owner"
                : activeAction === "emergency"
                  ? "Contact Emergency Number"
                  : "Text Owner"}
            </Text>
            <Text style={styles.modalSubtitle}>
              Your number is only used to connect this{" "}
              {activeAction === "text" ? "message" : "call"} — it's never shown to the owner.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Your phone (+919876543210)"
              keyboardType="phone-pad"
              value={scannerPhone}
              onChangeText={(v) => {
                setScannerPhone(v);
                setPhoneError(null);
              }}
            />
            {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}

            {activeAction === "text" ? (
              <TextInput
                style={[styles.modalInput, styles.modalTextArea]}
                placeholder="Message (e.g. your car is blocking my driveway)"
                multiline
                maxLength={300}
                value={message}
                onChangeText={setMessage}
              />
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={closeAction} disabled={submitting}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, submitting && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>
                    {activeAction === "text" ? "Send" : "Call me"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 20, fontWeight: "600", textAlign: "center" },
  subtitle: { fontSize: 15, color: "#666", marginTop: 8, textAlign: "center" },
  actions: { marginTop: 28, gap: 12 },
  buttonPrimary: {
    backgroundColor: "#208AEF",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: "#208AEF",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonSecondaryText: { color: "#208AEF", fontWeight: "600", fontSize: 16 },
  buttonDanger: {
    borderWidth: 1,
    borderColor: "#D92D20",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonDangerText: { color: "#D92D20", fontWeight: "600", fontSize: 16 },
  buttonDisabled: { opacity: 0.6 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { backgroundColor: "#fff", borderRadius: 16, padding: 20, gap: 4 },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  modalSubtitle: { fontSize: 13, color: "#666", marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginTop: 8,
  },
  modalTextArea: { minHeight: 80, textAlignVertical: "top" },
  errorText: { color: "#D92D20", fontSize: 12, marginTop: 4 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalCancel: { flex: 1, paddingVertical: 12, alignItems: "center" },
  modalCancelText: { color: "#888", fontWeight: "600" },
  modalSubmit: {
    flex: 1,
    backgroundColor: "#208AEF",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  modalSubmitText: { color: "#fff", fontWeight: "700" },
});
