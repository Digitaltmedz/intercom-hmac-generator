# Kursappen

Mobilapp (iPhone och Android) där en Webbas-kunds prenumeranter tar del av kursmaterial: video, ljud, PDF och forum. Webbas är källan till vem som betalar. Allt innehåll bor i appen och dess backend.

Repot innehåller även den gamla filen `api/generate-hmac.js` (Intercom), som inte hör till appen.

## Delar

**apps/api** är backend. Fastify och TypeScript mot Postgres. Speglar medlemsgruppen i Webbas till rättigheter i appen, sköter inloggning med engångskod, levererar kursträd med signerade medialänkar, driver forumet och har en adminyta för innehåll och moderering.

**apps/mobile** är appen. Expo (React Native) med expo-router. Byggs för butikerna med EAS Build, ingen Mac behövs.

## Så hänger Webbas ihop med appen

Den som köper ett medlemskap i Webbas hamnar i en medlemsgrupp. När prenumerationen upphör tas personen ur gruppen (Webbas låter kunden behålla åtkomst ut betald period). Appen speglar gruppen på tre sätt.

1. **Automation i Webbas.** Utlösare "Tillagd i medlemsgrupp" respektive "Borttagen från medlemsgrupp", steg "Aktivera en webhook" som anropar `POST {PUBLIC_API_URL}/webhooks/webbas/membership?action=added&token=<WEBBAS_AUTOMATION_TOKEN>` (och `action=removed` för den andra). Backend litar inte på webhookens innehåll utan slår alltid upp personen i Webbas API innan rättigheten ändras.

2. **Standardwebhook i Webbas.** Skapas under Webbplatsinställningar > Integrationer, eller med `POST /admin/webbas/webhooks/install`. Fångar e-postbyten och nya ordrar.

3. **Nattlig avstämning.** Hela gruppen hämtas från Webbas API och appens rättigheter görs identiska. Kan köras manuellt med `pnpm sync:webbas` eller `POST /admin/webbas/sync`.

Vid inloggning kontrolleras dessutom e-posten direkt mot Webbas. Koden skickas bara till adresser med aktivt medlemskap, men svaret ser likadant ut oavsett så att ingen kan lista medlemmar.

## Köra lokalt

```
pnpm install
cp apps/api/.env.example apps/api/.env      # fyll i Webbas-uppgifter
pnpm api:dev                                 # backend på http://localhost:3000, inbäddad databas om DATABASE_URL saknas
cp apps/mobile/.env.example apps/mobile/.env # datorns IP, inte localhost
pnpm mobile:start                            # öppna i Expo Go eller ett dev-bygge
```

Tester och typkontroll:

```
pnpm test
pnpm typecheck
```

## Driftsättning, steg för steg

1. **Webbas.** Hämta API-nyckeln under Webbplatsinställningar > Integrationer. Sätt `WEBBAS_API_BASE_URL` till kundens domän följt av `/api/site`. Hämta gruppens id via `GET /admin/webbas/groups` och sätt `WEBBAS_MEMBER_GROUP_ID`.
2. **Backend.** Kör på valfri Node-hosting (Railway, Render, Fly) med en Postgres-databas. Sätt alla variabler i `apps/api/.env.example`. Migreringar körs automatiskt vid start.
3. **Webhooks.** Anropa `POST /admin/webbas/webhooks/install` med `X-Admin-Key`. Skapa de två automationerna i Webbas enligt ovan. Kontrollera i `GET /admin/webhook-events` att anrop kommer in och behandlas utan fel.
4. **E-post.** Skapa konto hos Resend, verifiera kundens domän, sätt `EMAIL_PROVIDER=resend`.
5. **Media.** Skapa konto hos Bunny.net. Video i Bunny Stream, ljud och PDF i Bunny Storage med CDN. Slå på token-autentisering i båda och sätt `MEDIA_PROVIDER=bunny` med nycklarna. Registrera varje fil via `POST /admin/assets` och koppla till lektioner via `POST /admin/modules/:id/lessons`.
6. **Appen.** Skapa Apple Developer-konto (företag, kräver D-U-N-S) och Google Play-konto. Kör `eas init` i `apps/mobile`, fyll i `projectId` i `app.json`, byt `bundleIdentifier` och `package`, byt ikoner i `assets/images`. Bygg med `eas build --profile production` och skicka in med `eas submit`.
7. **Granskning.** Skapa ett testkonto åt Apple via `POST /admin/users` och `POST /admin/users/:id/entitlement`. Appen får inte innehålla köpknappar eller länkar till köpsidan (Apples riktlinje 3.1.1), och forumet har rapportering, blockering och villkor (riktlinje 1.2).

## Adminyta

Alla `/admin/*`-anrop kräver `X-Admin-Key: <ADMIN_API_KEY>`. Se `apps/api/src/routes/admin.ts` för hela listan. En enkel admin-webb ovanpå detta är nästa steg.

## Öppna punkter

- Innehållet i automationens webhook från Webbas är inte dokumenterat. Tolkningen är tolerant och faller tillbaka på full avstämning, men verifiera med ett riktigt anrop innan lansering.
- Bunnys tokenformat ska verifieras mot kontot vid driftsättning (se kommentar i `apps/api/src/media/provider.ts`).
- Pushnotiser skickas ännu inte från backend (tokens sparas). Utskick vid nya foruminlägg och nytt material är nästa steg.
- Texterna under Regler och villkor är utkast som kursarrangören ska granska.
