import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { deleteVehicle, getVehicle, updateVehicle } from "@/api/client";
import { Vehicle } from "@/api/types";
import { validatePhoneNumber } from "@/utils/validation";

type VehicleType = "car" | "bike";
type LoadState = "loading" | "ready" | "error";

interface FormErrors {
  brand?: string;
  model?: string;
  color?: string;
  emergency_contact?: string;
}

function notBlank(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Owner-facing "Edit vehicle" screen — PUT /vehicles/{id} (see
 * app/routers/vehicles.py::update_vehicle / app/schemas/vehicle.py::
 * VehicleUpdateRequest) plus a delete action wired to DELETE /vehicles/{id}
 * (soft-delete: marks the vehicle inactive and deactivates its QR code).
 *
 * vehicle_number is intentionally NOT editable here — same immutability
 * rule as the backend schema (see VehicleUpdateRequest's comment). vehicle_type
 * is included since VehicleUpdateRequest allows changing it.
 *
 * Loads the vehicle first (GET /vehicles/{id}) so the form starts populated,
 * matching the load pattern used in vehicles/[id]/qr.tsx.
 */
export default function EditVehicleScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [state, setState] = useState<LoadState>("loading");
  const [vehicleNumber, setVehicleNumber] = useState(""); // display only, not editable
  const [vehicleType, setVehicleType] = useState<VehicleType>("car");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setState("loading");
    try {
      const vehicle: Vehicle = await getVehicle(id);
      setVehicleNumber(vehicle.vehicle_number);
      setVehicleType(vehicle.vehicle_type);
      setBrand(vehicle.brand);
      setModel(vehicle.model);
      setColor(vehicle.color);
      setEmergencyContact(vehicle.emergency_contact);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const validateAll = useCallback((): boolean => {
    const next: FormErrors = {};

    if (!notBlank(brand)) next.brand = "Brand is required";
    if (!notBlank(model)) next.model = "Model is required";
    if (!notBlank(color)) next.color = "Color is required";

    const contactCheck = validatePhoneNumber(emergencyContact);
    if (!contactCheck.valid) next.emergency_contact = contactCheck.error;

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [brand, model, color, emergencyContact]);

  const handleSave = useCallback(async () => {
    if (!id) return;
    setSubmitError(null);
    if (!validateAll()) return;

    setSubmitting(true);
    try {
      await updateVehicle(id, {
        vehicle_type: vehicleType,
        brand: brand.trim(),
        model: model.trim(),
        color: color.trim(),
        emergency_contact: emergencyContact.trim(),
      });
      // Back to the list; it re-fetches on focus (see vehicles/index.tsx).
      router.replace("/vehicles");
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 404) {
        setSubmitError(detail ?? "This vehicle could not be found.");
      } else {
        setSubmitError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [id, vehicleType, brand, model, color, emergencyContact, router, validateAll]);

  const confirmDelete = useCallback(() => {
    if (!id) return;
    Alert.alert(
      "Delete vehicle",
      `Remove ${brand} ${model}? This deactivates its QR code too — the sticker will stop working. This can't be undone from here.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteVehicle(id);
              router.replace("/vehicles");
            } catch {
              Alert.alert("Couldn't delete", "Something went wrong. Please try again.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }, [id, brand, model, router]);

  if (state === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (state === "error") {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Couldn't load this vehicle</Text>
        <TouchableOpacity style={styles.buttonSecondary} onPress={load}>
          <Text style={styles.buttonSecondaryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Edit vehicle</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Vehicle number</Text>
        <View style={[styles.input, styles.inputDisabled]}>
          <Text style={styles.disabledText}>{vehicleNumber}</Text>
        </View>
        <Text style={styles.helperText}>Vehicle number can't be changed after registration.</Text>
      </View>

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
        onPress={handleSave}
        disabled={submitting || deleting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonPrimaryText}>Save changes</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.buttonDanger, deleting && styles.buttonDisabled]}
        onPress={confirmDelete}
        disabled={submitting || deleting}
      >
        {deleting ? (
          <ActivityIndicator color="#D92D20" />
        ) : (
          <Text style={styles.buttonDangerText}>Delete vehicle</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, gap: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
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
  label: { fontSize: 12, fontWeight: "600", color: "#6B7A99", marginBottom: 6, marginLeft: 2 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
  },
  inputDisabled: { backgroundColor: "#f2f2f2", justifyContent: "center" },
  disabledText: { fontSize: 15, color: "#888" },
  helperText: { fontSize: 12, color: "#999", marginTop: 4, marginLeft: 2 },
  errorText: { color: "#D92D20", fontSize: 12, marginTop: 4 },
  buttonPrimary: {
    backgroundColor: "#208AEF",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  buttonPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  buttonDanger: {
    borderWidth: 1,
    borderColor: "#D92D20",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  buttonDangerText: { color: "#D92D20", fontWeight: "600", fontSize: 16 },
  buttonDisabled: { opacity: 0.5 },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: "#208AEF",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  buttonSecondaryText: { color: "#208AEF", fontWeight: "600", fontSize: 16 },
});
