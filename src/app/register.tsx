import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
import {
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhoneNumber,
} from "@/utils/validation";

interface FormErrors {
  full_name?: string;
  email?: string;
  phone_number?: string;
  password?: string;
}

/**
 * Registration screen — same styling/animation language as the login
 * screen: staggered entrance, focus-highlighted inputs, a shake on
 * validation/submit failure, and an animated show/hide toggle on the
 * password field. All form logic (validation, register() call, error
 * handling, navigation to verify-otp) is unchanged from the original.
 */
export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [nameFocused, setNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  // --- animation values ---
  const buttonScale = useSharedValue(1);
  const shakeX = useSharedValue(0);
  const eyeScale = useSharedValue(1);
  const eyeFlip = useSharedValue(1); // 1 = normal, 0 = mid-flip (scaleX)

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const shakeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const eyeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: eyeScale.value }, { scaleX: eyeFlip.value }],
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

  const toggleShowPassword = useCallback(() => {
    eyeScale.value = withSequence(
      withTiming(0.6, { duration: 90 }),
      withSpring(1, { damping: 9, stiffness: 220 })
    );
    eyeFlip.value = withSequence(
      withTiming(0, { duration: 90 }),
      withTiming(1, { duration: 90 })
    );
    setShowPassword((prev) => !prev);
  }, [eyeScale, eyeFlip]);

  const validateAll = useCallback((): boolean => {
    const next: FormErrors = {};
    const nameCheck = validateFullName(fullName);
    if (!nameCheck.valid) next.full_name = nameCheck.error;

    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) next.email = emailCheck.error;

    const phoneCheck = validatePhoneNumber(phone);
    if (!phoneCheck.valid) next.phone_number = phoneCheck.error;

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) next.password = passwordCheck.error;

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [fullName, email, phone, password]);

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    if (!validateAll()) {
      triggerShake();
      return;
    }

    setSubmitting(true);
    try {
      await register({
        full_name: fullName.trim(),
        email: email.trim(),
        phone_number: phone.trim(),
        password,
      });
      router.push({
        pathname: "/verify-otp",
        params: {
          phone_number: phone.trim(),
          full_name: fullName.trim(),
          email: email.trim(),
          password,
        },
      });
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setSubmitError(
          err.response?.data?.detail ??
            "An account with this email or phone already exists."
        );
      } else if (err?.response?.status === 429) {
        setSubmitError("Too many attempts. Please wait a few minutes.");
      } else {
        setSubmitError("Something went wrong. Please try again.");
      }
      triggerShake();
    } finally {
      setSubmitting(false);
    }
  }, [fullName, email, phone, password, register, router, validateAll, triggerShake]);

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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          {/* Soft decorative blobs behind the content */}
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
            Create your account
          </Animated.Text>
          <Animated.Text
            entering={FadeInDown.delay(140).duration(500).springify()}
            style={styles.subtitle}
          >
            Join ParkConnect to manage your vehicles
          </Animated.Text>

          <Animated.View
            entering={FadeInUp.delay(200).duration(500).springify()}
            style={[styles.card, shakeAnimatedStyle]}
          >
            <View style={styles.field}>
              <Text style={styles.label}>Full name</Text>
              <TextInput
                style={[styles.input, nameFocused && styles.inputFocused]}
                placeholder="Asha Rao"
                placeholderTextColor="#a3a3a3"
                value={fullName}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                onChangeText={(v) => {
                  setFullName(v);
                  setErrors((e) => ({ ...e, full_name: undefined }));
                }}
              />
              {errors.full_name ? (
                <Text style={styles.errorText}>{errors.full_name}</Text>
              ) : null}
            </View>

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
              <Text style={styles.label}>Phone number</Text>
              <TextInput
                style={[styles.input, phoneFocused && styles.inputFocused]}
                placeholder="+919876543210"
                placeholderTextColor="#a3a3a3"
                keyboardType="phone-pad"
                value={phone}
                onFocus={() => setPhoneFocused(true)}
                onBlur={() => setPhoneFocused(false)}
                onChangeText={(v) => {
                  setPhone(v);
                  setErrors((e) => ({ ...e, phone_number: undefined }));
                }}
              />
              {errors.phone_number ? (
                <Text style={styles.errorText}>{errors.phone_number}</Text>
              ) : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[
                    styles.input,
                    styles.passwordInput,
                    passwordFocused && styles.inputFocused,
                  ]}
                  placeholder="Min 8 chars, 1 digit"
                  placeholderTextColor="#a3a3a3"
                  secureTextEntry={!showPassword}
                  value={password}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  onChangeText={(v) => {
                    setPassword(v);
                    setErrors((e) => ({ ...e, password: undefined }));
                  }}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={toggleShowPassword}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  accessibilityRole="button"
                >
                  <Animated.Text style={[styles.eyeGlyph, eyeAnimatedStyle]}>
                    {showPassword ? "🙈" : "👁️"}
                  </Animated.Text>
                </TouchableOpacity>
              </View>
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
                  <Text style={styles.buttonPrimaryText}>Register</Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(320).duration(500)}>
            <Link href="/login" asChild>
              <TouchableOpacity style={styles.linkButton}>
                <Text style={styles.linkText}>
                  Already have an account?{" "}
                  <Text style={styles.linkTextBold}>Log in</Text>
                </Text>
              </TouchableOpacity>
            </Link>
          </Animated.View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const ACCENT = "#208AEF";

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#F7FAFF" },
  scrollContent: { flexGrow: 1 },
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
  passwordRow: {
    position: "relative",
    justifyContent: "center",
  },
  passwordInput: {
    paddingRight: 46,
  },
  eyeButton: {
    position: "absolute",
    right: 8,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    width: 36,
  },
  eyeGlyph: {
    fontSize: 20,
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