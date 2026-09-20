import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Image } from "expo-image";
import { StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Card, Empty, ErrorView, Loading, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { registerForPush } from "@/lib/notifications";
import { useApi } from "@/lib/use-api";

export default function CoursesScreen() {
  const router = useRouter();
  const { data, error, loading, reload } = useApi(() => api.courses(), []);

  useEffect(() => {
    registerForPush().catch(() => undefined);
  }, []);

  return (
    <Screen withTabs onRefresh={reload} refreshing={loading && !!data}>
      <ThemedText type="title">Kurser</ThemedText>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorView message={error.message} onRetry={reload} /> : null}
      {data && data.courses.length === 0 ? <Empty text="Inga kurser publicerade ännu." /> : null}
      {data?.courses.map((c) => (
        <Card key={c.id} onPress={() => router.push({ pathname: "/course/[id]", params: { id: c.id } })}>
          {c.coverImageUrl ? <Image source={{ uri: c.coverImageUrl }} style={styles.cover} contentFit="cover" /> : null}
          <ThemedText type="heading">{c.title}</ThemedText>
          {c.description ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
              {c.description}
            </ThemedText>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: { width: "100%", aspectRatio: 16 / 9, borderRadius: 10, marginBottom: 8 },
});
