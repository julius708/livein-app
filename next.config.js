/** @type {import('next').NextConfig} */
module.exports = {
  // Zaradenie bytov: fotky miestností sa nahrávajú cez serverovú akciu (do 8 MB)
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
  // Koncové lomky nechávame na moduloch (proxované appky si ich riešia samy)
  skipTrailingSlashRedirect: true,
  // Dokumentácia appiek ide do znalostnej bázy Guru (cron guru-kb číta docs/**.md zo súborového systému)
  outputFileTracingIncludes: { '/api/cron/guru-kb': ['./docs/**/*.md'] },
  // Zjednotenie appiek: moduly bežia pod jednou doménou (app.live-in.international/<modul>)
  // a hlavná appka ich proxuje na ich vlastné nasadenia. Cesta /cs = Customer Service (basePath '/cs'), /ring = Vstupy hostí (basePath '/ring'), /pracovna = Práčovňa (basePath '/pracovna').
  async rewrites() {
    return [
      // most k Higgsfieldu v pôvodnom nasadení Zaradenia (kľúč ostáva tam), volá ho len hlavná appka s tokenom prihláseného
      { source: '/zaradenie/api/hf/bridge', destination: 'https://livein-zaradenie.vercel.app/zaradenie/api/hf/bridge' },
      { source: '/cs', destination: 'https://cs.live-in.international/cs' },
      { source: '/cs/:path*', destination: 'https://cs.live-in.international/cs/:path*' },
      { source: '/ring', destination: 'https://livein-ring.vercel.app/ring' },
      { source: '/ring/:path*', destination: 'https://livein-ring.vercel.app/ring/:path*' },
      { source: '/pracovna', destination: 'https://pracovna.live-in.international/pracovna' },
      { source: '/pracovna/:path*', destination: 'https://pracovna.live-in.international/pracovna/:path*' },
    ];
  },
};
