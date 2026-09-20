import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";

import { AudioPlayer } from "@/components/players/audio-player";
import { PdfViewer } from "@/components/players/pdf-viewer";
import { VideoPlayer } from "@/components/players/video-player";
import { ThemedText } from "@/components/themed-text";
import { Button, Card, ErrorView, Loading, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useApi(() => api.lesson(id), [id]);
  const [completed, setCompleted] = useState<boolean | null>(null);
  const isDone = completed ?? data?.progress.completed ?? false;

  const onProgress = useCallback((s: number) => api.progress(id, { positionSeconds: s }).catch(() => undefined), [id]);
  const onComplete = useCallback(() => {
    setCompleted(true);
    api.progress(id, { completed: true }).catch(() => undefined);
  }, [id]);
  const toggleDone = async () => {
    const next = !isDone;
    setCompleted(next);
    await api.progress(id, { completed: next }).catch(() => undefined);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: data?.module.title ?? "" }} />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorView message={error.message} onRetry={reload} /> : null}
      {data ? (
        <>
          {data.kind === "video" && data.media ? (
            <VideoPlayer uri={data.media.streamUrl ?? data.media.url} startAt={data.progress.positionSeconds} onProgress={onProgress} onComplete={onComplete} />
          ) : null}
          {data.kind === "audio" && data.media ? (
            <AudioPlayer uri={data.media.url} title={data.title} startAt={data.progress.positionSeconds} onProgress={onProgress} onComplete={onComplete} />
          ) : null}
          {data.kind === "pdf" && data.media ? <PdfViewer uri={data.media.url} title={data.title} /> : null}
          {data.kind !== "text" && !data.media ? (
            <Card>
              <ThemedText themeColor="textSecondary">Materialet till den här lektionen är inte uppladdat ännu.</ThemedText>
            </Card>
          ) : null}

          <ThemedText type="subtitle">{data.title}</ThemedText>
          {data.body ? <ThemedText>{data.body}</ThemedText> : null}

          {data.attachments.length ? (
            <Card>
              <ThemedText type="label" themeColor="textSecondary">
                Bilagor
              </ThemedText>
              {data.attachments.map((a) => (
                <PdfViewer key={a.id} uri={a.url} title={`${data.title} bilaga`} />
              ))}
            </Card>
          ) : null}

          <Button title={isDone ? "Markerad som klar" : "Markera som klar"} variant={isDone ? "secondary" : "primary"} onPress={toggleDone} />
        </>
      ) : null}
    </Screen>
  );
}
