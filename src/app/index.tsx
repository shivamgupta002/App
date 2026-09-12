import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";

import { useAuth } from "@/context/AuthContext";

/**
 * App entry point. Not a screen of its own — just an auth gate that sends
 * the user to the right place:
 *   - "loading": AuthContext hasn't finished checking secure storage for an
 *     existing token yet (see AuthContext's mount effect); show a spinner
 *     rather than flashing login then immediately redirecting.
 *   - "signedOut": no valid token -> /login.
 *   - "signedIn": -> /vehicles, which becomes the effective home/dashboard
 *     screen (see src/app/vehicles/index.tsx).
 *
 * Using <Redirect> (declarative) rather than router.replace() in an effect
 * avoids a render flash of this component's own UI before navigating away.
 */
export default function Index() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (status === "signedIn") {
    return <Redirect href="/vehicles" />;
  }

  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});