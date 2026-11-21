import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';

import { CanonicalUrlService } from './canonical-url';

function service ( hostname: string ): CanonicalUrlService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule( { providers: [{ provide: DOCUMENT, useValue: { location: { hostname } } }] } );
  return TestBed.inject( CanonicalUrlService );
}

describe( 'CanonicalUrlService', () => {
  afterEach( () => TestBed.resetTestingModule() );

  it( 'names 16ahead.store on our own hosts, dropping query strings', () => {
    for ( const host of ['16ahead.store', 'www.16ahead.store', 'market.taliferro.tech', 'localhost'] ) {
      const c = service( host );
      expect( c.ownHost ).toBeNull();
      expect( c.urlFor( '/' ) ).toBe( 'https://16ahead.store/' );
      expect( c.urlFor( '/sell?ref=x#top' ) ).toBe( 'https://16ahead.store/sell' );
      expect( c.urlFor( '/bettys-bridal' ) ).toBe( 'https://16ahead.store/bettys-bridal' );
    }
  } );

  it( "names a store's verified own domain for its pages, wherever they're shown", () => {
    const c = service( '16ahead.store' );
    let changes = 0;
    c.onChange( () => changes++ );
    c.setStoreDomain( 'bettys-bridal', 'shop.bettys.test' );
    expect( changes ).toBe( 1 );
    expect( c.urlFor( '/bettys-bridal' ) ).toBe( 'https://shop.bettys.test/' );
    expect( c.urlFor( '/bettys-bridal/products/p1?size=10' ) ).toBe( 'https://shop.bettys.test/bettys-bridal/products/p1' );
    expect( c.urlFor( '/bettys-bridal-two' ) ).toBe( 'https://16ahead.store/bettys-bridal-two' );
    expect( c.urlFor( '/sell' ) ).toBe( 'https://16ahead.store/sell' );
    c.setStoreDomain( 'bettys-bridal', 'shop.bettys.test' );
    expect( changes ).toBe( 1 );
    c.setStoreDomain( 'bettys-bridal', undefined );
    expect( changes ).toBe( 2 );
    expect( c.urlFor( '/bettys-bridal' ) ).toBe( 'https://16ahead.store/bettys-bridal' );
  } );

  it( "uses the store's own domain as the origin on that domain", () => {
    const c = service( 'shop.bettys.test' );
    expect( c.ownHost ).toBe( 'shop.bettys.test' );
    expect( c.urlFor( '/' ) ).toBe( 'https://shop.bettys.test/' );
    c.setStoreDomain( 'bettys-bridal', 'shop.bettys.test' );
    expect( c.urlFor( '/bettys-bridal' ) ).toBe( 'https://shop.bettys.test/' );
  } );
} );
