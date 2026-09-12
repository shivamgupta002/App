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

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    if (!validateAll()) return;

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
    } finally {
      setSubmitting(false);
    }
  }, [fullName, email, phone, password, register, router, validateAll]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create your account</Text>

      <View style={styles.field}>
        <TextInput
          style={styles.input}
          placeholder="Full name"
          value={fullName}
          onChangeText={(v) => {
            setFullName(v);
            setErrors((e) => ({ ...e, full_name: undefined }));
          }}
        />
        {errors.full_name ? <Text style={styles.errorText}>{errors.full_name}</Text> : null}
      </View>

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
          placeholder="Phone number (+919876543210)"
          keyboardType="phone-pad"
          value={phone}
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
        <TextInput
          style={styles.input}
          placeholder="Password (min 8 chars, 1 digit)"
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
          <Text style={styles.buttonPrimaryText}>Register</Text>
        )}
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
});