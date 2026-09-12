import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { register as apiRegister } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { validateOtpCode } from "@/utils/validation";

// Matches backend: @limiter.limit("5/5minutes") on /auth/register and
// /auth/verify-otp (app/routers/auth.py). We mirror the same ceiling
// client-side so the user gets a clear lockout message instead of a raw
// 429 after their 6th attempt, and a 60s resend cooldown so they can't
// hammer /auth/register (which is what actually re-sends the OTP).
const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyOtpScreen() {
  const router = useRouter();
  const { verifyOtp } = useAuth();
  const params = useLocalSearchParams<{
    phone_number: string;
    full_name?: string;
    email?: string;
    password?: string;
  }>();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_VERIFY_ATTEMPTS);
  const [lockedOut, setLockedOut] = useState(false);

  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = useCallback(() => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, []);

  // Registration already sent the first OTP; start the cooldown immediately
  // on mount so the resend button isn't usable right away.
  useEffect(() => {
    startCooldown();
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, [startCooldown]);

  const handleVerify = useCallback(async () => {
    if (lockedOut) return;
    const validation = validateOtpCode(code);
    if (!validation.valid) {
      setError(validation.error ?? "Invalid code");
      return;
    }

    setError(null);
    setVerifying(true);
    try {
      await verifyOtp(params.phone_number, code.trim());
      router.replace("/");
    } catch (err: any) {
      const remaining = attemptsLeft - 1;
      setAttemptsLeft(remaining);

      if (err?.response?.status === 429 || remaining <= 0) {
        setLockedOut(true);
        setError(
          "Too many attempts. Please wait a few minutes before trying again."
        );
      } else {
        setError(
          `Invalid or expired code. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`
        );
      }
    } finally {
      setVerifying(false);
    }
  }, [code, lockedOut, attemptsLeft, params.phone_number, verifyOtp, router]);

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || resending) return;
    if (!params.full_name || !params.email || !params.password) {
      // We only have phone_number if the user navigated here directly;
      // resend requires the original registration payload, which the
      // register screen should always pass through as route params.
      Alert.alert(
        "Can't resend from here",
        "Please go back and submit the registration form again."
      );
      return;
    }

    setResending(true);
    try {
      await apiRegister({
        full_name: params.full_name,
        email: params.email,
        phone_number: params.phone_number,
        password: params.password,
      });
      startCooldown();
      setAttemptsLeft(MAX_VERIFY_ATTEMPTS);
      setLockedOut(false);
      Alert.alert("Code sent", "A new verification code has been sent.");
    } catch (err: any) {
      if (err?.response?.status === 429) {
        Alert.alert(
          "Too many requests",
          "Please wait a few minutes before requesting another code."
        );
      } else {
        Alert.alert("Couldn't resend", "Something went wrong. Please try again.");
      }
    } finally {
      setResending(false);
    }
  }, [cooldown, resending, params, startCooldown]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify your phone</Text>
      <Text style={styles.subtitle}>
        Enter the code we sent to {params.phone_number}
      </Text>

      <TextInput
        style={styles.input}
        placeholder="123456"
        keyboardType="number-pad"
        value={code}
        onChangeText={(v) => {
          setCode(v);
          setError(null);
        }}
        editable={!lockedOut}
        maxLength={8}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.buttonPrimary, (verifying || lockedOut) && styles.buttonDisabled]}
        onPress={handleVerify}
        disabled={verifying || lockedOut}
      >
        {verifying ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonPrimaryText}>Verify</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.resendButton}
        onPress={handleResend}
        disabled={cooldown > 0 || resending}
      >
        {resending ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.resendText}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", gap: 16 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    textAlign: "center",
    letterSpacing: 4,
  },
  errorText: { color: "#D92D20", fontSize: 13, textAlign: "center" },
  buttonPrimary: {
    backgroundColor: "#208AEF",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  resendButton: { paddingVertical: 10, alignItems: "center" },
  resendText: { color: "#208AEF", fontSize: 14, fontWeight: "500" },
});