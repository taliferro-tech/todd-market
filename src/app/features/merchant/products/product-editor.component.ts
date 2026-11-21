import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../../services/market-api.service';
import { CollectionRef, EditorProduct, MerchantService, ProductOption, ProductSave, SoldOutRule } from '../../../services/merchant.service';
import { IconComponent } from '../../../shared/icon/icon.component';
import { AutofocusDirective } from '../../../shared/autofocus.directive';
import { MoneyPipe } from '../../../shared/money.pipe';
import { shrinkPhoto } from '../../../shared/shrink-photo';

const PHOTO_SLOTS = 5;

interface Photo { key: string; url: string | null; preview: string | null; status: 'uploading' | 'done' | 'failed'; error?: string }
interface VariantRow { key: string; options: Record<string, string>; title: string }

/** The key that matches a variant across edits: its option values in order. */
function keyOf ( options: Record<string, string>, names: string[] ): string {
  return names.map( ( n ) => String( options[n] ?? '' ).toLowerCase() ).join( '\u0001' );
}

/** Dollars typed by the merchant ("$189", "189.00") → cents, or null. */
function toCents ( text: string ): number | null {
  const clean = String( text || '' ).replace( /[$,\s]/g, '' );
  if ( !clean ) return null;
  const n = Number( clean );
  return Number.isFinite( n ) ? Math.round( n * 100 ) : NaN;
}

function dollars ( cents: number | null ): string {
  return cents == null ? '' : ( cents / 100 ).toFixed( 2 );
}

/**
 * Add product / Edit product (Store inventory handoff 6b): photos, details,
 * options (every size × colour is a variant), stock per variant, what a
 * sold-out size does, and a live shopper preview. Works for products added
 * by hand and imported ones.
 */
