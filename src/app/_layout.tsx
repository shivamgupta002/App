import { Stack } from "expo-router";

import { AuthProvider } from "@/context/AuthContext";
import { BiometricGate } from "@/components/BiometricGate";

export default function RootLayout() {
  return (
    <AuthProvider>
      <BiometricGate>
        <Stack />
      </BiometricGate>
    </AuthProvider>
  );
}