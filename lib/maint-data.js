// Spoločné načítania pre stránky údržby (server).
export async function maintFlats(s) {
  const { data } = await s.from('listings').select('guesty_id,name,title,city,active').eq('active', true).order('name').limit(1000)
  return (data || []).map((l) => ({ id: l.guesty_id, name: l.name || l.title || 'Byt', city: l.city || '' })).filter((f) => f.id)
}
export async function maintSettings(s) {
  const { data } = await s.from('maint_settings').select('key,value')
  const o = {}; for (const r of data || []) o[r.key] = r.value || {}
  return o
}
