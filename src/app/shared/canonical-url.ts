import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { EnvironmentProviders, Injectable, PLATFORM_ID, inject, provideEnvironmentInitializer } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { MARKET_HOSTS } from '../services/shop.service';

/**
 * The address search engines should use for a page, the same one the
 * server-built pages carry (backend storePage.routes):
 * - on 16ahead.store (and while prerendering): https://16ahead.store/<path>;
 * - on a store's own domain (shop.amysshoes.com): that domain;
 * - a store with a verified own domain (setStoreDomain): its pages name
 *   that domain, its home as "/" there, wherever they're shown.
 * Query strings and fragments are dropped, so ?ref= and other tracking
 * parameters never become separate pages.
 */
@Injectable( { providedIn: 'root' } )
export class CanonicalUrlService {
  private readonly domains = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  /** The store's own domain this page is on, or null on our own hosts. */
  readonly ownHost: string | null;
  private readonly origin: string;

  constructor () {
    const browser = isPlatformBrowser( inject( PLATFORM_ID ) );
    const host = browser ? inject( DOCUMENT ).location?.hostname || '' : '';
    this.ownHost = host && !MARKET_HOSTS.test( host ) ? host : null;
    this.origin = this.ownHost ? `https://${ this.ownHost }` : new URL( environment.PLATFORM_URL ).origin;
  }

  /** A store's verified own domain (PublicStore.domain); null or undefined when it has none. */
  setStoreDomain ( slug: string, domain?: string | null ): void {
    if ( !slug || ( this.domains.get( slug ) || null ) === ( domain || null ) ) return;
    if ( domain ) this.domains.set( slug, domain );
    else this.domains.delete( slug );
    this.listeners.forEach( ( fn ) => fn() );
  }

  /** The full canonical address for a router path. */
  urlFor ( path: string ): string {
    const clean = path.split( /[?#]/ )[0] || '/';
    const slug = clean.split( '/' )[1] || '';
    const domain = slug ? this.domains.get( slug ) : undefined;
    if ( domain ) return clean === `/${ slug }` ? `https://${ domain }/` : `https://${ domain }${ clean }`;
    return `${ this.origin }${ clean }`;
  }

  /** @internal Re-run when a store's domain becomes known. */
  onChange ( fn: () => void ): void {
    this.listeners.add( fn );
  }
}

/**
 * Keeps <link rel="canonical"> pointing at the page being shown.
 *
 * index.html ships the site's home URL as the canonical, so without this
 * every page tells Google it's a duplicate of the home page ("Alternate page
 * with proper canonical tag" in Search Console). Works the same in the
 * browser and when pages are prerendered.
 */
export function provideCanonicalUrl (): EnvironmentProviders {
  return provideEnvironmentInitializer( () => {
    const document = inject( DOCUMENT );
    const router = inject( Router );
    const canonical = inject( CanonicalUrlService );

    const link = document.querySelector<HTMLLinkElement>( 'link[rel="canonical"]' );
    if ( !link ) return;
    let path: string | null = null;
    const apply = () => {
      if ( path !== null ) link.setAttribute( 'href', canonical.urlFor( path ) );
    };
    canonical.onChange( apply );

    router.events
      .pipe( filter( ( event ): event is NavigationEnd => event instanceof NavigationEnd ) )
      .subscribe( ( event ) => {
        path = event.urlAfterRedirects;
        apply();
      } );
  } );
}
