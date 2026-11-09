import { redirect } from 'next/navigation'
/** Kiosk je teraz priamo /kluce; stará adresa ostáva ako presmerovanie (iPady s ikonou na ploche). */
export default function KeysKioskPage() { redirect('/kluce') }
