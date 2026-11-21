// Firebase Hosting predeploy (firebase.json): Hosting serves a static file
// before any rewrite, so "/", /robots.txt and /sitemap.xml would always be
// 16ahead.store's, even on a store's own domain (shop.amysshoes.com). This
// moves them aside so those paths reach the marketApi function, which serves
// these same files unchanged on 16ahead.store (fetching them from their new
// names) and the store's own home page, robots.txt and sitemap on its domain
// (backend market/routes/storePage.routes.js). Safe to run more than once.
import { access, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const dir = path.resolve( here, '../dist/market/browser' );
const MOVES = [['index.html', 'index.home.html'], ['robots.txt', 'robots.market.txt'], ['sitemap.xml', 'sitemap.market.xml']];

const exists = ( file ) => access( file ).then( () => true, () => false );

for ( const [from, to] of MOVES ) {
  if ( await exists( path.join( dir, from ) ) ) await rename( path.join( dir, from ), path.join( dir, to ) );
  if ( !( await exists( path.join( dir, to ) ) ) ) {
    console.error( `route-host-files: ${ to } is missing from ${ dir }. Build first (npm run build).` );
    process.exit( 1 );
  }
}
console.log( 'route-host-files: "/", /robots.txt and /sitemap.xml will be served by marketApi.' );
