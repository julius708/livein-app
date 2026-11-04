import test from 'node:test'
import assert from 'node:assert/strict'
import * as C from '../lib/crm.js'

test('mestá a smerovanie', () => {
  assert.equal(C.cityGroup('Košice'), 'Košice'); assert.equal(C.cityGroup('Old Town, Kosice'), 'Košice')
  assert.equal(C.cityGroup('Bratislava Nové Mesto'), 'Bratislava'); assert.equal(C.cityGroup('Petržalka'), 'Bratislava'); assert.equal(C.cityGroup('Trnava'), 'Trnava')
  assert.equal(C.cityGroup('Bánov'), 'Iné'); assert.equal(C.cityGroup(''), 'Iné'); assert.equal(C.cityGroup('Iné'), 'Iné')
  assert.deepEqual(C.route('Košice'), { assigned_to: C.ASSIGNEES.kosice, priority: 'high', alarm_hours: 24 })
  assert.equal(C.route('Bratislava').assigned_to, C.ASSIGNEES.default); assert.equal(C.route('Iné').alarm_hours, 72); assert.equal(C.route('Trnava').priority, 'normal')
})
test('telefón, tel: a wa.me bez diakritiky', () => {
  assert.equal(C.normalizePhone('0908 548 438'), '+421908548438'); assert.equal(C.normalizePhone('+421 904 999 009'), '+421904999009'); assert.equal(C.normalizePhone('00421911783498'), '+421911783498'); assert.equal(C.normalizePhone('abc'), '')
  assert.equal(C.telLink('0908548438'), 'tel:+421908548438')
  assert.equal(C.waLink('0908548438', 'Dobrý deň, tu LIVE-IN'), 'https://wa.me/421908548438?text=dobry%20den%2C%20tu%20live-in')
})
test('zdroj a štádiá', () => {
  assert.equal(C.normalizeSource('facebook_ads'), 'Facebook / Instagram'); assert.equal(C.normalizeSource('Web formulár'), 'Web formulár'); assert.equal(C.normalizeSource(''), 'Iné / neznáme'); assert.equal(C.normalizeSource('Odporúčanie'), 'Odporúčanie')
  assert.equal(C.stageFromHubspot({ lifecyclestage: 'customer' }), 'client'); assert.equal(C.stageFromHubspot({ hs_lead_status: 'ATTEMPTED_TO_CONTACT' }), 'contacted'); assert.equal(C.stageFromHubspot({}), 'new'); assert.equal(C.stageFromHubspot({ hs_lead_status: 'UNQUALIFIED' }), 'lost')
  assert.deepEqual(C.hubspotPropsForStage('contacted', { connected: true }), { hs_lead_status: 'CONNECTED' }); assert.deepEqual(C.hubspotPropsForStage('client'), { lifecyclestage: 'customer' })
  assert.equal(C.stageFromAsanaSection('LEAD 4 · Obhliadka / hovor'), 'viewing'); assert.equal(C.stageFromAsanaSection('LEAD 3 · Kvalifikovaný'), 'contacted'); assert.equal(C.stageFromAsanaSection('LEAD ✕ · Stratený'), 'lost'); assert.equal(C.stageFromAsanaSection('LEAD 6 · Podpísaný'), 'client'); assert.equal(C.stageFromAsanaSection('Untitled section'), null)
})
test('import z HubSpotu', () => {
  assert.deepEqual(C.importKind({ lifecyclestage: 'customer' }), { kind: 'client', stage: 'client' })
  assert.deepEqual(C.importKind({ lifecyclestage: 'lead', hs_lead_status: 'NEW', createdate: '2026-11-04T22:13:05Z' }), { kind: 'lead', stage: 'new' })
  assert.deepEqual(C.importKind({ lifecyclestage: 'lead', hs_lead_status: '', createdate: '2026-11-04T20:01:00Z' }), { kind: 'not_lead', stage: 'new' })
  assert.deepEqual(C.importKind({ lifecyclestage: 'lead', hs_lead_status: '', createdate: '2026-10-01T10:00:00Z' }), { kind: 'lead', stage: 'new' })
  assert.deepEqual(C.importKind({ lifecyclestage: 'lead', hs_lead_status: 'UNQUALIFIED' }), { kind: 'lead', stage: 'lost' })
})
test('mená, odpočet, pripomienky, identita', () => {
  assert.equal(C.parseAsanaLeadName('Nový kontakt: Jan Pajerchin'), 'Jan Pajerchin'); assert.equal(C.parseAsanaLeadName('Web dopyt: Krátkodobá správa — Amanda Šuleková'), 'Amanda Šuleková')
  assert.deepEqual(C.splitName('Amanda Šuleková'), { firstname: 'Amanda', lastname: 'Šuleková' })
  const now = Date.parse('2026-11-05T10:00:00Z')
  assert.equal(C.countdown('2026-11-05T20:00:00Z', now).state, 'ok'); assert.equal(C.countdown('2026-11-05T15:00:00Z', now).state, 'soon'); assert.equal(C.countdown('2026-11-05T11:00:00Z', now).state, 'critical'); assert.equal(C.countdown('2026-11-05T08:30:00Z', now).label, '+01:30')
  const lead = { stage: 'new', kind: 'lead', alarm_hours: 24, received_at: '2026-11-04T10:00:00Z', due_at: '2026-11-05T10:00:00Z', reminders: {} }
  assert.deepEqual(C.dueReminders(lead, Date.parse('2026-11-04T23:00:00Z')).map((r) => r.key), ['h12'])
  assert.deepEqual(C.dueReminders(lead, Date.parse('2026-11-05T06:30:00Z')).map((r) => r.key), ['h12', 'h20'])
  assert.deepEqual(C.dueReminders({ ...lead, reminders: { h12: 1, h20: 1 } }, Date.parse('2026-11-05T10:01:00Z')).map((r) => r.key), ['h24'])
  assert.deepEqual(C.dueReminders({ ...lead, reminders: { h12: 1, h20: 1, h24: 1 } }, Date.parse('2026-11-05T18:10:00Z')).map((r) => r.key), ['o8'])
  assert.ok(C.dueReminders({ ...lead, reminders: { h12: 1, h20: 1, h24: 1 } }, Date.parse('2026-11-06T10:30:00Z')).some((r) => r.escalate))
  assert.deepEqual(C.dueReminders({ ...lead, stage: 'contacted' }, now), [])
  assert.deepEqual(C.leadIdentity({ email: 'A@B.sk' }), { field: 'email', value: 'a@b.sk' }); assert.deepEqual(C.leadIdentity({ asana_task_gid: '12' }), { field: 'asana_task_gid', value: '12' })
})
