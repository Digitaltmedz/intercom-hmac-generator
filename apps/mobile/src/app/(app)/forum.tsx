import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { Card, Empty, ErrorView, Loading, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";

export default function ForumScreen() {
  const router = useRouter();
  const { data, error, loading, reload } = useApi(() => api.forumCategories(), []);

  return (
    <Screen withTabs onRefresh={reload} refreshing={loading && !!data}>
      <ThemedText type="title">Forum</ThemedText>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorView message={error.message} onRetry={reload} /> : null}
      {data && data.categories.length === 0 ? <Empty text="Forumet är inte igång ännu." /> : null}
      {data?.categories.map((c) => (
        <Card key={c.id} onPress={() => router.push({ pathname: "/forum/category/[id]", params: { id: c.id } })}>
          <ThemedText type="heading">{c.title}</ThemedText>
          {c.description ? (
            <ThemedText type="small" themeColor="textSecondary">
              {c.description}
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {c.threadCount === 1 ? "1 tråd" : `${c.threadCount} trådar`}
          </ThemedText>
        </Card>
      ))}
    </Screen>
  );
}
