import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { ThemedText } from "@/components/themed-text";
import { Button, Card, Empty, ErrorView, Loading, Screen, formatDate } from "@/components/ui";
import { api } from "@/lib/api";
import type { ForumThreadSummary } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useApi(() => api.forumThreads(id), [id]);
  const [more, setMore] = useState<ForumThreadSummary[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null | undefined>(undefined);
  const cursor = nextBefore === undefined ? data?.nextBefore : nextBefore;

  useFocusEffect(
    useCallback(() => {
      setMore([]);
      setNextBefore(undefined);
      void reload();
    }, [reload]),
  );

  const loadMore = async () => {
    if (!cursor) return;
    const page = await api.forumThreads(id, cursor);
    setMore((m) => [...m, ...page.threads]);
    setNextBefore(page.nextBefore);
  };

  const threads = [...(data?.threads ?? []), ...more];

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <Stack.Screen options={{ title: "Forum" }} />
      <Button title="Ny tråd" onPress={() => router.push({ pathname: "/forum/new", params: { categoryId: id } })} />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorView message={error.message} onRetry={reload} /> : null}
      {data && threads.length === 0 ? <Empty text="Inga trådar ännu. Bli först!" /> : null}
      {threads.map((t) => (
        <Card key={t.id} onPress={() => router.push({ pathname: "/forum/thread/[id]", params: { id: t.id } })}>
          <ThemedText type="heading">
            {t.pinned ? "📌 " : ""}
            {t.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t.author.name ?? "Deltagare"} · {t.postCount === 1 ? "1 inlägg" : `${t.postCount} inlägg`} · {formatDate(t.lastPostAt)}
            {t.locked ? " · Låst" : ""}
          </ThemedText>
        </Card>
      ))}
      {cursor ? <Button title="Visa fler" variant="secondary" onPress={loadMore} /> : null}
    </Screen>
  );
}
