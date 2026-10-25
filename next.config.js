/** @type {import('next').NextConfig} */
module.exports = {
  // Zjednotenie appiek: moduly bežia pod jednou doménou (app.live-in.international/<modul>)
  // a hlavná appka ich proxuje na ich vlastné nasadenia. Cesta /cs = Customer Service (basePath '/cs').
  async rewrites() {
    return [
      { source: '/cs', destination: 'https://cs.live-in.international/cs' },
      { source: '/cs/:path*', destination: 'https://cs.live-in.international/cs/:path*' },
    ];
  },
};
