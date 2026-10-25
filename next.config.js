/** @type {import('next').NextConfig} */
module.exports = {
  // Zjednotenie appiek: moduly bežia pod jednou doménou (app.live-in.international/<modul>)
  // a hlavná appka ich proxuje na ich vlastné nasadenia. Cesta /cs = Customer Service (basePath '/cs'), /ring = Vstupy hostí (basePath '/ring').
  async rewrites() {
    return [
      { source: '/cs', destination: 'https://cs.live-in.international/cs' },
      { source: '/cs/:path*', destination: 'https://cs.live-in.international/cs/:path*' },
      { source: '/ring', destination: 'https://livein-ring.vercel.app/ring' },
      { source: '/ring/:path*', destination: 'https://livein-ring.vercel.app/ring/:path*' },
    ];
  },
};
