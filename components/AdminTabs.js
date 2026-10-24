'use client'
import { usePathname } from 'next/navigation'

export default function AdminTabs() {
  const p = usePathname() || ''
  return (
    <nav className="tabs" aria-label="Správa">
      <a href="/admin/activity" className={p.startsWith('/admin/activity') ? 'on' : ''}>Aktivita aplikácií</a>
      <a href="/admin/users" className={p.startsWith('/admin/users') ? 'on' : ''}>Ľudia a práva</a>
      <a href="/admin/feedback" className={p.startsWith('/admin/feedback') ? 'on' : ''}>Feedback</a>
      <a href="/admin/settings" className={p.startsWith('/admin/settings') ? 'on' : ''}>Nastavenia</a>
    </nav>
  )
}
