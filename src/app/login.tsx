import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";

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
 */
export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    if (!validateAll()) return;

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
    } finally {
      setSubmitting(false);
    }
  }, [email, password, login, router, validateAll]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome back</Text>

      <View style={styles.field}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setErrors((e) => ({ ...e, email: undefined }));
          }}
        />
        {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
      </View>

      <View style={styles.field}>
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setErrors((e) => ({ ...e, password: undefined }));
          }}
        />
        {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
      </View>

      {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

      <TouchableOpacity
        style={[styles.buttonPrimary, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonPrimaryText}>Log in</Text>
        )}
      </TouchableOpacity>

      <Link href="/register" asChild>
        <TouchableOpacity style={styles.linkButton}>
          <Text style={styles.linkText}>Don't have an account? Sign up</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", gap: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center", marginBottom: 16 },
  field: { marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
  },
  errorText: { color: "#D92D20", fontSize: 12, marginTop: 4 },
  buttonPrimary: {
    backgroundColor: "#208AEF",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  linkButton: { marginTop: 16, alignItems: "center" },
  linkText: { color: "#208AEF", fontSize: 14, fontWeight: "500" },
});