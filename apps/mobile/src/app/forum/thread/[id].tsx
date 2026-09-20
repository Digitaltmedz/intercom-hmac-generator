import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Button, Card, ErrorView, Input, Loading, Screen, formatDate } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ForumPost } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { me } = useAuth();
  const { data, error, loading, reload } = useApi(() => api.thread(id), [id]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    if (me && !me.acceptedTerms) {
      router.push("/terms");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.reply(id, reply.trim());
      setReply("");
      await reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Kunde inte skicka.");
    } finally {
      setBusy(false);
    }
  };

  const report = (post: ForumPost) => {
    Alert.prompt?.(
      "Rapportera inlägg",
      "Beskriv kort vad som är fel.",
      async (reason) => {
        if (!reason?.trim()) return;
        await api.report({ postId: post.id, reason: reason.trim() });
        Alert.alert("Tack", "Vi tittar på rapporten inom 24 timmar.");
      },
      "plain-text",
    ) ??
      Alert.alert("Rapportera inlägg", "Vill du rapportera det här inlägget som olämpligt?", [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Rapportera",
          style: "destructive",
          onPress: async () => {
            await api.report({ postId: post.id, reason: "Rapporterat från appen" });
            Alert.alert("Tack", "Vi tittar på rapporten inom 24 timmar.");
          },
        },
      ]);
  };

  const block = (post: ForumPost) => {
    Alert.alert("Blockera användare", `Du kommer inte längre se inlägg från ${post.author.name ?? "den här användaren"}.`, [
      { text: "Avbryt", style: "cancel" },
      {
        text: "Blockera",
        style: "destructive",
        onPress: async () => {
          await api.block(post.author.id);
          await reload();
        },
      },
    ]);
  };

  const remove = (post: ForumPost) => {
    Alert.alert("Ta bort inlägg", "Inlägget tas bort för alla.", [
      { text: "Avbryt", style: "cancel" },
      {
        text: "Ta bort",
        style: "destructive",
        onPress: async () => {
          await api.deletePost(post.id);
          await reload();
        },
      },
    ]);
  };

  const menu = (post: ForumPost) => {
    const mine = post.author.id === data?.me;
    const actions = mine ? ["Ta bort inlägg"] : ["Rapportera", "Blockera användare"];
    const run = (i: number) => {
      if (mine) {
        if (i === 0) remove(post);
      } else if (i === 0) report(post);
      else if (i === 1) block(post);
    };
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...actions, "Avbryt"], cancelButtonIndex: actions.length, destructiveButtonIndex: mine ? 0 : 1 }, (i) => {
        if (i < actions.length) run(i);
      });
    } else {
      Alert.alert("Inlägg", undefined, [...actions.map((a, i) => ({ text: a, onPress: () => run(i) })), { text: "Avbryt", style: "cancel" as const }]);
    }
  };

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <Stack.Screen options={{ title: "Tråd" }} />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorView message={error.message} onRetry={reload} /> : null}
      {data ? (
        <>
          <ThemedText type="subtitle">{data.title}</ThemedText>
          {data.posts.map((p) => (
            <Card key={p.id}>
              <View style={styles.head}>
                <ThemedText type="smallBold">{p.author.name ?? "Deltagare"}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDate(p.createdAt)}
                  {p.editedAt ? " · redigerad" : ""}
                </ThemedText>
                <Pressable onPress={() => menu(p)} accessibilityLabel="Fler val" hitSlop={12} style={styles.more}>
                  <ThemedText themeColor="textSecondary">···</ThemedText>
                </Pressable>
              </View>
              <ThemedText>{p.body}</ThemedText>
            </Card>
          ))}
          {data.locked ? (
            <ThemedText themeColor="textSecondary">Tråden är låst.</ThemedText>
          ) : (
            <View style={styles.replyBox}>
              <Input value={reply} onChangeText={setReply} placeholder="Skriv ett svar" multiline style={{ minHeight: 90, textAlignVertical: "top" }} />
              {err ? <ThemedText themeColor="danger">{err}</ThemedText> : null}
              <Button title="Svara" onPress={send} loading={busy} disabled={!reply.trim()} />
            </View>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  more: { marginLeft: "auto", paddingHorizontal: Spacing.one },
  replyBox: { gap: Spacing.two, marginTop: Spacing.two },
});
