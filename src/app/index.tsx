import { useCallback } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/context/AuthContext";

// QR-style decorative mark. Deterministic pattern, purely illustrative —
// this is not a scannable code, just a visual nod to the product (a QR
// sticker on the windshield) rather than a generic icon.
const QR_GRID = [
  [1, 1, 1, 0, 1],
  [1, 0, 1, 0, 0],
  [1, 1, 1, 0, 1],
  [0, 0, 0, 1, 0],
  [1, 0, 1, 0, 1],
];

function QrMark() {
  return (
    <View style={styles.qrWrap}>
      <View style={[styles.qrCorner, styles.qrCornerTL]} />
      <View style={[styles.qrCorner, styles.qrCornerTR]} />
      <View style={[styles.qrCorner, styles.qrCornerBL]} />
      <View style={[styles.qrCorner, styles.qrCornerBR]} />
      <View style={styles.qrGrid}>
        {QR_GRID.map((row, i) => (
          <View key={i} style={styles.qrRow}>
            {row.map((cell, j) => (
              <View
                key={j}
                style={[styles.qrCell, cell ? styles.qrCellFilled : null]}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { status, logout } = useAuth();

  const goToLogin = useCallback(() => router.push("/login"), [router]);
  const goToRegister = useCallback(() => router.push("/register"), [router]);

  if (status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#208AEF" />
      </View>
    );
  }

  if (status === "signedIn") {
    return (
      <View style={styles.center}>
        <QrMark />
        <Text style={styles.signedInTitle}>You're signed in</Text>
        <Text style={styles.signedInSubtitle}>
          Add a vehicle to generate its QR sticker, or check your call
          history from the menu.
        </Text>
        <TouchableOpacity style={styles.buttonOutline} onPress={logout}>
          <Text style={styles.buttonOutlineText}>Log out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <QrMark />

      <Text style={styles.eyebrow}>ParkConnect</Text>
      <Text style={styles.hero}>Your number stays yours.</Text>
      <Text style={styles.subhead}>
        Stick a code on your windshield. Anyone who needs to reach you calls
        through a masked line — they never see your real number.
      </Text>

      <View style={styles.maskedRow}>
        <Text style={styles.maskedText}>
          +91 98<Text style={styles.maskedDigits}>•• •• ••</Text> 10
        </Text>
        <Text style={styles.maskedLabel}>what a scanner sees, never this</Text>
      </View>

      <View style={styles.divider} />

      <TouchableOpacity style={styles.buttonPrimary} onPress={goToRegister}>
        <Text style={styles.buttonPrimaryText}>Create an account</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.buttonOutline} onPress={goToLogin}>
        <Text style={styles.buttonOutlineText}>Log in</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>Free for your first vehicle.</Text>
    </ScrollView>
  );
}

const INK = "#151A21";
const STEEL = "#5B6572";
const PAPER = "#F3F5F6";
const LINE = "#DDE1E4";
const BRAND = "#208AEF";
const SIGNAL = "#F2A93B";

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    paddingTop: 72,
    paddingBottom: 48,
    backgroundColor: PAPER,
    gap: 4,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    backgroundColor: PAPER,
    gap: 14,
  },

  // Hero copy
  eyebrow: {
    fontSize: 15,
    fontWeight: "600",
    color: BRAND,
    marginTop: 24,
    marginBottom: 6,
  },
  hero: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
    color: INK,
    textAlign: "center",
    letterSpacing: -0.5,
    maxWidth: 320,
  },
  subhead: {
    fontSize: 16,
    lineHeight: 24,
    color: STEEL,
    textAlign: "center",
    marginTop: 14,
    maxWidth: 300,
  },

  // Masked-number illustration
  maskedRow: {
    marginTop: 28,
    alignItems: "center",
    gap: 6,
  },
  maskedText: {
    fontSize: 20,
    fontWeight: "600",
    color: INK,
    letterSpacing: 1,
  },
  maskedDigits: {
    color: SIGNAL,
  },
  maskedLabel: {
    fontSize: 13,
    color: STEEL,
  },

  divider: {
    width: 64,
    height: 1,
    backgroundColor: LINE,
    marginVertical: 32,
  },

  // Buttons
  buttonPrimary: {
    backgroundColor: BRAND,
    paddingVertical: 15,
    borderRadius: 12,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
  },
  buttonPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  buttonOutline: {
    borderWidth: 1.5,
    borderColor: BRAND,
    paddingVertical: 15,
    borderRadius: 12,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    marginTop: 12,
  },
  buttonOutlineText: { color: BRAND, fontWeight: "700", fontSize: 16 },

  footer: {
    marginTop: 20,
    fontSize: 13,
    color: STEEL,
  },

  // Signed-in state
  signedInTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: INK,
    marginTop: 20,
  },
  signedInSubtitle: {
    fontSize: 15,
    color: STEEL,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
    maxWidth: 280,
  },

  // QR mark
  qrWrap: {
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  qrGrid: { gap: 3 },
  qrRow: { flexDirection: "row", gap: 3 },
  qrCell: {
    width: 8,
    height: 8,
    backgroundColor: "transparent",
    borderRadius: 1,
  },
  qrCellFilled: { backgroundColor: INK },
  qrCorner: {
    position: "absolute",
    width: 16,
    height: 16,
    borderColor: BRAND,
  },
  qrCornerTL: { top: 0, left: 0, borderTopWidth: 2.5, borderLeftWidth: 2.5 },
  qrCornerTR: { top: 0, right: 0, borderTopWidth: 2.5, borderRightWidth: 2.5 },
  qrCornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
  },
  qrCornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
  },
});