'use client'

import { useState } from 'react'
import { scenarios, startPilot, stepPilot } from '@/lib/maintenance-pilot.mjs'

const statusLabels = {
  waiting: 'Čaká na majiteľa',
  ready: 'Pripravené na objednanie servisu',
  details: 'Majiteľ žiada podrobnosti',
  declined: 'Majiteľ zamietol opravu',
  escalated: 'Na riešenie človeku v službe',
  scheduled: 'Servis dohodnutý',
  done: 'Oprava uzavretá',
}

const scenarioLabels = {
  standard: 'Súhlas majiteľa',
  within: 'Oprava v limite',
  urgent: 'Urgentný prípad',
  missing: 'Chýbajúci kontakt',
}

export default function Pilot() {
  const [selection, setSelection] = useState('standard')
  const [state, setState] = useState(null)
  const act = (event) => setState((current) => current ? stepPilot(current, event) : current)
  return (
    <main style={{ maxWidth: 760, margin: '32px auto', padding: '0 20px 40px', lineHeight: 1.55 }}>
      <p><a href="/">← Späť do Super App</a></p>
      <h1>Pilot údržby</h1>
      <p>Skúšobný režim s fiktívnymi bytmi. Správy a termíny sa simulujú v tejto relácii.</p>
      <form onSubmit={(event) => { event.preventDefault(); setState(startPilot(scenarios[selection])) }}>
        <label>Scenár{' '}
          <select value={selection} onChange={(event) => setSelection(event.target.value)}>
            {Object.entries(scenarioLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>{' '}
        <button type="submit">Nahlásiť skúšobnú poruchu</button>
      </form>
      {state && (
        <>
          <section aria-live="polite">
            <h2>{state.scenario.name}</h2>
            <p>{state.scenario.issue}</p>
            <p>Odhad <strong>{state.scenario.estimate} €</strong> · Dohodnutý limit <strong>{state.scenario.limit} €</strong></p>
            <p>Stav: <strong>{statusLabels[state.status]}</strong></p>
          </section>
          {state.status === 'waiting' && (
            <section>
              <h2>Simulovaný e-mail majiteľa</h2>
              <p>Prosíme o rozhodnutie k oprave v byte {state.scenario.name}. {state.scenario.issue} Odhad je {state.scenario.estimate} €. Prosíme o odpoveď do štyroch hodín.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button onClick={() => act('approve')}>Schvaľujem {state.scenario.estimate} €</button>
                <button onClick={() => act('details')}>Chcem podrobnosti</button>
                <button onClick={() => act('decline')}>Neschvaľujem</button>
                <button onClick={() => act('time')}>Posunúť čas o 2 hodiny</button>
              </div>
            </section>
          )}
          {state.status === 'ready' && <button onClick={() => act('schedule')}>Potvrdiť dohodnutý servis</button>}
          {state.status === 'scheduled' && <button onClick={() => act('done')}>Potvrdiť dokončenie opravy</button>}
          <section aria-live="polite">
            <h2>História prípadu</h2>
            <ol>{state.history.map((entry) => <li key={entry}>{entry}</li>)}</ol>
          </section>
        </>
      )}
    </main>
  )
}
