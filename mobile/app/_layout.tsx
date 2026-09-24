import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/lib/auth";
import { colors } from "../src/lib/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.indigo },
            headerTintColor: colors.paper,
            headerTitleStyle: { fontWeight: "700" },
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: "Open RFPs" }} />
          <Stack.Screen name="rfp/[id]" options={{ title: "Opportunity" }} />
          <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
          <Stack.Screen name="account" options={{ title: "Account" }} />
          <Stack.Screen name="projects/index" options={{ title: "Projects" }} />
          <Stack.Screen name="projects/new" options={{ title: "New project" }} />
          <Stack.Screen name="projects/[id]" options={{ title: "Project" }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
