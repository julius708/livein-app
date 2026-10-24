import './globals.css'
import './livein-design.css'
import './workspace.css'

export const metadata = {
  title: { default: 'LIVE-IN', template: '%s · LIVE-IN' },
  description: 'Interná aplikácia tímu LIVE-IN',
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: '/favicon.ico', sizes: '48x48 32x32 16x16' }, { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' }, { url: '/icon-192.png', type: 'image/png', sizes: '192x192' }],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, title: 'LIVE-IN', statusBarStyle: 'black-translucent' },
}
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#173E2C', viewportFit: 'cover' }

export default function RootLayout({ children }) {
  return (
    <html lang="sk">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
