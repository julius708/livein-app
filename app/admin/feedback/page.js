import { getViewer } from '@/lib/auth'
import { KINDS } from '@/lib/feedback'
import FeedbackStatus from '@/components/FeedbackStatus'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Feedback' }

export default async function AdminFeedback() {
  const { s } = await getViewer()
  const { data } = await s.from('feedback').select('*').order('created_at', { ascending: false }).limit(300)
  const rows = data || []
  const open = rows.filter((r) => r.status === 'nove' || r.status === 'riesi_sa').length
  return (
    <section className="card">
      <h2>Feedback od tímu</h2>
      <p className="sub">{rows.length} správ, {open} otvorených.</p>
      {rows.length === 0 && <p className="hint">Zatiaľ nič. Keď tím začne testovať, správy sa objavia tu.</p>}
      <div className="fblist">
        {rows.map((f) => (
          <div className="fbitem" key={f.id}>
            <div className="fbhead">
              <span>{KINDS[f.kind]?.icon} <b>{f.user_name || f.user_email}</b> · {KINDS[f.kind]?.label}</span>
              <FeedbackStatus id={f.id} status={f.status} />
            </div>
            <p>{f.message}</p>
            <small>{new Date(f.created_at).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava', dateStyle: 'medium', timeStyle: 'short' })} · {f.device || '?'} · {f.page || '/'}</small>
          </div>
        ))}
      </div>
    </section>
  )
}
