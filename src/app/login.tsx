import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useAuth } from "@/context/AuthContext";
import { validateEmail } from "@/utils/validation";

interface FormErrors {
  email?: string;
  password?: string;
}

/**
 * Sign-in screen — POST /auth/login (see app/routers/auth.py::login).
 * On success, AuthContext flips global status to "signedIn" and
 * src/app/index.tsx (the auth gate) redirects to /vehicles automatically,
 * so this screen only needs to call login() and doesn't navigate itself.
 *
 * Error handling mirrors the backend's deliberately generic messaging:
 * 401 never distinguishes "no such email" from "wrong password", and 403
 * covers both the unverified-phone and suspended-account cases (backend
 * uses the same status for both, so we surface its detail message as-is).
 *
 * Visual/animation layer added on top of the same logic:
 *   - Staggered entrance (logo -> title -> fields -> button -> link) using
 *     Reanimated's built-in `entering` transitions (FadeInDown/FadeInUp),
 *     no manual worklets needed.
 *   - Button scales down on press for tactile feedback (Animated API,
 *     runs on the UI thread via Reanimated's shared values).
 *   - On a failed login, the error text + input card shake horizontally
 *     once, drawing the eye without being obnoxious.
 *   - Inputs get a subtle border-color highlight on focus.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  // --- animation values ---
  const buttonScale = useSharedValue(1);
  const shakeX = useSharedValue(0);

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const shakeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const triggerShake = useCallback(() => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 45 }),
      withTiming(10, { duration: 45 }),
      withTiming(-8, { duration: 45 }),
      withTiming(8, { duration: 45 }),
      withTiming(0, { duration: 45 })
    );
  }, [shakeX]);

  const validateAll = useCallback((): boolean => {
    const next: FormErrors = {};
    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) next.email = emailCheck.error;
    if (!password) next.password = "Password is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [email, password]);

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    if (!validateAll()) {
      triggerShake();
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // AuthContext status flips to "signedIn"; the root index.tsx gate
      // redirects to /vehicles. Nudge router just in case this screen was
      // reached via deep link rather than the gate.
      router.replace("/");
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 401) {
        setSubmitError(detail ?? "Invalid email or password");
      } else if (status === 403) {
        setSubmitError(detail ?? "Please verify your account before logging in");
      } else {
        setSubmitError("Something went wrong. Please try again.");
      }
      triggerShake();
    } finally {
      setSubmitting(false);
    }
  }, [email, password, login, router, validateAll, triggerShake]);

  const onPressIn = useCallback(() => {
    buttonScale.value = withTiming(0.96, { duration: 90 });
  }, [buttonScale]);

  const onPressOut = useCallback(() => {
    buttonScale.value = withSpring(1, { damping: 12, stiffness: 180 });
  }, [buttonScale]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        {/* Soft decorative blobs behind the content — pure View/style, no
            image assets needed, so this works regardless of what's bundled. */}
        <View style={[styles.blob, styles.blobTop]} />
        <View style={[styles.blob, styles.blobBottom]} />

        <Animated.View
          entering={FadeInDown.duration(500).springify()}
          style={styles.logoWrap}
        >
          <View style={styles.logoCircle}>
            <Text style={styles.logoGlyph}>P</Text>
          </View>
        </Animated.View>

        <Animated.Text
          entering={FadeInDown.delay(80).duration(500).springify()}
          style={styles.title}
        >
          Welcome back
        </Animated.Text>
        <Animated.Text
          entering={FadeInDown.delay(140).duration(500).springify()}
          style={styles.subtitle}
        >
          Log in to manage your vehicles
        </Animated.Text>

        <Animated.View
          entering={FadeInUp.delay(200).duration(500).springify()}
          style={[styles.card, shakeAnimatedStyle]}
        >
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, emailFocused && styles.inputFocused]}
              placeholder="you@example.com"
              placeholderTextColor="#a3a3a3"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              onChangeText={(v) => {
                setEmail(v);
                setErrors((e) => ({ ...e, email: undefined }));
              }}
            />
            {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={[styles.input, passwordFocused && styles.inputFocused]}
              placeholder="••••••••"
              placeholderTextColor="#a3a3a3"
              secureTextEntry
              value={password}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              onChangeText={(v) => {
                setPassword(v);
                setErrors((e) => ({ ...e, password: undefined }));
              }}
            />
            {errors.password ? (
              <Text style={styles.errorText}>{errors.password}</Text>
            ) : null}
          </View>

          {submitError ? (
            <Animated.Text
              entering={FadeInDown.duration(300)}
              style={styles.submitError}
            >
              {submitError}
            </Animated.Text>
          ) : null}

          <Animated.View style={buttonAnimatedStyle}>
            <TouchableOpacity
              style={[styles.buttonPrimary, submitting && styles.buttonDisabled]}
              onPress={handleSubmit}
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              disabled={submitting}
              activeOpacity={0.9}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonPrimaryText}>Log in</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(320).duration(500)}>
          <Link href="/register" asChild>
            <TouchableOpacity style={styles.linkButton}>
              <Text style={styles.linkText}>
                Don't have an account?{" "}
                <Text style={styles.linkTextBold}>Sign up</Text>
              </Text>
            </TouchableOpacity>
          </Link>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const ACCENT = "#208AEF";

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#F7FAFF" },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    overflow: "hidden",
  },
  blob: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.35,
  },
  blobTop: {
    width: 260,
    height: 260,
    backgroundColor: "#BFE0FF",
    top: -100,
    right: -80,
  },
  blobBottom: {
    width: 220,
    height: 220,
    backgroundColor: "#D6E9FF",
    bottom: -90,
    left: -70,
  },
  logoWrap: { alignItems: "center", marginBottom: 18 },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: ACCENT,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  logoGlyph: { color: "#fff", fontSize: 32, fontWeight: "800" },
  title: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    color: "#12203A",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7A99",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 28,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 22,
    gap: 4,
    shadowColor: "#12203A",
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  field: { marginBottom: 14 },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7A99",
    marginBottom: 6,
    marginLeft: 2,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#E6ECF5",
    backgroundColor: "#FAFCFF",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#12203A",
  },
  inputFocused: {
    borderColor: ACCENT,
    backgroundColor: "#fff",
  },
  errorText: { color: "#D92D20", fontSize: 12, marginTop: 6, marginLeft: 2 },
  submitError: {
    color: "#D92D20",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 12,
    fontWeight: "500",
  },
  buttonPrimary: {
    backgroundColor: ACCENT,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 6,
    shadowColor: ACCENT,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  linkButton: { marginTop: 22, alignItems: "center" },
  linkText: { color: "#6B7A99", fontSize: 14 },
  linkTextBold: { color: ACCENT, fontWeight: "700" },
}); 