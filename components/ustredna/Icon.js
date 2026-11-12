// Jednoduché čiarové ikony ústredne (24×24, bez externej knižnice).
const P = {
  layout: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  dot: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18M12 11a1 1 0 1 0 0 2a1 1 0 0 0 0-2',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2',
  building: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M6 12H4a2 2 0 0 0-2 2v8h20v-11a2 2 0 0 0-2-2h-2M10 6h4M10 10h4M10 14h4M10 18h4',
  chart: 'M3 3v18h18M7 16v-4M12 16V8M17 16v-7',
  clipboard: 'M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2l4-4',
  wallet: 'M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5',
  book: 'M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4a4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3a3 3 0 0 0-3-3z',
  unplug: 'M19 5l3-3M2 22l3-3M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6l-2.3 2.3a2.4 2.4 0 0 0 0 3.4zM7.5 13.5L10 11M10.5 16.5L13 14M12 6l6 6l2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0z',
  search: 'M11 3a8 8 0 1 0 0 16a8 8 0 0 0 0-16M21 21l-4.3-4.3',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3M19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
  list: 'M3 17l2 2l4-4M3 7l2 2l4-4M13 6h8M13 12h8M13 18h8',
  right: 'M5 12h14M12 5l7 7l-7 7',
  chevron: 'M9 18l6-6l-6-6',
  upright: 'M7 7h10v10M7 17L17 7',
  x: 'M18 6L6 18M6 6l12 12',
  check: 'M18 6L7 17l-5-5M22 10l-7.5 7.5L13 16',
  alert: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18M12 8v4M12 16h.01',
  file: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7zM14 2v4a2 2 0 0 0 2 2h4M9 15l2 2l4-4',
  plus: 'M5 12h14M12 5v14',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18M12 16v-4M12 8h.01',
  hand: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  play: 'M6 3l14 9l-14 9z',
}
export default function Icon({ name, size = 16 }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name] || P.dot} /></svg>
}
