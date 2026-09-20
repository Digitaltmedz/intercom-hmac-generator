import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ErrorView, Loading, Screen, formatDuration } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { api } from "@/lib/api";
import type { LessonKind } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const kindLabel: Record<LessonKind, string> = { video: "Video", audio: "Ljud", pdf: "PDF", text: "Text" };

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { data, error, loading, reload } = useApi(() => api.course(id), [id]);

  const total = data?.modules.reduce((n, m) => n + m.lessons.length, 0) ?? 0;
  const done = data?.modules.reduce((n, m) => n + m.lessons.filter((l) => l.completed).length, 0) ?? 0;

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <Stack.Screen options={{ title: data?.title ?? "" }} />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorView message={error.message} onRetry={reload} /> : null}
      {data ? (
        <>
          <ThemedText type="title">{data.title}</ThemedText>
          {data.description ? <ThemedText themeColor="textSecondary">{data.description}</ThemedText> : null}
          {total > 0 ? (
            <View style={styles.progressWrap}>
              <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
                <View style={[styles.fill, { width: `${(done / total) * 100}%`, backgroundColor: theme.primary }]} />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {done} av {total} lektioner klara
              </ThemedText>
            </View>
          ) : null}
          {data.modules.map((m) => (
            <View key={m.id} style={styles.module}>
              <ThemedText type="heading">{m.title}</ThemedText>
              {m.description ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {m.description}
                </ThemedText>
              ) : null}
              {m.lessons.map((l) => (
                <Pressable
                  key={l.id}
                  onPress={() => router.push({ pathname: "/lesson/[id]", params: { id: l.id } })}
                  style={({ pressed }) => [styles.lesson, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
                  <View style={[styles.check, { borderColor: l.completed ? theme.primary : theme.border, backgroundColor: l.completed ? theme.primary : "transparent" }]}>
                    {l.completed ? <ThemedText style={{ color: theme.onPrimary, fontSize: 12, fontWeight: "700" }}>✓</ThemedText> : null}
                  </View>
                  <View style={styles.lessonText}>
                    <ThemedText>{l.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {kindLabel[l.kind]}
                      {l.durationSeconds ? ` · ${formatDuration(l.durationSeconds)}` : ""}
                      {!l.completed && l.positionSeconds > 0 ? " · Påbörjad" : ""}
                    </ThemedText>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressWrap: { gap: Spacing.one },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%" },
  module: { gap: Spacing.two, marginTop: Spacing.two },
  lesson: { flexDirection: "row", alignItems: "center", gap: Spacing.three, padding: Spacing.three, borderRadius: 12 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  lessonText: { flex: 1, gap: 2 },
});
