import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/context/AuthContext";
import { validateEmail, validatePassword } from "@/utils/validation";

interface FormErrors {
  email?: string;
  password?: string;
}

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

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) next.password = passwordCheck.error;

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [email, password]);

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    if (!validateAll()) return;

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        setSubmitError("Incorrect email or password.");
      } else if (status === 403) {
        setSubmitError(
          err.response?.data?.detail ??
            "Please verify your phone number before logging in."
        );
      } else if (status === 429) {
        setSubmitError("Too many attempts. Please wait a few minutes.");
      } else {
        setSubmitError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [email, password, login, router, validateAll]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log in</Text>

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
        {errors.password ? (
          <Text style={styles.errorText}>{errors.password}</Text>
        ) : null}
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

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => router.push("/register")}
      >
        <Text style={styles.linkText}>Don't have an account? Sign up</Text>
      </TouchableOpacity>
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
  linkButton: { paddingVertical: 14, alignItems: "center" },
  linkText: { color: "#208AEF", fontSize: 14, fontWeight: "500" },
});