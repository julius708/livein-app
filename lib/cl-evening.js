// Upratovanie: večerný beh. Z údajov cl_plan_data vyráta návrh rozdelenia nepriradených bytov na zajtra (pre manažérov) a pripomienky pre upratovačky.
import { proposeAssignments } from './cl-assign.js'
import { assignMessage, eveningMessage, proposalMessage, notifyOn } from './cl-notify.js'

/**
 * @returns {{ items: Array, proposal: object|null, counts: object }}  items = správy { email, title, body, url, tag } na odoslanie
 */
export function eveningPlan({ plan, day, origin = '' }) {
  const staff = plan.staff || []
  const flats = Object.fromEntries((plan.flats || []).map((f) => [f.listing_id, f]))
  const tasks = (plan.tasks || []).filter((t) => t.status !== 'cancelled')
  const open = tasks.filter((t) => t.date === day && t.status === 'todo' && !t.cleaner_email)
  const settings = plan.settings || {}
  const items = []
  let proposal = null
  if (open.length && notifyOn(settings, 'evening_proposal')) {
    const r = proposeAssignments({ tasks: open, staff, flats, assigned: tasks.filter((t) => t.cleaner_email), history: plan.history || [] })
    const named = r.assignments.map((a) => ({ ...a, name: (staff.find((s) => s.email === a.email) || {}).name || a.email }))
    proposal = { day, assignments: named, unassigned: r.unassigned, total: open.length }
    const msg = proposalMessage(proposal, `/upratovanie?tab=plan&d=${day}&auto=1`)
    for (const m of staff.filter((s) => s.role === 'manager')) items.push({ email: m.email, ...msg })
  }
  let reminders = 0
  if (notifyOn(settings, 'evening_reminder')) {
    for (const c of staff.filter((s) => s.role === 'cleaner')) {
      const mine = tasks.filter((t) => t.date === day && t.cleaner_email === c.email && t.status !== 'done')
      if (!mine.length) continue
      items.push({ email: c.email, ...eveningMessage(mine, day) })
      reminders++
    }
  }
  return { items, proposal, counts: { open: open.length, reminders, managers: items.filter((i) => i.tag === 'cl-proposal').length } }
}

/** Prvé priradenie: skupiny úloh podľa upratovačky pre jednu správu na človeka (hromadné priradenie neposiela správu za každý byt). */
export function assignmentItems(tasks, byEmail) {
  const groups = new Map()
  for (const t of tasks) {
    const email = byEmail[t.id]
    if (!email) continue
    groups.set(email, [...(groups.get(email) || []), t])
  }
  return [...groups.entries()].map(([email, list]) => ({ email, ...assignMessage(list) }))
}
