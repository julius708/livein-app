import 'server-only'
import { adminClientAsync } from './supabase-admin'
import { guestyFirmList, isKosice } from './billing-core'

/** Obdobia od najnovšieho. */
export async function billingPeriods(s) {
  const { data, error } = await s.from('billing_periods').select('id,month,status,created_at,closed_at').order('month', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

/** Riadky obdobia bez košických bytov (tie sa v module nezobrazujú). */
export async function billingItems(s, periodId) {
  const out = []
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await s.from('billing_items').select('*').eq('period_id', periodId).order('ord', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out.filter((r) => !isKosice(r.byt))
}

export async function priceList(s) {
  const { data, error } = await s.from('price_list').select('id,polozka,obchod,cena,poznamka,active').order('polozka', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

/** Listingy z Guesty (public.listings): firma z tagu a názvy bytov do ponuky. Chyba nezhodí stránku, firma sa vtedy dopočíta zo zoznamu v kóde. */
export async function billingListings() {
  try {
    const a = await adminClientAsync()
    const { data, error } = await a.from('listings').select('guesty_id,name,city,active,tags')
    if (error) throw new Error(error.message)
    const rows = (data || []).filter((l) => l.name && !isKosice(l.name, l.city))
    return { guesty: guestyFirmList(rows), names: rows.filter((l) => l.active !== false).map((l) => l.name).sort((a, b) => a.localeCompare(b, 'sk')) }
  } catch (e) {
    console.error('[vyuctovanie] listings', String(e && e.message).slice(0, 80))
    return { guesty: [], names: [] }
  }
}
