import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Button, Input, Screen } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { api, ApiError } from "@/lib/api";
import { APP_NAME } from "@/lib/config";

/**
 * Inloggning med e-post och engångskod. Ingen registrering och inga köp här:
 * appen är bara för den som redan prenumererar via kursarrangörens webbplats.
 */
export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setError("Skriv en giltig e-postadress.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.requestCode(trimmed);
      router.push({ pathname: "/(auth)/code", params: { email: trimmed } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Något gick fel.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>
        <View style={styles.center}>
          <ThemedText type="title">{APP_NAME}</ThemedText>
          <ThemedText themeColor="textSecondary">Logga in med den e-postadress du använde när du köpte kursen. Vi skickar en kod till dig.</ThemedText>
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="din@epost.se"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={submit}
            accessibilityLabel="E-postadress"
          />
          {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
          <Button title="Skicka kod" onPress={submit} loading={busy} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: "center", gap: Spacing.three },
});
