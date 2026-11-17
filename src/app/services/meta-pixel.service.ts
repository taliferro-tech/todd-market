import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { environment } from '../../environments/environment';

type Fbq = ( ( ...args: unknown[] ) => void ) & { callMethod?: ( ...args: unknown[] ) => void; queue: unknown[]; loaded: boolean; version: string; push: unknown };

/** Pages that aren't shopping (seller tools, a shopper's account): no Pixel there. */
const PRIVATE = /^\/(app|account|sign-in|shippo-oauth-redirect|claim)(\/|$|\?)/;

/**
 * Meta Pixel for 16Ahead's own Facebook ads: page views, product views, add
 * to cart, checkout started and purchases, across every store. The server
 * sends each purchase too (todd-backend metaEvents.service.js) with the order
 * ID as the event ID, so Meta counts it once.
 *
 * Only in production builds (environment.metaPixelId), only in the browser.
 */
@Injectable( { providedIn: 'root' } )
export class MetaPixelService {
  private readonly document = inject( DOCUMENT );
  private readonly enabled = isPlatformBrowser( inject( PLATFORM_ID ) ) && !!environment.metaPixelId;
  private loaded = false;
  private lastPath = '';

  constructor () {
    if ( !this.enabled ) return;
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

  /** Meta's cookies, sent with checkout so the server's purchase matches this browser. */
  cookies (): { fbp: string | null; fbc: string | null; sourceUrl: string | null } {
    if ( !this.enabled ) return { fbp: null, fbc: null, sourceUrl: null };
    const read = ( name: string ) => ( this.document.cookie.match( new RegExp( `(?:^|; )${ name }=([^;]*)` ) ) || [] )[1] || null;
    let fbc = read( '_fbc' );
    // Arrived from an ad on this page but the cookie isn't set yet: build it from fbclid, as Meta does.
    const fbclid = new URLSearchParams( this.document.location.search ).get( 'fbclid' );
    if ( !fbc && fbclid ) fbc = `fb.1.${ Date.now() }.${ fbclid }`;
    return { fbp: read( '_fbp' ), fbc, sourceUrl: this.document.location.href.split( '#' )[0] };
  }

  private track ( event: string, data?: Record<string, unknown>, eventId?: string ): void {
    if ( !this.enabled ) return;
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
