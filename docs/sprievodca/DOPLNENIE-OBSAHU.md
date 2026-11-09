# Sprievodca bytom – doplnenie obsahu pre všetky byty (zadanie pre tím)

Cieľ: každý byt má v Sprievodcovi úplný, schválený obsah skôr, než sa vytlačia QR štítky. Stav každého bytu vidíš na `/sprievodca` (stĺpec **Úplnosť** a filter **incomplete**).

## Čo už urobila appka automaticky
- Z Guesty sa pre každý byt stiahli: adresa a mapa, čas príchodu a odchodu, pokyny k príchodu (SK aj EN), pokyny k odchodu, parkovanie, manuál a dôležité informácie, vybavenie a kapacita, Wi-Fi (meno siete a heslo, ak boli v Guesty).
- Kódy od dverí a schránok sa automaticky vymazali a nahradili textom „[kód dostanete v správe pred príchodom]“. Do sprievodcu kódy nikdy nepatria.
- AI z textov urobila dvojjazyčné rozklikávacie sekcie (pravidlá domu po témach, byt a vybavenie, kúrenie, odpad, okolie, dôležité informácie).
- Každý takto doplnený byt je v stave **na kontrolu** a má odškrtnuté **Obsah schválený = nie**.

## Čo treba urobiť pri každom byte (5–10 minút)
1. Otvor `/sprievodca`, filter **incomplete**, klikni na byt. Hore vidíš **Úplnosť** a čo chýba.
2. Prečítaj **Príchod** – kroky musia sedieť s realitou (vchod, poschodie, výťah, kde je schránka na kľúče). Nikdy nevpisuj kódy.
3. Skontroluj **Parkovanie**, **Odchod** (čo s kľúčmi/čipom, okná, kúrenie, odpad) a **Čas odchodu**.
4. V sekcii **Pravidlá domu** doplň, čo je pre byt špecifické (fajčenie, hluk a nočný pokoj, domáce zvieratá, návštevy, odpad, poškodenie). Spoločné pravidlá LIVE-IN sa zobrazujú automaticky pod nimi.
5. Doplň **Spotrebiče a ako na to** (kúrenie, bojler, práčka, umývačka, TV, klimatizácia) – stačí 1–2 vety na spotrebič. Toto hostia hľadajú najviac.
6. **Wi-Fi**: ak karta hlási, že chýba, zadaj meno siete a heslo (zobrazí sa hosťovi až po overení pobytu).
7. **Text pri kontakte na pomoc**: krátka veta, napr. „Sme tu pre vás denne 8:00–22:00, v noci len pre havárie.“
8. Odkaz na **Google recenziu** bytu (ak existuje profil) – inak nechaj prázdne.
9. Keď je všetko v poriadku: zaškrtni **Obsah schválený**, stav **pripravené**, **Uložiť kartu**. Potom klikni **Ďalší nedoplnený**.

## Čo sa stane po schválení
- Appka vydá štítok (PDF 150 × 105 mm) automaticky v dennom behu alebo po kliknutí admina na **Vydať štítky pre všetky pripravené**. Oznámenie príde do appky s odkazom na tlač.
- Po vytlačení štítok nalepte na dohodnuté miesto v byte (pri vchode alebo pri Wi-Fi routeri). QR kód sa nikdy nemení, obsah sa dá upravovať kedykoľvek.

## Pravidlá obsahu
- Žiadne vstupné kódy, PIN-y, heslá od zámkov, ani interné poznámky (bielizeň, kapsule, kamery).
- Vykanie, stručne, SK aj EN (ak nevieš po anglicky, napíš SK a označ položku „EN doplniť“ – prekladá sa hromadne).
- Všetko, čo napíšeš, hosť vidí verejne po naskenovaní QR.
