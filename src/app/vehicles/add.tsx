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

import { createVehicle } from "@/api/client";
import { validatePhoneNumber } from "@/utils/validation";

type VehicleType = "car" | "bike";

interface FormErrors {
  vehicle_number?: string;
  brand?: string;
  model?: string;
  color?: string;
  emergency_contact?: string;
}

function notBlank(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Owner-facing "Add Vehicle" form — POST /vehicles (see
 * app/routers/vehicles.py::create_vehicle / app/schemas/vehicle.py::
 * VehicleCreateRequest). Field set and validation mirror the backend
 * schema exactly:
 *   - vehicle_type: "car" | "bike"
 *   - vehicle_number, brand, model, color, emergency_contact: required,
 *     non-blank (server also uppercases/trims vehicle_number)
 *   - emergency_contact: E.164 phone, same rule as auth's phone validation
 *
 * Surfaces the two backend error cases the spec calls out distinctly:
 *   - 403: free-plan vehicle limit reached (Vehicle.is_active count >= 1)
 *   - 409: vehicle_number already registered (globally unique)
 * Any other failure falls back to a generic message.
 */
export default function AddVehicleScreen() {
  const router = useRouter();

  const [vehicleType, setVehicleType] = useState<VehicleType>("car");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validateAll = useCallback((): boolean => {
    const next: FormErrors = {};

    if (!notBlank(vehicleNumber)) next.vehicle_number = "Vehicle number is required";
    if (!notBlank(brand)) next.brand = "Brand is required";
    if (!notBlank(model)) next.model = "Model is required";
    if (!notBlank(color)) next.color = "Color is required";

    const contactCheck = validatePhoneNumber(emergencyContact);
    if (!contactCheck.valid) next.emergency_contact = contactCheck.error;

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [vehicleNumber, brand, model, color, emergencyContact]);

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    if (!validateAll()) return;

    setSubmitting(true);
    try {
      await createVehicle({
        vehicle_type: vehicleType,
        vehicle_number: vehicleNumber.trim(),
        brand: brand.trim(),
        model: model.trim(),
        color: color.trim(),
        emergency_contact: emergencyContact.trim(),
      });
      // Go back to the vehicle list; it re-fetches on focus so the new
      // vehicle shows up immediately (see src/app/vehicles/index.tsx).
      router.replace("/vehicles");
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 403) {
        setSubmitError(
          detail ??
            "Free plan is limited to 1 vehicle. Upgrade to Premium to add more."
        );
      } else if (status === 409) {
        setSubmitError(
          detail ?? "A vehicle with this vehicle number is already registered."
        );
      } else {
        setSubmitError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [vehicleType, vehicleNumber, brand, model, color, emergencyContact, router, validateAll]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add a vehicle</Text>

      <View style={styles.typeRow}>
        {(["car", "bike"] as VehicleType[]).map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.typeButton, vehicleType === type && styles.typeButtonActive]}
            onPress={() => setVehicleType(type)}
          >
            <Text
              style={[
                styles.typeButtonText,
                vehicleType === type && styles.typeButtonTextActive,
              ]}
            >
              {type === "car" ? "Car" : "Bike"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.field}>
        <TextInput
          style={styles.input}
          placeholder="Vehicle number (e.g. KA01AB1234)"
          autoCapitalize="characters"
          value={vehicleNumber}
          onChangeText={(v) => {
            setVehicleNumber(v);
            setErrors((e) => ({ ...e, vehicle_number: undefined }));
          }}
        />
        {errors.vehicle_number ? (
          <Text style={styles.errorText}>{errors.vehicle_number}</Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <TextInput
          style={styles.input}
          placeholder="Brand (e.g. Toyota)"
          value={brand}
          onChangeText={(v) => {
            setBrand(v);
            setErrors((e) => ({ ...e, brand: undefined }));
          }}
        />
        {errors.brand ? <Text style={styles.errorText}>{errors.brand}</Text> : null}
      </View>

      <View style={styles.field}>
        <TextInput
          style={styles.input}
          placeholder="Model (e.g. Innova)"
          value={model}
          onChangeText={(v) => {
            setModel(v);
            setErrors((e) => ({ ...e, model: undefined }));
          }}
        />
        {errors.model ? <Text style={styles.errorText}>{errors.model}</Text> : null}
      </View>

      <View style={styles.field}>
        <TextInput
          style={styles.input}
          placeholder="Color (e.g. White)"
          value={color}
          onChangeText={(v) => {
            setColor(v);
            setErrors((e) => ({ ...e, color: undefined }));
          }}
        />
        {errors.color ? <Text style={styles.errorText}>{errors.color}</Text> : null}
      </View>

      <View style={styles.field}>
        <TextInput
          style={styles.input}
          placeholder="Emergency contact (+919876543210)"
          keyboardType="phone-pad"
          value={emergencyContact}
          onChangeText={(v) => {
            setEmergencyContact(v);
            setErrors((e) => ({ ...e, emergency_contact: undefined }));
          }}
        />
        {errors.emergency_contact ? (
          <Text style={styles.errorText}>{errors.emergency_contact}</Text>
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
          <Text style={styles.buttonPrimaryText}>Add vehicle</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", gap: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center", marginBottom: 16 },
  typeRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  typeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  typeButtonActive: { backgroundColor: "#208AEF", borderColor: "#208AEF" },
  typeButtonText: { fontSize: 15, fontWeight: "600", color: "#333" },
  typeButtonTextActive: { color: "#fff" },
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