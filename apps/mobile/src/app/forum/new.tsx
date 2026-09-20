import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { ThemedText } from "@/components/themed-text";
import { Button, Input, Screen } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function NewThreadScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const router = useRouter();
  const { me } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (me && !me.acceptedTerms) {
    return (
      <Screen>
        <ThemedText>Innan du skriver i forumet behöver du läsa och godkänna reglerna.</ThemedText>
        <Button title="Läs reglerna" onPress={() => router.push("/terms")} />
      </Screen>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.createThread(categoryId, title.trim(), body.trim());
      router.replace({ pathname: "/forum/thread/[id]", params: { id } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kunde inte skapa tråden.");
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Input value={title} onChangeText={setTitle} placeholder="Rubrik" maxLength={120} />
      <Input value={body} onChangeText={setBody} placeholder="Skriv ditt inlägg" multiline style={{ minHeight: 160, textAlignVertical: "top" }} />
      {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
      <Button title="Publicera" onPress={submit} loading={busy} disabled={title.trim().length < 3 || !body.trim()} />
    </Screen>
  );
}
