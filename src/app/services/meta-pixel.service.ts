import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { environment } from '../../environments/environment';

type Fbq = ( ( ...args: unknown[] ) => void ) & { callMethod?: ( ...args: unknown[] ) => void; queue: unknown[]; loaded: boolean; version: string; push: unknown };

/** Pages that aren't shopping (seller tools, a shopper's account): no Pixel there. */
const PRIVATE = /^\/(app|account|sign-in|shippo-oauth-redirect|claim|help\/privacy-choices)(\/|$|\?)/;
/** "Your privacy choices": the visitor turned ad measurement off in this browser. */
const OPT_OUT_KEY = 'tm-ads-opt-out';

/**
 * Meta Pixel for 16Ahead's own Facebook ads: page views, product views, add
 * to cart, checkout started and purchases, across every store. The server
 * sends each purchase too (todd-backend metaEvents.service.js) with the order
 * ID as the event ID, so Meta counts it once.
 *
 * Only in production builds (environment.metaPixelId), only in the browser,
 * and never for a visitor who opted out on /help/privacy-choices or whose
 * browser sends Global Privacy Control. The opt-out also reaches the server
 * with checkout, so it skips its copy of the purchase.
 */
@Injectable( { providedIn: 'root' } )
export class MetaPixelService {
  private readonly document = inject( DOCUMENT );
  private readonly browser = isPlatformBrowser( inject( PLATFORM_ID ) );
  private readonly configured = this.browser && !!environment.metaPixelId;
  private loaded = false;
  private lastPath = '';

  constructor () {
    if ( !this.configured ) return;
    inject( Router ).events.pipe( filter( ( e ): e is NavigationEnd => e instanceof NavigationEnd ) ).subscribe( ( e ) => {
      const path = e.urlAfterRedirects.split( '#' )[0];
      if ( PRIVATE.test( path ) || path === this.lastPath ) return;
      this.lastPath = path;
      this.track( 'PageView' );
    } );
  }

  viewContent ( product: { id: string; title: string; priceCents: number } ): void {
    this.track( 'ViewContent', { content_ids: [product.id], content_name: product.title, content_type: 'product', value: dollars( product.priceCents ), currency: 'USD' } );
  }

  addToCart ( item: { productId: string; title: string; priceCents: number } ): void {
    this.track( 'AddToCart', { content_ids: [item.productId], content_name: item.title, content_type: 'product', value: dollars( item.priceCents ), currency: 'USD' } );
  }

  initiateCheckout ( items: { productId: string; quantity: number; priceCents: number }[] ): void {
    this.track( 'InitiateCheckout', {
      content_ids: [...new Set( items.map( ( i ) => i.productId ) )], content_type: 'product', currency: 'USD',
      num_items: items.reduce( ( n, i ) => n + i.quantity, 0 ),
      value: dollars( items.reduce( ( n, i ) => n + i.priceCents * i.quantity, 0 ) ),
    } );
  }

  /** eventID = the order ID, the same one the server sends. */
  purchase ( orderId: string, totalCents: number, items: { productId: string; quantity: number; priceCents: number }[] ): void {
    this.track( 'Purchase', {
      value: dollars( totalCents ), currency: 'USD', order_id: orderId, content_type: 'product',
      content_ids: [...new Set( items.map( ( i ) => i.productId ) )],
      contents: items.map( ( i ) => ( { id: i.productId, quantity: i.quantity, item_price: dollars( i.priceCents ) } ) ),
      num_items: items.reduce( ( n, i ) => n + i.quantity, 0 ),
    }, orderId );
  }

  /** The browser's Global Privacy Control signal: treated as an opt-out. */
  gpc (): boolean {
    return this.browser && ( this.document.defaultView?.navigator as { globalPrivacyControl?: boolean } | undefined )?.globalPrivacyControl === true;
  }

  /** Opted out here, or by Global Privacy Control. */
  optedOut (): boolean {
    if ( !this.browser ) return false;
    if ( this.gpc() ) return true;
    try { return this.document.defaultView?.localStorage.getItem( OPT_OUT_KEY ) === '1'; } catch { return false; }
  }

  /** "Your privacy choices": turns ad measurement off (or back on) in this browser. */
  setOptOut ( off: boolean ): void {
    if ( !this.browser ) return;
    try {
      if ( off ) this.document.defaultView?.localStorage.setItem( OPT_OUT_KEY, '1' );
      else this.document.defaultView?.localStorage.removeItem( OPT_OUT_KEY );
    } catch { /* storage blocked: the choice lasts this visit only */ }
    if ( off ) {
      const w = this.document.defaultView as unknown as { fbq?: Fbq };
      try { w.fbq?.( 'consent', 'revoke' ); } catch { /* not loaded */ }
      // Meta's first-party cookies go too.
      for ( const name of ['_fbp', '_fbc'] ) {
        this.document.cookie = `${ name }=; Max-Age=0; path=/`;
        this.document.cookie = `${ name }=; Max-Age=0; path=/; domain=.${ this.document.location.hostname.replace( /^www\./, '' ) }`;
      }
    }
  }

  /** Meta's cookies, sent with checkout so the server's purchase matches this browser, or the opt-out. */
  cookies (): { fbp: string | null; fbc: string | null; sourceUrl: string | null; optOut: boolean } {
    if ( this.optedOut() ) return { fbp: null, fbc: null, sourceUrl: null, optOut: true };
    if ( !this.configured ) return { fbp: null, fbc: null, sourceUrl: null, optOut: false };
    const read = ( name: string ) => ( this.document.cookie.match( new RegExp( `(?:^|; )${ name }=([^;]*)` ) ) || [] )[1] || null;
    let fbc = read( '_fbc' );
    // Arrived from an ad on this page but the cookie isn't set yet: build it from fbclid, as Meta does.
    const fbclid = new URLSearchParams( this.document.location.search ).get( 'fbclid' );
    if ( !fbc && fbclid ) fbc = `fb.1.${ Date.now() }.${ fbclid }`;
    return { fbp: read( '_fbp' ), fbc, sourceUrl: this.document.location.href.split( '#' )[0], optOut: false };
  }

  private track ( event: string, data?: Record<string, unknown>, eventId?: string ): void {
    if ( !this.configured || this.optedOut() ) return;
    try {
      const fbq = this.load();
      if ( eventId ) fbq( 'track', event, data || {}, { eventID: eventId } );
      else if ( data ) fbq( 'track', event, data );
      else fbq( 'track', event );
    } catch { /* tracking must never break the store */ }
  }

  /** Meta's standard snippet, loaded on first use. */
  private load (): Fbq {
    const w = this.document.defaultView as unknown as { fbq?: Fbq; _fbq?: Fbq };
    if ( this.loaded && w.fbq ) return w.fbq;
    if ( !w.fbq ) {
      const fbq = function ( ...args: unknown[] ) {
        if ( fbq.callMethod ) fbq.callMethod( ...args ); else fbq.queue.push( args );
      } as Fbq;
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.queue = [];
      w.fbq = fbq;
      if ( !w._fbq ) w._fbq = fbq;
      const script = this.document.createElement( 'script' );
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      this.document.head.appendChild( script );
    }
    w.fbq!( 'init', environment.metaPixelId );
    this.loaded = true;
    return w.fbq!;
  }
}

function dollars ( cents: number ): number {
  return Math.round( Number( cents || 0 ) ) / 100;
}
