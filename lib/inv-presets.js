// Predvoľby nastavení kalkulačky. „Lazaretská 15“ = predpoklady projektovej stránky pre developera (analýza LIVE-IN z 15. 9. 2026, zadanie z 11. 11. 2026).
// Sú to ilustračné predpoklady na ukážku, nie schválené firemné kritériá.
export const LAZARETSKA_15 = {
  label: 'Podľa projektu Lazaretská 15',
  note: 'Cena za noc okolo 98 €, poplatky portálov 15 %, správa 17 % (bežná sadzba), DPH 5 %, upratovanie 25 € na pobyt, dĺžka pobytu 3,77 noci, energie a ďalšie mesačné náklady 200 € (2 400 €/rok), Guesty 50 €/mes., zariadenie 15 000 € ako ilustračný predpoklad. Scenáre: opatrný 90 € / 60 %, základný 98 € / 70 %, vyšší 105 € / 75 %. Kritérium výnosu 5 % je ukážkové (cieľ 5 až 6 % z projektovej stránky), nie schválené.',
  calc: {
    ops: { management_pct: 17, vat_pct: 5, software_month: 50, portal_pct: 15, own_nights: 0, stay_default: 3.77, clean_small: 25, clean_large: 25, clean_paid: 0, fixed_default: 200 },
    scenarios: { conservative: { label: 'Opatrný', adr: 90, occupancy: 60 }, base: { label: 'Základný', adr: 98, occupancy: 70 }, optimistic: { label: 'Vyšší', adr: 105, occupancy: 75 } },
    costs: { commission_pct: null, legal_pct: null, reserve_pct: null, furnishing_default: 15000 },
    ltr: { vacancy_pct: null, management_pct: null },
    mortgage: { rate_pct: null, rate_source: null, rate_date: null, years: null },
    thresholds: { min_yield_total_pct: 5, min_cash_on_cash_pct: null, min_monthly_cashflow: null, max_break_even_occupancy: null, min_quality: null },
  },
}
