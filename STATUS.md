## 11. 11. 2026 – Vyúčtovanie majiteľom
- Nový modul `/vyuctovanie` (admin, asistentka, operácie): tabuľka po bytoch, úprava priamo v riadku, filtre, stavy, firma bytu, medzisúčty častí (Modrá guľa, Dicer), kalkulačka prádla, nový mesiac, export do Excelu. Dokumentácia `docs/vyuctovanie/README.md`.
- Migrácia `20261111_vyuctovanie` aplikovaná; október 2026 naimportovaný (239 riadkov, súčet 9 399,96 € sedí). Fáza 2 (Asana, Gmail, editor cenníka) zatiaľ len návrh.

## 10. 11. 2026 – Guesty Reservations V3
- Guesty ruší staré `/v1/reservations` + staré webhooky **1. 3. 2027**. Hlavná appka (overenie hosťa), Ring (odkazy na vstup aj Ekonomika) a CS (založenie rezervácie) prepnuté na V3; Práčovňa už V3 mala. Podrobnosti `docs/guesty-migration.md`.
- PriceLabs webhook ostáva na starých udalostiach (ich zodpovednosť) – skontrolovať v januári 2027.



## 9. 11. 2026 (večer)
- Kľúče `/kluce`: kiosk (len logo + ozubené koliesko), pozície z Usporiadania kľúčov Práčovne (čísla bez písmen, 87 bytov + 14 ručných položiek), nastavenia (pridať kľúč, pozícia, sady, vyradiť), história, liquid glass, responzívne.
- Údržba: dlaždica na domove, pilot zapnutý v test režime (povolená adresa: Július). Tím môže testovať celý tok; správy idú len na povolené adresy, objednávky sa evidujú.
- Guru: tvár vyplní guličku; rovnaký widget v CS, Práčovni, Ringu a Zaradení (bez pozdravu, hlas vypnutý, gulička). Skryť Guru sa dá len v hlavnej appke (inde nie je kde ho zapnúť späť).
