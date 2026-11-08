# Hlasový proces (kostra, beží mimo Vercelu)

Dve trasy:
1. **Odchádzajúci hovor majiteľovi** (súhlas s opravou): spúšťa ho fronta appky (`place_call`) cez poskytovateľa (3CX + OpenAI Realtime, alebo Twilio). Agent sa predstaví, **overí oprávneného príjemcu** (podľa `verify_hint` bytu, bez kódov), vysvetlí poruchu, vykonané kroky a presnú ponuku z údajov prípadu. **Rozhodnutie ostáva na odkaze v e-maile.** Pri odkazovači len neutrálny oznam. Neznáme postúpi konkrétnemu riešiteľovi.
2. **Prichádzajúce hovory** (hosť / majiteľ): samostatné prompty s odlišnými povoleniami (`prompts/guest.md`, `prompts/owner.md`). Statické FAQ sú v DB (`maint_faq`, len `approved = true`) a nie v prompte. Dynamické údaje (rezervácia, byt) len po overení a podľa oprávnení z Guesty / Super App. **Kódy a heslá nikdy** do FAQ ani do hlasu; vstupné inštrukcie len overeným kanálom rezervácie.

Udalosti do dashboardu: `POST {APP}/api/maint/call-events` s `Authorization: Bearer MAINT_EVENTS_SECRET` (pozri `events-client.mjs`). Jedno `call_id` na hovor, `seq` pre dedupe, `caller_hash` namiesto čísla.

Stav: kostra. Hlasový most (3CX/Twilio ↔ OpenAI Realtime) sa dopĺňa po potvrdení poskytovateľa na testovacej klapke.
