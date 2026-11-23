'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markReadAction } from './actions'

export default function ReadAll() {
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <p className="ib-bar">
      <button type="button" className="btn" disabled={pending} onClick={() => start(async () => { await markReadAction(null); router.refresh() })}>
        {pending ? 'Ukladám…' : 'Označiť všetko ako prečítané'}
      </button>
    </p>
  )
}
