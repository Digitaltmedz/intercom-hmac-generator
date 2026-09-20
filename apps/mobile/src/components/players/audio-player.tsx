import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { ThemedText } from "@/components/themed-text";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Ljudspelare som fortsätter i bakgrunden och med skärmen släckt. */
export function AudioPlayer({
  uri,
  title,
  startAt = 0,
  onProgress,
  onComplete,
}: {
  uri: string;
  title: string;
  startAt?: number;
  onProgress: (seconds: number) => void;
  onComplete: () => void;
}) {
  const theme = useTheme();
  const player = useAudioPlayer({ uri }, { updateInterval: 1000 });
  const status = useAudioPlayerStatus(player);
  const seeked = useRef(false);
  const lastReported = useRef(0);
  const completed = useRef(false);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" });
  }, []);

  useEffect(() => {
    if (status.isLoaded && !seeked.current) {
      seeked.current = true;
      if (startAt > 3 && startAt < status.duration - 3) void player.seekTo(startAt);
    }
  }, [status.isLoaded, status.duration, startAt, player]);

  useEffect(() => {
    if (!status.isLoaded) return;
    if (Math.abs(status.currentTime - lastReported.current) >= 5) {
      lastReported.current = status.currentTime;
      onProgress(Math.floor(status.currentTime));
    }
    if (status.didJustFinish && !completed.current) {
      completed.current = true;
      onComplete();
    }
  }, [status.currentTime, status.isLoaded, status.didJustFinish, onProgress, onComplete]);

  const toggle = () => {
    if (status.playing) {
      player.pause();
      onProgress(Math.floor(player.currentTime));
    } else player.play();
  };
  const skip = (d: number) => void player.seekTo(Math.max(0, Math.min(status.duration, status.currentTime + d)));
  const pct = status.duration ? Math.min(1, status.currentTime / status.duration) : 0;

  return (
    <View style={[styles.box, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="heading" numberOfLines={2}>
        {title}
      </ThemedText>
      <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: theme.primary }]} />
      </View>
      <View style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary">
          {fmt(status.currentTime)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {fmt(status.duration || 0)}
        </ThemedText>
      </View>
      <View style={styles.controls}>
        <Pressable onPress={() => skip(-15)} accessibilityLabel="Bakåt 15 sekunder" style={styles.ctrl}>
          <ThemedText type="smallBold">−15</ThemedText>
        </Pressable>
        <Pressable
          onPress={toggle}
          accessibilityLabel={status.playing ? "Pausa" : "Spela"}
          style={[styles.play, { backgroundColor: theme.primary }]}>
          <ThemedText style={{ color: theme.onPrimary, fontSize: 22, fontWeight: "700" }}>{status.playing ? "❚❚" : "▶"}</ThemedText>
        </Pressable>
        <Pressable onPress={() => skip(30)} accessibilityLabel="Framåt 30 sekunder" style={styles.ctrl}>
          <ThemedText type="smallBold">+30</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.five, paddingTop: Spacing.two },
  ctrl: { padding: Spacing.two, minWidth: 48, alignItems: "center" },
  play: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
});
