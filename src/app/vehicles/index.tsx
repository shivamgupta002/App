import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Redirect, useFocusEffect, useRouter } from "expo-router";

import { listVehicles } from "@/api/client";
import { Vehicle } from "@/api/types";
import { useAuth } from "@/context/AuthContext";

type LoadState = "loading" | "ready" | "error";

/**
 * Owner-facing "My Vehicles" screen — the effective home/dashboard after
 * sign-in (src/app/index.tsx redirects here once AuthContext reports
 * "signedIn"). Lists every vehicle the signed-in user has registered
 * (GET /vehicles, see app/routers/vehicles.py::list_vehicles) — the
 * backend already scopes the query to the caller's own vehicles, so no
 * client-side filtering is needed.
 *
 * Re-fetches on every screen focus (not just mount) via useFocusEffect, so
 * a vehicle just added or edited shows up immediately when the user
 * navigates back here.
 */
export default function VehiclesScreen() {
  const router = useRouter();
  const { status, logout } = useAuth();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setState("loading");
    try {
      const result = await listVehicles();
      setVehicles(result.vehicles);
      setState("ready");
    } catch {
      setState("error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (status === "signedIn") load();
    }, [load, status])
  );

  const onRefresh = useCallback(() => {
    load(true);
  }, [load]);

  // Guard: if the token was cleared (e.g. refresh failed elsewhere in the
  // app) while this screen is mounted, bounce to login instead of showing
  // a stale or perpetually-loading vehicle list.
  if (status === "signedOut") {
    return <Redirect href="/login" />;
  }

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
        <Text style={styles.title}>Couldn't load your vehicles</Text>
        <TouchableOpacity style={styles.buttonSecondary} onPress={() => load()}>
          <Text style={styles.buttonSecondaryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Vehicles</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push("/vehicles/add")}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={logout}>
            <Text style={styles.logoutButtonText}>Log out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          vehicles.length === 0 ? styles.emptyContainer : styles.listContainer
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>No vehicles yet</Text>
            <Text style={styles.subtitle}>
              Add a vehicle to generate its QR code.
            </Text>
            <TouchableOpacity
              style={styles.buttonPrimary}
              onPress={() => router.push("/vehicles/add")}
            >
              <Text style={styles.buttonPrimaryText}>Add your first vehicle</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.cardMain}
              onPress={() => router.push(`/vehicles/${item.id}/qr`)}
            >
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle}>
                  {item.brand} {item.model}
                </Text>
                {!item.is_active ? (
                  <View style={styles.inactiveBadge}>
                    <Text style={styles.inactiveBadgeText}>Inactive</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.cardSubtitle}>
                {item.vehicle_type === "car" ? "Car" : "Bike"} · {item.vehicle_number} ·{" "}
                {item.color}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.editButton}
              onPress={() => router.push(`/vehicles/${item.id}/edit`)}
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: "700" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  addButton: {
    backgroundColor: "#208AEF",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  addButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  logoutButton: { paddingVertical: 8, paddingHorizontal: 8 },
  logoutButtonText: { color: "#888", fontWeight: "500", fontSize: 13 },
  listContainer: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  emptyContainer: { flexGrow: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: "600", textAlign: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "600" },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    backgroundColor: "#fafafa",
  },
  cardMain: { flex: 1, padding: 16, gap: 4 },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardSubtitle: { fontSize: 13, color: "#666" },
  inactiveBadge: {
    backgroundColor: "#f2f2f2",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  inactiveBadgeText: { fontSize: 11, color: "#888", fontWeight: "600" },
  editButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#208AEF",
    borderRadius: 8,
  },
  editButtonText: { color: "#208AEF", fontWeight: "600", fontSize: 13 },
  buttonPrimary: {
    backgroundColor: "#208AEF",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 8,
  },
  buttonPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: "#208AEF",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  buttonSecondaryText: { color: "#208AEF", fontWeight: "600", fontSize: 16 },
});