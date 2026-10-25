/** @type {import('next').NextConfig} */
module.exports = {
  // /ekonomika/ potrebuje koncovú lomku (relatívne cesty statickej stránky) – Next ju nesmie odstraňovať
  skipTrailingSlashRedirect: true,
  // Zjednotenie appiek: moduly bežia pod jednou doménou (app.live-in.international/<modul>)
  // a hlavná appka ich proxuje na ich vlastné nasadenia. Cesta /cs = Customer Service (basePath '/cs'), /ring = Vstupy hostí (basePath '/ring'), /ekonomika/ = Ekonomika (statická stránka), /pracovna = Práčovňa (basePath '/pracovna').
  async rewrites() {
    return [
      { source: '/cs', destination: 'https://cs.live-in.international/cs' },
      { source: '/cs/:path*', destination: 'https://cs.live-in.international/cs/:path*' },
      { source: '/ring', destination: 'https://livein-ring.vercel.app/ring' },
      { source: '/ring/:path*', destination: 'https://livein-ring.vercel.app/ring/:path*' },
      // Ekonomika je statická stránka s relatívnymi cestami: beží na /ekonomika/ (s lomkou, presmeruje middleware)
      { source: '/ekonomika/:path*', destination: 'https://ekonomika.live-in.international/:path*' },
      { source: '/pracovna', destination: 'https://pracovna.live-in.international/pracovna' },
      { source: '/pracovna/:path*', destination: 'https://pracovna.live-in.international/pracovna/:path*' },
    ];
  },
};
