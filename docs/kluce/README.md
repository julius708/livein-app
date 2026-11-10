# Kľúče – evidencia kľúčov na stene

Modul `/kluce` v hlavnej appke. Stena s kľúčmi v miestnosti je v appke ako tabuľa dlaždíc.

## Ako to funguje
- **Pozícia** = poradové číslo háčika zľava doprava po celých lištách (1, 2, 3 …). Písmená A, B, C sa nepoužívajú. Lišty (rady) a ich rozsahy čísel sa nastavujú v **Správe**; keď sa stena preusporiada, zmenia sa len rozsahy a pozície bytov, história ostáva.
- **Farby:** zelená = všetky sady na háčiku, oranžová s počtom (napr. 1/2) = časť sád vonku, červená = všetko vonku, sivá prerušovaná = voľná pozícia.
- **Zobrať kľúče:** osoba (ponuka mien, bez PIN-u) → byty (ťuknutím na tabuľu, cez hľadanie alebo zo zoznamu podľa tašiek) → Potvrdiť. Dá sa vybrať viac bytov naraz.
- **Vrátiť kľúče:** osoba → appka ukáže, čo má vonku → Potvrdiť. Keď niekto vracia kľúče, ktoré podľa evidencie nezobral, zapíše sa to s poznámkou.
- **Podľa tašiek:** zoznam na dnes a zajtra z balenia v Práčovni (tabuľka `packages`, rovnaké poradie ako nástenka Práčovne). „Prebrať všetky z tohto dňa naraz“ vyberie všetky, ktoré sú na háčiku.
- Na tabuli sú len **bratislavské byty** (stena je v Bratislave); Košice, Trnava a ostatné sa z registra nepridávajú. Byt mimo Bratislavy, ktorý má kľúč na stene, sa pridá ručne v Nastaveniach.
- **Názov na dlaždici** je krátky (ulica); keď sa začiatok opakuje (Eurovea, Skypark, Dunajská, Modrá Guľa…), ukáže sa celý názov. Ťuknutím na dlaždicu sa v lište otvorí detail: celý názov, adresa, poschodie / číslo bytu, poznámka, kto má kľúč. Adresa a poschodie sa upravujú v Nastaveniach.
- **Byty bez pozície** sa zobrazujú v samostatnom bloku v abecednom poradí (ako Práčovňa), kým im admin nepridelí číslo.
- **Upozornenie:** kľúče vonku dlhšie než nastavený limit (predvolene 24 h) sa ukážu žltým pásom hore.
- **Kiosk = `/kluce`**: bez hlavičky appky a Guru, hore len malé logo (späť na domov), vľavo dlaždice, vpravo úzka lišta. Obnova každých 45 s, obrazovka nezhasína, rozrobený výber sa po 2 minútach zruší. iPad je prihlásený raz na zdieľaný účet s prístupom ku kľúčom; `/kluce/kiosk` presmeruje na `/kluce`.
- **História** `/kluce/historia`: každý pohyb (kto, kedy, byt, pozícia v tom čase, zdroj appka/kiosk/zámok).
- **Nastavenia** `/kluce/sprava` (ozubené koliesko v hlavičke kiosku): pridať kľúč mimo Guesty, načítať byty z registra, pozícia a počet sád pre každý kľúč, poznámka, vyradiť/zaradiť; admin navyše lišty, limit upozornenia a nápravu stavu (kľúče sa našli).

## Prístup
Roly admin, operations, cleaning, customer_service, assistant (RLS `keys_team()`).

## Inteligentný zámok
`POST /api/kluce/lock-event` s `Authorization: Bearer <KEYS_LOCK_SECRET>` ukladá udalosti „kto vošiel“ do `key_lock_events`. Párovanie s pohybmi na kiosku sa doplní, keď bude známy výrobca zámku a tvar jeho udalostí. Bez nastaveného tajomstva vracia 503.

## Dáta
`key_units` (byt, pozícia, sady, vonku, držitelia), `key_moves` (história), `key_settings` (lišty, limit), `key_lock_events`. Migrácia `supabase/migrations/20261109_kluce.sql`. Logika bez DB v `lib/keys-core.js` (testy `tests/keys.test.mjs`).
