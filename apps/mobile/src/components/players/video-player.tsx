import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";

/**
 * Videospelare med återupptagning och framstegsrapportering.
 * onProgress anropas var 5:e sekund och vid paus, onComplete vid slut.
 */
export function VideoPlayer({
  uri,
  startAt = 0,
  onProgress,
  onComplete,
}: {
  uri: string;
  startAt?: number;
  onProgress: (seconds: number) => void;
  onComplete: () => void;
}) {
  const lastReported = useRef(0);
  const player = useVideoPlayer({ uri }, (p) => {
    p.timeUpdateEventInterval = 5;
    if (startAt > 3) p.currentTime = startAt;
    p.play();
  });

  useEffect(() => {
    const t = player.addListener("timeUpdate", ({ currentTime }) => {
      if (Math.abs(currentTime - lastReported.current) >= 5) {
        lastReported.current = currentTime;
        onProgress(Math.floor(currentTime));
      }
    });
    const p = player.addListener("playingChange", ({ isPlaying }) => {
      if (!isPlaying) onProgress(Math.floor(player.currentTime));
    });
    const e = player.addListener("playToEnd", () => onComplete());
    return () => {
      t.remove();
      p.remove();
      e.remove();
    };
  }, [player, onProgress, onComplete]);

  return (
    <View style={styles.wrapper}>
      <VideoView player={player} style={styles.video} fullscreenOptions={{ enable: true }} allowsPictureInPicture nativeControls contentFit="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000", borderRadius: 12, overflow: "hidden" },
  video: { width: "100%", height: "100%" },
});
