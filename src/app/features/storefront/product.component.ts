import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { PublicProduct, PublicStore, Variant } from '../../models/storefront.model';
import { BagService } from '../../services/bag.service';
import { SeoService } from '../../services/seo.service';
import { StorefrontService } from '../../services/storefront.service';
import { brandStyle } from '../../shared/brand/brand-tuning';
import { IconComponent } from '../../shared/icon/icon.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { BagDrawerComponent } from './bag-drawer.component';

/**
 * A product page (Store inventory handoff 6c, 6d): photos, a picker per
 * option (sizes as pills; a sold-out size keeps its place with a dashed
 * border and a bell), "Only N left", and the buy button. ?size=10 (any
 * option name) preselects. Back-in-stock alerts on a sold-out size come
 * in phase 2; for now the panel says it's sold out.
 */
@Component( {
  selector: 'tm-product',
  standalone: true,
  imports: [RouterLink, IconComponent, MoneyPipe, BagDrawerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tt-page' },
  templateUrl: './product.component.html',
  styleUrl: './product.component.css',
} )
export class ProductComponent implements OnInit {
  private readonly api = inject( StorefrontService );
  private readonly route = inject( ActivatedRoute );
  private readonly seo = inject( SeoService );
  readonly bag = inject( BagService );

  readonly store = signal<PublicStore | null>( null );
  readonly product = signal<PublicProduct | null>( null );
  readonly notFound = signal( false );
  /** The shopper's pick per option: { size: '10', color: 'Walnut' }. */
  readonly picked = signal<Record<string, string>>( {} );
  readonly photo = signal( 0 );
  readonly added = signal( false );

  readonly style = computed( () => brandStyle( this.store()?.brand.tuned ) );
  readonly initial = computed( () => ( this.store()?.name || '' ).charAt( 0 ).toUpperCase() );
  readonly options = computed( () => ( this.product()?.options || [] ).filter( ( o ) => o.values.length ) );
  readonly images = computed( () => {
    const p = this.product();
    return p ? ( p.images.length ? p.images : p.image ? [p.image] : [] ) : [];
  } );

  /** The variant matching every pick, if there is one. */
  readonly variant = computed<Variant | null>( () => {
    const p = this.product();
    if ( !p ) return null;
    const picks = this.picked();
    if ( !this.options().length ) return p.variants[0] || null;
    return p.variants.find( ( v ) => this.options().every( ( o ) => v.options[o.name] === picks[o.name] ) ) || null;
  } );

  /** Sizes (the option named size, else the first) describe the selection: "size 10". */
  readonly sizeOption = computed( () => this.options().find( ( o ) => o.name === 'size' ) || null );
  readonly selectionLabel = computed( () => {
    const size = this.sizeOption();
    const picks = this.picked();
    if ( size && picks[size.name] ) return `size ${ picks[size.name] }`;
    const v = this.variant();
    return v?.title || '';
  } );

  readonly state = computed<'in' | 'low' | 'backorder' | 'out' | 'none'>( () => {
    const p = this.product();
    const v = this.variant();
    if ( !p ) return 'none';
    if ( !v ) return p.variants.length ? 'none' : ( p.available ? 'in' : 'out' );
    if ( v.backorder ) return 'backorder';
    if ( !v.available ) return 'out';
    return v.left ? 'low' : 'in';
  } );

  readonly priceCents = computed( () => this.variant()?.priceCents ?? this.product()?.priceCents ?? null );
  readonly hasSoldOut = computed( () => this.options().length > 0 && this.product()!.variants.some( ( v ) => !v.available ) );

  /** "Free shipping over $150", else the store's first rate. */
  readonly delivery = computed( () => {
    const s = this.store();
    if ( !s ) return '';
    if ( s.freeShippingOverCents === 0 ) return 'Free shipping';
    const rate = s.shipping?.[0];
    const days = rate && rate.minDays && rate.maxDays ? ` · arrives in ${ rate.minDays }–${ rate.maxDays } days` : '';
    if ( s.freeShippingOverCents ) return `Free shipping over $${ Math.round( s.freeShippingOverCents / 100 ) }${ days }`;
    return rate ? `${ rate.label } shipping $${ ( rate.priceCents / 100 ).toFixed( rate.priceCents % 100 ? 2 : 0 ) }${ days }` : '';
  } );

  async ngOnInit (): Promise<void> {
    const params = this.route.snapshot.paramMap;
    const slug = params.get( 'slug' ) || '';
    const productId = params.get( 'productId' ) || '';
    try {
      const [store, product] = await Promise.all( [this.api.store( slug ), this.api.product( slug, productId )] );
      this.store.set( store );
      this.product.set( product );
      this.picked.set( this.initialPicks( product ) );
      this.seo.set( { title: `${ product.title } | ${ store.name }`, description: product.description.slice( 0, 160 ) || `${ product.title } at ${ store.name } on 16Ahead Store.`, path: `/${ store.slug }/products/${ product.id }` } );
    } catch {
      this.notFound.set( true );
    }
  }

  /** ?size=10&color=Walnut, else the first variant in stock, else the first. */
  private initialPicks ( p: PublicProduct ): Record<string, string> {
    const query = this.route.snapshot.queryParamMap;
    const options = ( p.options || [] ).filter( ( o ) => o.values.length );
    const start = p.variants.find( ( v ) => v.available ) || p.variants[0];
    const picks: Record<string, string> = {};
    for ( const o of options ) {
      const asked = query.get( o.name );
      const match = asked ? o.values.find( ( v ) => v.toLowerCase() === asked.toLowerCase() ) : null;
      picks[o.name] = match || start?.options[o.name] || o.values[0];
    }
    return picks;
  }

  pick ( name: string, value: string ): void {
    this.picked.update( ( p ) => ( { ...p, [name]: value } ) );
    this.added.set( false );
  }

  /** The variant this value would select, with the other picks kept. */
  private variantFor ( name: string, value: string ): Variant | null {
    const picks = { ...this.picked(), [name]: value };
    return this.product()?.variants.find( ( v ) => this.options().every( ( o ) => v.options[o.name] === picks[o.name] ) ) || null;
  }

  /** Sold out with the other picks (hidden sizes aren't in the list at all). */
  isOut ( name: string, value: string ): boolean {
    const v = this.variantFor( name, value );
    return !v || ( !v.available && !v.backorder );
  }

  /** Only sizes (or a product's only option) carry the sold-out bell, as in the design. */
  marksOut ( name: string ): boolean {
    const size = this.sizeOption();
    return size ? size.name === name : this.options().length === 1;
  }

  swatch ( value: string ): string | null {
    if ( typeof CSS === 'undefined' || !CSS.supports ) return null;
    const color = value.toLowerCase().replace( /\s+/g, '' );
    return CSS.supports( 'color', color ) ? color : null;
  }

  label ( name: string ): string {
    return name === 'colour' ? 'Colour' : name.charAt( 0 ).toUpperCase() + name.slice( 1 );
  }

  addToBag (): void {
    const p = this.product();
    if ( !p || this.state() === 'out' || this.state() === 'none' ) return;
    this.bag.add( p, { variantId: this.variant()?.id || null } );
    this.added.set( true );
    this.bag.open.set( true );
  }

  shipDate ( iso: string ): string {
    const d = new Date( `${ iso }T12:00:00` );
    return Number.isNaN( d.getTime() ) ? '' : d.toLocaleDateString( 'en-US', { month: 'short', day: 'numeric' } );
  }
}
