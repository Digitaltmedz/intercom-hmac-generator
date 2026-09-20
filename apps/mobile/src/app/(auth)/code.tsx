import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import * as Device from "expo-device";

import { ThemedText } from "@/components/themed-text";
import { Button, Input, Screen } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function CodeScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { signIn } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const submit = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError("Koden består av sex siffror.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.verifyCode(email, code, Device.modelName ?? undefined);
      await signIn(token);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Något gick fel.");
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      await api.requestCode(email);
      setResent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kunde inte skicka ny kod.");
    }
  };

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>
        <View style={styles.center}>
          <ThemedText type="subtitle">Ange koden</ThemedText>
          <ThemedText themeColor="textSecondary">
            Om <ThemedText type="smallBold">{email}</ThemedText> har en aktiv prenumeration har vi skickat en sexsiffrig kod dit. Kolla även skräpposten.
          </ThemedText>
          <Input
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={submit}
            style={styles.code}
            accessibilityLabel="Engångskod"
          />
          {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
          <Button title="Logga in" onPress={submit} loading={busy} />
          <Button title={resent ? "Ny kod skickad" : "Skicka ny kod"} variant="ghost" onPress={resend} disabled={resent} />
          <Button title="Byt e-postadress" variant="ghost" onPress={() => router.back()} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: "center", gap: Spacing.three },
  code: { fontSize: 28, letterSpacing: 8, textAlign: "center" },
});
