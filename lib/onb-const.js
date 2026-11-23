export const fmtD = (d) => (d ? new Date(d).toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '')
export const STATUS = { priprava: 'Príprava', prebieha: 'Prebieha', spustene: 'Spustené', pozastavene: 'Pozastavené' }
export const TYPES = { vlastne: 'Vlastné zariadenie', majitel: 'Majiteľ zariadený', owner_payout: 'Owner Payout' }
export const ZONES = { BA: 'Bratislava: bez city tax a DPH navyše', KE: 'Košice: bez city tax a DPH navyše', ine: 'Mimo BA a KE: city tax a 5 % DPH' }
