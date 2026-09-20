import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { Button, Loading } from "@/components/ui";

/**
 * PDF: iOS visar filen direkt i en webbvy. Android saknar inbyggd PDF-visning
 * i webbvyn, så där laddas filen ner till appens cache och öppnas i
 * telefonens PDF-läsare. Signerade länkar går ut, därför laddas den ner direkt.
 */
export function PdfViewer({ uri, title }: { uri: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openExternally = async () => {
    setBusy(true);
    setError(null);
    try {
      const dir = new Directory(Paths.cache, "pdf");
      if (!dir.exists) dir.create();
      const safeName = `${title.replace(/[^a-zA-Z0-9åäöÅÄÖ _-]/g, "").slice(0, 60) || "dokument"}.pdf`;
      const target = new File(dir, safeName);
      if (target.exists) target.delete();
      const file = await File.downloadFileAsync(uri, target);
      await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: title, UTI: "com.adobe.pdf" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte öppna dokumentet.");
    } finally {
      setBusy(false);
    }
  };

  if (Platform.OS === "ios") {
    return (
      <View style={styles.wrap}>
        <View style={styles.web}>
          <WebView source={{ uri }} startInLoadingState renderLoading={() => <Loading />} style={styles.web} />
        </View>
        <Button title="Öppna eller dela" variant="secondary" onPress={openExternally} loading={busy} />
        {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ThemedText themeColor="textSecondary">Dokumentet öppnas i telefonens PDF-läsare.</ThemedText>
      <Button title="Öppna dokumentet" onPress={openExternally} loading={busy} />
      {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  web: { height: 520, borderRadius: 12, overflow: "hidden", backgroundColor: "#fff" },
});