@Component( {
  selector: 'tm-product-editor',
  standalone: true,
  imports: [FormsModule, RouterLink, AutofocusDirective, IconComponent, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-editor.component.html',
  styleUrl: './product-editor.component.css',
} )
export class ProductEditorComponent implements OnInit {
  readonly merchant = inject( MerchantService );
  /** Signed out: saving is off (the shell explains browse mode). */
  readonly browsing = this.merchant.browsing;
  private readonly route = inject( ActivatedRoute );
  private readonly router = inject( Router );

  readonly id = signal<string | null>( null );
  readonly loaded = signal<EditorProduct | null>( null );
  readonly loading = signal( true );
  readonly saving = signal<'' | 'draft' | 'publish' | 'delete'>( '' );
  readonly error = signal( '' );
  readonly invalid = signal<Record<string, string>>( {} );
  readonly collections = signal<CollectionRef[]>( [] );

  readonly title = signal( '' );
  readonly description = signal( '' );
  readonly price = signal( '' );
  readonly compareAt = signal( '' );
  readonly collectionId = signal( '' );
  readonly newCollection = signal( '' );
  readonly photos = signal<Photo[]>( [] );
  readonly options = signal<ProductOption[]>( [{ name: 'size', values: [] }, { name: 'color', values: [] }] );
  readonly stock = signal<Record<string, string>>( {} );
  /** Stock as loaded, so a save sends a change and doesn't undo sales made meanwhile. */
  private stockWas: Record<string, number> = {};
  readonly trackStock = signal( true );
  readonly lowStockAt = signal( '3' );
  readonly soldOutRule = signal<SoldOutRule>( 'notify' );
  readonly shipsBy = signal( '' );
  readonly describing = signal( false );
  /** The option a value is being typed for, and the text. */
  readonly addingTo = signal<string | null>( null );
  readonly addText = signal( '' );
  readonly addingOption = signal( false );
  readonly optionName = signal( '' );
  readonly dragging = signal( false );

  readonly slots = computed( () => {
    const list = this.photos();
    return Array.from( { length: Math.max( PHOTO_SLOTS, list.length ) }, ( _, i ) => list[i] || null );
  } );
  readonly uploading = computed( () => this.photos().some( ( p ) => p.status === 'uploading' ) );
  readonly photoUrls = computed( () => this.photos().filter( ( p ) => p.status === 'done' && p.url ).map( ( p ) => p.url! ) );
  readonly mainPhoto = computed( () => {
    const first = this.photos().find( ( p ) => p.status !== 'failed' );
    return first ? first.url || first.preview : null;
  } );

  /** Options that have values: these make the variants. */
  readonly activeOptions = computed( () => this.options().filter( ( o ) => o.values.length ) );
  readonly names = computed( () => this.activeOptions().map( ( o ) => o.name ) );
  readonly variants = computed<VariantRow[]>( () => {
    const opts = this.activeOptions();
    const combos = opts.reduce<Record<string, string>[]>( ( acc, o ) => acc.flatMap( ( c ) => o.values.map( ( v ) => ( { ...c, [o.name]: v } ) ) ), [{}] );
    const names = opts.map( ( o ) => o.name );
    return combos.map( ( c ) => ( { key: keyOf( c, names ), options: c, title: names.map( ( n ) => c[n] ).join( ' / ' ) } ) );
  } );

  /** Inventory panels: one per colour when there's a colour and another option, else one. */
  readonly panels = computed( () => {
    const opts = this.activeOptions();
    const color = opts.find( ( o ) => o.name === 'color' || o.name === 'colour' );
    const rest = opts.filter( ( o ) => o !== color );
    const label = ( v: VariantRow ) => rest.length ? rest.map( ( o ) => ( rest.length === 1 && o.name === 'size' ? 'Size ' : '' ) + v.options[o.name] ).join( ' / ' ) : v.title || 'Stock';
    if ( color && rest.length ) {
      return color.values.map( ( value ) => {
        const rows = this.variants().filter( ( v ) => v.options[color.name] === value );
        return { title: value, swatch: value, rows: rows.map( ( v ) => ( { ...v, label: label( v ) } ) ), total: rows.reduce( ( n, v ) => n + this.units( v.key ), 0 ) };
      } );
    }
    const rows = this.variants();
    return [{ title: opts.length ? opts.map( ( o ) => this.optionLabel( o.name ) ).join( ' × ' ) : 'Stock', swatch: null, rows: rows.map( ( v ) => ( { ...v, label: opts.length ? label( v ) : 'One size' } ) ), total: rows.reduce( ( n, v ) => n + this.units( v.key ), 0 ) }];
  } );

  readonly totalUnits = computed( () => this.variants().reduce( ( n, v ) => n + this.units( v.key ), 0 ) );
  readonly outCount = computed( () => this.variants().filter( ( v ) => this.units( v.key ) === 0 ).length );
  readonly low = computed( () => Math.max( 0, Math.floor( Number( this.lowStockAt() ) || 0 ) ) );

  /** The preview's status tag. */
  readonly previewStatus = computed( () => {
    if ( !this.trackStock() ) return { label: 'In stock', tint: 'tm-tint-green' };
    const total = this.variants().length;
    const out = this.outCount();
    if ( out === total ) return { label: this.soldOutRule() === 'backorder' ? 'On backorder' : 'Sold out', tint: 'tm-tint-pink' };
    if ( out ) return { label: `In stock · ${ out } ${ this.variantWord( out ) } sold out`, tint: 'tm-tint-violet' };
    if ( this.variants().some( ( v ) => this.units( v.key ) <= this.low() ) ) return { label: 'Low stock', tint: 'tm-tint-yellow' };
    return { label: 'In stock', tint: 'tm-tint-green' };
  } );

  readonly previewNote = computed( () => {
    if ( !this.trackStock() ) return 'Stock isn\'t tracked, so it never sells out.';
    const n = this.variants().length;
    const lead = `${ this.totalUnits() } ${ this.totalUnits() === 1 ? 'unit' : 'units' } across ${ n } ${ n === 1 ? 'variant' : 'variants' }.`;
    const rule = { notify: 'Sold-out sizes stay on the page, marked sold out.', hide: 'Sold-out sizes are hidden until you restock.', backorder: `Sold-out sizes keep selling${ this.shipsBy() ? ' and ship by ' + this.shipDate() : '' }.` }[this.soldOutRule()];
    return `${ lead } ${ rule }`;
  } );

  readonly isNew = computed( () => !this.id() );
  /** Shown in the store now (not a draft or hidden). */
  readonly isLive = computed( () => !!this.loaded() && !this.loaded()!.hidden );
  readonly storeName = computed( () => this.merchant.store()?.name || 'Your store' );
  readonly priceCents = computed( () => {
    const c = toCents( this.price() );
    return c == null || Number.isNaN( c ) ? null : c;
  } );
  readonly compareAtCents = computed( () => {
    const c = toCents( this.compareAt() );
    return c == null || Number.isNaN( c ) || this.priceCents() == null || c <= this.priceCents()! ? null : c;
  } );

  async ngOnInit (): Promise<void> {
    void this.merchant.current().catch( () => null );
    const id = this.route.snapshot.paramMap.get( 'id' );
    try {
      if ( id ) {
        this.id.set( id );
        const { product, collections } = await this.merchant.product( id );
        this.collections.set( collections );
        this.fill( product );
      } else {
        const { collections } = await this.merchant.products();
        this.collections.set( collections );
      }
    } catch ( error ) {
      this.error.set( apiErrorMessage( error, "We couldn't open that product. Go back and try again." ) );
    } finally {
      this.loading.set( false );
    }
  }

  private fill ( p: EditorProduct ): void {
    this.loaded.set( p );
    this.title.set( p.title );
    this.description.set( p.description );
    this.price.set( dollars( p.priceCents ) );
    this.compareAt.set( dollars( p.compareAtCents ) );
    this.collectionId.set( p.collectionIds[0] || '' );
    this.photos.set( p.images.map( ( url, i ) => ( { key: `saved-${ i }`, url, preview: null, status: 'done' } ) ) );
    this.options.set( p.options.length ? p.options.map( ( o ) => ( { name: o.name, values: [...o.values] } ) ) : [] );
    this.trackStock.set( p.trackStock );
    this.lowStockAt.set( String( p.lowStockAt ) );
    this.soldOutRule.set( p.soldOutRule );
    this.shipsBy.set( p.shipsBy || '' );
    const names = p.options.map( ( o ) => o.name );
    const stock: Record<string, string> = {};
    this.stockWas = {};
    for ( const v of p.variants ) {
      const key = keyOf( v.options, names );
      stock[key] = v.stock == null ? '' : String( v.stock );
      if ( p.trackStock && v.stock != null ) this.stockWas[key] = v.stock;
    }
    this.stock.set( stock );
  }

  // Stock

  units ( key: string ): number {
    const n = Number( this.stock()[key] ?? 0 );
    return Number.isInteger( n ) && n > 0 ? n : 0;
  }

  setStock ( key: string, value: string ): void {
    this.stock.update( ( s ) => ( { ...s, [key]: value } ) );
    this.clearInvalid( 'stock' );
  }

  stockTag ( key: string ): { label: string; tint: string } {
    const n = this.units( key );
    if ( !n ) return { label: 'Sold out', tint: 'tm-tint-pink' };
    if ( n <= this.low() ) return { label: 'Low', tint: 'tm-tint-yellow' };
    return { label: 'In stock', tint: 'tm-tint-green' };
  }

  stockInvalid ( key: string ): boolean {
    const raw = this.stock()[key];
    if ( raw == null || raw === '' ) return false;
    const n = Number( raw );
    return !Number.isInteger( n ) || n < 0;
  }

  // Options

  optionLabel ( name: string ): string {
    return name === 'colour' ? 'Colour' : name.charAt( 0 ).toUpperCase() + name.slice( 1 );
  }

  /** A swatch for colour names the browser knows ("Black", "Navy"); none for "Walnut". */
  swatch ( value: string ): string | null {
    if ( typeof CSS === 'undefined' || !CSS.supports ) return null;
    const color = value.toLowerCase().replace( /\s+/g, '' );
    return CSS.supports( 'color', color ) ? color : null;
  }

  nameOf ( o: ProductOption ): string {
    return o.name;
  }

  isColor ( name: string ): boolean {
    return name === 'color' || name === 'colour';
  }

  startAdding ( name: string ): void {
    this.addingTo.set( name );
    this.addText.set( '' );
  }

  /** Enter adds; commas add several ("8, 9, 10"). */
  addValues ( name: string ): void {
    const values = this.addText().split( ',' ).map( ( v ) => v.replace( /\s+/g, ' ' ).trim().slice( 0, 30 ) ).filter( Boolean );
    if ( values.length ) {
      this.options.update( ( list ) => list.map( ( o ) => o.name !== name ? o : { ...o, values: [...o.values, ...values.filter( ( v ) => !o.values.some( ( x ) => x.toLowerCase() === v.toLowerCase() ) )] } ) );
    }
    this.addText.set( '' );
    this.addingTo.set( null );
  }

  removeValue ( name: string, value: string ): void {
    this.options.update( ( list ) => list.map( ( o ) => o.name !== name ? o : { ...o, values: o.values.filter( ( v ) => v !== value ) } ) );
  }

  removeOption ( name: string ): void {
    this.options.update( ( list ) => list.filter( ( o ) => o.name !== name ) );
  }

  addOption (): void {
    const name = this.optionName().replace( /\s+/g, ' ' ).trim().toLowerCase().slice( 0, 20 );
    if ( name && !this.options().some( ( o ) => o.name === name ) && this.options().length < 3 ) {
      this.options.update( ( list ) => [...list, { name, values: [] }] );
      this.startAdding( name );
    }
    this.optionName.set( '' );
    this.addingOption.set( false );
  }

  // Photos

  onPhotoInput ( event: Event ): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from( input.files || [] );
    input.value = '';
    void this.addPhotos( files );
  }

  onDrop ( event: DragEvent ): void {
    event.preventDefault();
    this.dragging.set( false );
    void this.addPhotos( Array.from( event.dataTransfer?.files || [] ).filter( ( f ) => f.type.startsWith( 'image/' ) ) );
  }

  async addPhotos ( files: File[] ): Promise<void> {
    const room = 8 - this.photos().length;
    const queue = files.slice( 0, Math.max( 0, room ) ).map( ( file ) => ( { file, key: `${ Date.now() }-${ Math.random().toString( 36 ).slice( 2 ) }` } ) );
    if ( files.length > queue.length ) this.error.set( 'Up to 8 photos.' );
    this.photos.update( ( list ) => [...list, ...queue.map( ( q ) => ( { key: q.key, url: null, preview: null, status: 'uploading' as const } ) )] );
    this.clearInvalid( 'photos' );
    for ( const { file, key } of queue ) {
      const patch = ( change: Partial<Photo> ) => this.photos.update( ( list ) => list.map( ( p ) => p.key === key ? { ...p, ...change } : p ) );
      try {
        const dataUrl = await shrinkPhoto( file );
        patch( { preview: dataUrl } );
        const { url } = await this.merchant.productPhoto( dataUrl );
        patch( { url, status: 'done' } );
      } catch ( error ) {
        patch( { status: 'failed', error: error instanceof Error && !( 'status' in error ) ? error.message : apiErrorMessage( error, 'Upload failed' ) } );
      }
    }
  }

  removePhoto ( key: string ): void {
    this.photos.update( ( list ) => list.filter( ( p ) => p.key !== key ) );
  }

  makeMain ( key: string ): void {
    this.photos.update( ( list ) => [...list.filter( ( p ) => p.key === key ), ...list.filter( ( p ) => p.key !== key )] );
  }

  async writeDescription (): Promise<void> {
    if ( !this.photoUrls().length ) return;
    this.describing.set( true );
    this.error.set( '' );
    try {
      const { description } = await this.merchant.describeProduct( this.photoUrls(), this.title() );
      this.description.set( description );
    } catch ( error ) {
      this.error.set( apiErrorMessage( error, "We couldn't write it right now. Try again, or write your own." ) );
    } finally {
      this.describing.set( false );
    }
  }

  // Saving

  private clearInvalid ( field: string ): void {
    if ( this.invalid()[field] ) this.invalid.update( ( m ) => { const { [field]: _, ...rest } = m; return rest; } );
  }

  /** Name, price and a photo to publish; a name for a draft; stock must be whole numbers. */
  private validate ( publish: boolean ): Record<string, string> {
    const errors: Record<string, string> = {};
    if ( !this.title().trim() ) errors['title'] = 'Give it a name.';
    const price = toCents( this.price() );
    if ( Number.isNaN( price ) || ( price != null && ( price < 50 || price > 10000000 ) ) ) errors['price'] = 'Enter a price between $0.50 and $100,000.';
    else if ( publish && price == null ) errors['price'] = 'Add a price before you publish.';
    if ( Number.isNaN( toCents( this.compareAt() ) ) ) errors['compareAt'] = 'Enter a price, or leave it empty.';
    if ( publish && !this.photoUrls().length && ( this.isNew() || !this.isLive() ) ) errors['photos'] = 'Add at least one photo before you publish.';
    if ( this.trackStock() && this.variants().some( ( v ) => this.stockInvalid( v.key ) ) ) errors['stock'] = 'Stock must be a whole number, 0 or more.';
    if ( this.collectionId() === '__new' && !this.newCollection().trim() ) errors['collection'] = 'Name the new collection.';
    if ( this.soldOutRule() === 'backorder' && this.shipsBy() && Number.isNaN( Date.parse( this.shipsBy() ) ) ) errors['shipsBy'] = 'Enter a date.';
    return errors;
  }

  private body ( publish: boolean | undefined ): ProductSave {
    const names = this.names();
    return {
      title: this.title().trim(),
      description: this.description().trim(),
      priceCents: toCents( this.price() ),
      compareAtCents: this.compareAtCents(),
      ...( this.collectionId() === '__new' ? { newCollection: this.newCollection().trim() } : { collectionId: this.collectionId() || null } ),
      images: this.photoUrls(),
      options: this.activeOptions(),
      variants: this.variants().map( ( v ) => ( { options: v.options, stock: this.units( v.key ), stockWas: this.stockWas[keyOf( v.options, names )] ?? null } ) ),
      trackStock: this.trackStock(),
      lowStockAt: this.low(),
      soldOutRule: this.soldOutRule(),
      shipsBy: this.soldOutRule() === 'backorder' && this.shipsBy() ? this.shipsBy() : null,
      publish,
    };
  }

  async save ( mode: 'draft' | 'publish' ): Promise<void> {
    const publish = mode === 'publish';
    const errors = this.validate( publish );
    this.invalid.set( errors );
    if ( Object.keys( errors ).length ) {
      this.error.set( Object.values( errors )[0] );
      return;
    }
    if ( this.uploading() ) {
      this.error.set( 'Wait for the photos to finish uploading.' );
      return;
    }
    this.saving.set( mode );
    this.error.set( '' );
    try {
      const body = this.body( publish );
      const id = this.id();
      const saved = id ? await this.merchant.saveProduct( id, body ) : await this.merchant.createProduct( body );
      // The first product of a store added by hand counts toward the build.
      if ( !id ) await this.merchant.load().catch( () => null );
      await this.router.navigateByUrl( '/app/products', { state: { saved: saved.id } } );
    } catch ( error ) {
      this.error.set( apiErrorMessage( error, "We couldn't save it. Check it and try again." ) );
    } finally {
      this.saving.set( '' );
    }
  }

  async remove (): Promise<void> {
    const id = this.id();
    if ( !id || !confirm( `Delete ${ this.title() || 'this product' }? It comes off your store. Orders that had it keep their copy.` ) ) return;
    this.saving.set( 'delete' );
    try {
      await this.merchant.deleteProduct( id );
      await this.router.navigateByUrl( '/app/products' );
    } catch ( error ) {
      this.error.set( apiErrorMessage( error, "We couldn't delete it. Try again." ) );
    } finally {
      this.saving.set( '' );
    }
  }

  variantWord ( n: number ): string {
    return this.names().includes( 'size' ) ? ( n === 1 ? 'size' : 'sizes' ) : ( n === 1 ? 'variant' : 'variants' );
  }

  shipDate (): string {
    const d = new Date( `${ this.shipsBy() }T12:00:00` );
    return Number.isNaN( d.getTime() ) ? '' : d.toLocaleDateString( 'en-US', { month: 'short', day: 'numeric' } );
  }
}
