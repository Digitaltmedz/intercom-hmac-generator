import { useRouter } from "expo-router";
import { useState } from "react";

import { ThemedText } from "@/components/themed-text";
import { Button, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Forumregler och användarvillkor. Apple kräver att appar med användarskapat
 * innehåll har villkor som användaren godkänner, samt rapportering och
 * blockering (riktlinje 1.2). Texten här är ett utkast som kursarrangören
 * ska granska innan lansering.
 */
export default function TermsScreen() {
  const { me, refresh } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    setBusy(true);
    try {
      await api.acceptTerms();
      await refresh();
      router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ThemedText type="subtitle">Regler för forumet</ThemedText>
      <ThemedText>Forumet är till för kursdeltagare. Var respektfull, håll dig till ämnet och dela inte andras personuppgifter.</ThemedText>
      <ThemedText>Inlägg som är kränkande, hotfulla, reklam eller på annat sätt olämpliga tas bort. Vid upprepade överträdelser stängs kontot av.</ThemedText>
      <ThemedText>Du kan rapportera inlägg och blockera användare. Rapporter granskas inom 24 timmar.</ThemedText>
      <ThemedText type="subtitle">Villkor</ThemedText>
      <ThemedText>Kursmaterialet är upphovsrättsskyddat och får inte spridas vidare. Tillgången till appen följer din prenumeration hos kursarrangören.</ThemedText>
      <ThemedText>Vi sparar din e-postadress, ditt visningsnamn, dina framsteg i kurserna och dina foruminlägg. Du kan när som helst radera ditt konto under Profil.</ThemedText>
      {me && !me.acceptedTerms ? <Button title="Jag godkänner" onPress={accept} loading={busy} /> : <Button title="Stäng" variant="secondary" onPress={() => router.back()} />}
    </Screen>
  );
}
