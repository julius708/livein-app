'use client'
import { useState } from 'react'
import { saveSettingAction } from '@/app/upratovanie/actions'
import { useRun, Msg, Field } from './ui'

export default function SettingsTab({ data, demo }) {
  const [list, setList] = useState((data.settings.checklist || []).join('\n'))
  const [photos, setPhotos] = useState((data.settings.rules && data.settings.rules.min_after_photos) || 0)
  const [rec, setRec] = useState(((data.settings.report && data.settings.report.recipients) || []).join('\n'))
  const a = useRun(), b = useRun(), c = useRun()
  return (
    <div className="up-wrap">
      <section className="up-panel">
        <h2>Spoločný checklist</h2>
        <p className="up-hint">Tieto body dostane upratovačka v každom byte, keď klikne „Som v byte“. K nim sa pridajú body bytu a kapsule a bielizeň z karty Práčovne. Zmena platí pre úlohy, ktoré ešte nezačali.</p>
        <textarea rows="12" value={list} onChange={(e) => setList(e.target.value)} aria-label="Spoločný checklist" />
        <div className="up-row"><button className="btn" disabled={a.pending || demo} onClick={() => a.run(() => saveSettingAction('checklist', list), { ok: 'Checklist uložený.' })}>Uložiť checklist</button></div>
        <Msg msg={a.msg} />
      </section>
      <section className="up-panel">
        <h2>Pravidlá dokončenia</h2>
        <Field label="Najmenej fotiek „po“ pred dokončením" hint="0 = fotky nie sú povinné."><input type="number" min="0" max="10" value={photos} onChange={(e) => setPhotos(e.target.value)} /></Field>
        <div className="up-row"><button className="btn" disabled={b.pending || demo} onClick={() => b.run(() => saveSettingAction('rules', { min_after_photos: photos }), { ok: 'Pravidlo uložené.' })}>Uložiť pravidlo</button></div>
        <Msg msg={b.msg} />
      </section>
      <section className="up-panel">
        <h2>Mesačný report e-mailom</h2>
        <p className="up-hint">Každého 1. v mesiaci ráno príde na tieto adresy Excel s upratovaním za predošlý mesiac (súhrn po upratovačkách, všetky úlohy, byty) a krátky prehľad v texte. Prázdne = nič sa neposiela. Tabuľku si môžeš stiahnuť aj kedykoľvek v časti Náklady.</p>
        <Field label="Komu posielať (každý e-mail na nový riadok)" wide><textarea rows="3" value={rec} onChange={(e) => setRec(e.target.value)} placeholder="meno@firma.sk" /></Field>
        <div className="up-row"><button className="btn" disabled={c.pending || demo} onClick={() => c.run(() => saveSettingAction('report', rec), { ok: 'Príjemcovia uložení.' })}>Uložiť príjemcov</button></div>
        <Msg msg={c.msg} />
      </section>
    </div>
  )
}
