// Odpočítavanie (čistá logika bez prehliadača, dá sa testovať).

/** Otvorenie kancelárie: 1. decembra 2026 o polnoci v Bratislave (zimný čas = UTC+1). */
export const OFFICE_OPENING = Date.UTC(2026, 10, 30, 23, 0, 0)
/** Odkedy sa ukazuje pás postupu (začiatok novembra). */
export const OFFICE_COUNT_FROM = Date.UTC(2026, 9, 31, 23, 0, 0)

const sk = (n, a, b, c) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c)
export const daysWord = (n) => sk(n, 'deň', 'dni', 'dní')

/**
 * Zostávajúci čas rozložený na dni, hodiny, minúty a sekundy.
 * @returns {{done:boolean, total:number, days:number, hours:number, minutes:number, seconds:number, last24:boolean}}
 */
export function countdownParts(now, target = OFFICE_OPENING) {
  const total = Math.max(0, target - now)
  const s = Math.floor(total / 1000)
  return {
    done: total === 0,
    total,
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    last24: total > 0 && total <= 86400000,
  }
}

/** Podiel uplynutého času od začiatku odpočtu (0 až 1) pre pás postupu. */
export function countdownProgress(now, from = OFFICE_COUNT_FROM, target = OFFICE_OPENING) {
  if (target <= from) return 1
  return Math.min(1, Math.max(0, (now - from) / (target - from)))
}

/** Veta pre čítačky obrazovky: mení sa len raz za minútu. */
export function countdownSpeech(p) {
  if (p.done) return 'Kancelária je otvorená.'
  return `Do otvorenia kancelárie zostáva ${p.days} ${daysWord(p.days)}, ${p.hours} hodín a ${p.minutes} minút.`
}
