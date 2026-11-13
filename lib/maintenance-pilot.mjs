export const scenarios = {
  standard: { name: 'Byt A · kúrenie', issue: 'Kúrenie nefunguje, hosť je v byte.', estimate: 180, limit: 100 },
  within: { name: 'Byt B · teplá voda', issue: 'Servis diagnostikoval chybný ventil.', estimate: 75, limit: 100 },
  urgent: { name: 'Byt C · kúrenie', issue: 'Technik označil prípad ako urgentný.', estimate: 240, limit: 100, urgent: true },
  missing: { name: 'Byt D · teplá voda', issue: 'Teplá voda netečie, hosť je v byte.', estimate: 145, limit: 100, missingContact: true },
}

function record(state, status, text, fields = {}) {
  return { ...state, ...fields, status, history: [...state.history, text] }
}

export function startPilot(scenario) {
  const state = { scenario, hours: 0, history: ['Zákaznícky servis zaznamenal poruchu.'] }
  if (scenario.urgent) return record(state, 'escalated', 'Urgentný prípad prevzal človek v službe.')
  if (scenario.estimate <= scenario.limit) return record(state, 'ready', 'Odhad je v dohodnutom limite. Prípad ide na objednanie servisu.')
  if (scenario.missingContact) return record(state, 'escalated', 'Chýba overený e-mail majiteľa. Prípad preberá človek v službe.')
  return record(state, 'waiting', 'Žiadosť o súhlas je pripravená v simulovanej schránke majiteľa.')
}

export function stepPilot(state, event) {
  if (event === 'approve' && state.status === 'waiting') return record(state, 'ready', 'Majiteľ schválil uvedenú sumu. Prípad ide na objednanie servisu.')
  if (event === 'details' && state.status === 'waiting') return record(state, 'details', 'Majiteľ žiada podrobnosti. Úlohu preberá človek v službe.')
  if (event === 'decline' && state.status === 'waiting') return record(state, 'declined', 'Majiteľ opravu neschválil. Ďalší postup rieši človek v službe.')
  if (event === 'schedule' && state.status === 'ready') return record(state, 'scheduled', 'Servis je dohodnutý. Zákaznícky servis vidí aktualizáciu pre hosťa.')
  if (event === 'done' && state.status === 'scheduled') return record(state, 'done', 'Tím potvrdil dokončenie opravy.')
  if (event === 'time' && state.status === 'waiting') {
    if (state.hours === 0) return record(state, 'waiting', 'Po 2 hodinách systém pripravil jednu pripomienku.', { hours: 2 })
    return record(state, 'escalated', 'Po 4 hodinách bez odpovede preberá prípad človek v službe.', { hours: 4 })
  }
  return state
}
