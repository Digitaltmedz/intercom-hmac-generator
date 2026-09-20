import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Button, Card, Input, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";

export default function ProfileScreen() {
  const router = useRouter();
  const { me, refresh, signOut } = useAuth();
  const [name, setName] = useState(me?.name ?? "");
  const [saving, setSaving] = useState(false);
  const blocked = useApi(() => api.blocked(), []);

  const saveName = async () => {
    setSaving(true);
    try {
      await api.updateName(name.trim());
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      "Radera konto",
      "Ditt konto i appen och dina foruminlägg tas bort. Din prenumeration påverkas inte, den hanteras via kursarrangörens webbplats.",
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Radera",
          style: "destructive",
          onPress: async () => {
            await api.deleteAccount();
            await signOut();
          },
        },
      ],
    );
  };

  return (
    <Screen withTabs>
      <ThemedText type="title">Profil</ThemedText>
      <Card>
        <ThemedText type="label" themeColor="textSecondary">
          Inloggad som
        </ThemedText>
        <ThemedText>{me?.email}</ThemedText>
      </Card>
      <Card>
        <ThemedText type="label" themeColor="textSecondary">
          Visningsnamn i forumet
        </ThemedText>
        <Input value={name} onChangeText={setName} placeholder="Ditt namn" autoCapitalize="words" />
        <Button title="Spara" variant="secondary" onPress={saveName} loading={saving} disabled={!name.trim() || name.trim() === (me?.name ?? "")} />
      </Card>
      <Card>
        <ThemedText type="label" themeColor="textSecondary">
          Blockerade användare
        </ThemedText>
        {blocked.data?.blocked.length ? (
          blocked.data.blocked.map((b) => (
            <Button
              key={b.id}
              title={`Avblockera ${b.name ?? "användare"}`}
              variant="secondary"
              onPress={async () => {
                await api.unblock(b.id);
                await blocked.reload();
              }}
            />
          ))
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Inga.
          </ThemedText>
        )}
      </Card>
      <Button title="Regler och villkor" variant="secondary" onPress={() => router.push("/terms")} />
      <Button title="Logga ut" variant="secondary" onPress={signOut} />
      <Button title="Radera mitt konto" variant="danger" onPress={confirmDelete} />
    </Screen>
  );
}
