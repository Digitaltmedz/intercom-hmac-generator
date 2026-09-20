import { useState } from "react";

import { ThemedText } from "@/components/themed-text";
import { Button, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { NO_ACCESS_TEXT } from "@/lib/config";
import { useRouter } from "expo-router";

/** Visas när e-posten är känd men prenumerationen inte är aktiv. Inga köplänkar här. */
export default function NoAccessScreen() {
  const { me, refresh, signOut } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    try {
      const { entitled } = await api.refreshEntitlement();
      await refresh();
      if (entitled) router.replace("/(app)");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ThemedText type="subtitle">Ingen aktiv prenumeration</ThemedText>
      <ThemedText themeColor="textSecondary">{NO_ACCESS_TEXT}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Inloggad som {me?.email}
      </ThemedText>
      <Button title="Kontrollera igen" onPress={check} loading={busy} />
      <Button title="Logga ut" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
