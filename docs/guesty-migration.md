# Guesty: migrácia na Reservations V3 (10. 11. 2026)

Guesty ruší staré rezervačné endpointy (`/v1/reservations`, staré webhooky `reservation.new/updated`, staré platobné zdroje) **1. 3. 2027**.
Do toho dátumu bežia staré aj nové súbežne. Zdroj: e-mail Guesty CX z 9. 11. 2026 a https://open-api-docs.guesty.com/docs/reservation-migration.

## Čo sme zmenili
| Appka | Pred | Po |
|---|---|---|
| Hlavná appka `lib/guesty.js` (overenie hosťa v Sprievodcovi) | `GET /v1/reservations` s `filters` + `guest.*` polia | `GET /v1/reservations-v3/search` (`filter[confirmationCode]`, `filter[listingId]`, `filter[checkIn][lt]`, `filter[checkOut][gte]`, `filter[status]=confirmed`) + `GET /v1/guests/{guestId}` pre meno a e-maily |
| Ring `lib/economics.js` (Ekonomika – rezervácie so sumami) | `GET /v1/reservations` (`checkIn $gte`, `lastUpdatedAt $gte`, `money.*`) | každú hodinu: V3 search cez okno −30/+120 dní + `filter[createdAt][gte]` od kurzora; sumy cez `GET /v1/reservations-v3?reservationIds[]=` (po 10) iba pre nové/zmenené (RPC `econ_reservation_sigs`), časový limit 35 s, zvyšok dobehne |
| Ring `lib/guesty.js` (odkazy na vstup) | `GET /v1/reservations` (`checkIn $between`, `_id $in`) | search podľa dní príchodu + presné okno na ISO `checkIn`; stavy cez `GET /v1/reservations-v3?reservationIds[]=` po 10 |
| CS `lib/booking.js` (založenie rezervácie) | `POST /v1/reservations` s `money`, `guest.phone`, `notes` | `POST /v1/reservations-v3` (quick booking: `accommodationFare`, `cleaningFee`, `guest.phones[]` v E.164, `numberOfGuests`) + `PUT /v1/reservations-v3/{id}/notes`; zmazaný mŕtvy fallback `/listings/{id}/calendar` |
| Práčovňa | už `/reservations-v3/search`, by-ids po 10, webhooky `reservation.created.v2/updated.v2` | bez zmeny |

Čisté pomôcky a testy: `lib/guesty-v3.js`, `tests/guesty-v3.test.mjs`.

## Dôležité rozdiely V3
- Hosť nie je v rezervácii, iba `guestId` → druhé volanie na `/v1/guests/{id}?fields=…`.
- ID jednotky je v `stay[0].listingId` (search) alebo `stay[0].unitTypeId` (by-ids).
- Stav `checked_in` už nie je stav rezervácie, ale `guestStay.status`; filtrujeme `confirmed`.
- Filtre dátumov sú iba `checkIn[gte|lt]`, `checkOut[gte|lte]` (lokalizované dni), stránkovanie `skip/limit≤100`, `pagination.hasMore`.
- By-ids berie max 10 ID naraz a odpoveď je veľká (~30–60 kB na rezerváciu) – preto sa sumy doťahujú len pre zmenené rezervácie.
- V3 nemá filter podľa poslednej zmeny (`lastUpdatedAt`); zmeny sa zisťujú porovnaním stavu/dátumov s DB.

## Webhooky
- Práčovňa (`pracovna-cyan.vercel.app/api/guesty/webhook`): nové `.v2` udalosti – v poriadku.
- PriceLabs: registrovaný na staré `reservation.new/updated/reviewed` – ich integrácia, Guesty/PriceLabs si ju migrujú sami. Skontrolovať v januári 2027.

## Overenie
`/api/cron/guesty-probe?k=CRON_SECRET&fn=active&listingId=…&today=YYYY-MM-DD` a `…&fn=code&code=…` volajú skutočné funkcie (e-maily maskované). Bez `fn` ide o surové čítanie povolených ciest.

## Guesty MCP
Guesty MCP server (beta, iba čítanie, `npx -y @guestyorg/sdk mcp`) je pre AI asistentov; naše integrácie ho nepotrebujú.
