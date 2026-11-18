import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { BrowseResult, ListingItem, Look, ProductCard, PublicProduct, PublicStore, SearchResult, StoreHome, StoreWithHome } from '../../models/storefront.model';
import { BagService } from '../../services/bag.service';
import { apiErrorMessage } from '../../services/market-api.service';
import { MarketAuthService } from '../../services/market-auth.service';
import { SavedService } from '../../services/saved.service';
import { SeoService } from '../../services/seo.service';
import { StorefrontService } from '../../services/storefront.service';
import { brandStyle } from '../../shared/brand/brand-tuning';
import { IconComponent } from '../../shared/icon/icon.component';
import { shortStoreName, storePossessive } from '../../shared/short-store-name';
import { MoneyPipe } from '../../shared/money.pipe';
import { policySentence } from '../../shared/return-policy';
import { storeAddress } from '../../shared/store-address';
import { InterestDialogComponent } from '../shop/interest-dialog.component';
import { BagDrawerComponent } from './bag-drawer.component';

const TILE_TINTS = ['pink', 'blue', 'cyan', 'violet', 'yellow', 'green'];
const RATINGS = [{ key: 'excellent', label: 'Excellent' }, { key: 'good', label: 'Good' }, { key: 'fair', label: 'Fair' }, { key: 'poor', label: 'Poor' }];

/**
 * A store's Find-style storefront (§2, §3): home, intent search, looks,
 * referral variant C (shared bag), shops from the Find crawl when no network
 * store has it, and the bag. The home page below the
 * search (categories, best sellers, the owner's section, trust strip) is
 * design_handoff_todd_market_storefront; "All products" and "See all" open
 * the browse view.
 */
@Component( {
  selector: 'tm-store',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, RouterLink, IconComponent, MoneyPipe, BagDrawerComponent, InterestDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tt-page', '(window:scroll)': 'onScroll()' },
  templateUrl: './store.component.html',
  styleUrl: './store.component.css',
} )
export class StoreComponent implements OnInit {
  private readonly api = inject( StorefrontService );
  private readonly route = inject( ActivatedRoute );
  private readonly router = inject( Router );
  private readonly seo = inject( SeoService );
  private readonly document = inject( DOCUMENT );
  readonly bag = inject( BagService );
  readonly auth = inject( MarketAuthService );
  readonly saved = inject( SavedService );

  /** Set when the store is shown on its own domain at "/" (RootComponent). */
  readonly slugOverride = input<string | null>( null );
  readonly store = signal<PublicStore | null>( null );
  readonly homeData = signal<StoreHome | null>( null );
  /** "All products", a category, or "See all" (?view=all&category=&sort=). */
  readonly browsing = signal<( BrowseResult & { category: string | null; sort: 'best' | 'new' } ) | null>( null );
  readonly browseLoading = signal( false );
  /** Phones: the hero search has scrolled away, so the compact bar shows. */
  readonly compact = signal( false );
  private readonly heroSearch = viewChild<ElementRef<HTMLElement>>( 'heroSearch' );
  readonly notFound = signal( false );
  readonly query = signal( '' );
  readonly result = signal<SearchResult | null>( null );
  readonly searching = signal( false );
  /** The matches are showing; the AI's looks are still coming. */
  readonly refining = signal( false );
  private searchSeq = 0;
  readonly error = signal( '' );
  readonly rating = signal( '' );
  readonly adding = signal( '' );
  /** "Want to buy it here?" on a crawled shop's item. */
  readonly interestFor = signal<ListingItem | null>( null );
  /** The shopper's pick of results layout; null follows the result (d09 / d10). */
  readonly layoutChoice = signal<'compare' | 'grid' | null>( null );
  readonly layout = computed<'compare' | 'grid'>( () => {
    const choice = this.layoutChoice();
    if ( choice ) return choice;
    const looks = this.result()?.looks || [];
    return looks.length > 1 && looks.slice( 1 ).some( ( l ) => l.betterAt || l.givesUp ) ? 'compare' : 'grid';
  } );
  readonly ratings = RATINGS;

  readonly style = computed( () => brandStyle( this.store()?.brand.tuned ) );
  readonly initial = computed( () => ( this.store()?.name || '' ).charAt( 0 ).toUpperCase() );
  readonly address = computed( () => this.store() ? storeAddress( this.store()!.slug ) : '' );
  readonly asked = computed( () => !!this.result() || this.searching() );
  /** Off the home page: search results or the browse view. */
  readonly inner = computed( () => this.asked() || !!this.browsing() || this.browseLoading() );
  readonly policy = computed( () => policySentence( this.store()?.returns ) );
  readonly platformUrl = environment.PLATFORM_URL;
  readonly signInParams = computed( () => ( { as: 'shopper', store: this.store()?.slug || '', next: '/account' } ) );
  readonly shortName = computed( () => shortStoreName( this.store()?.name || '' ) );
  readonly short = shortStoreName;
  readonly possessive = storePossessive;

  async ngOnInit (): Promise<void> {
    const slug = this.slugOverride() || this.route.snapshot.paramMap.get( 'slug' ) || '';
    // The store's page arrives with its data in it (backend storePage.routes),
    // so it renders at once; the live store then loads behind it and replaces
    // it if anything changed. Without that data, wait for the API as before.
    const embedded = this.takeEmbeddedStore( slug );
    if ( embedded ) {
      this.showStore( embedded );
      void this.api.home( slug ).then( ( live ) => this.showStore( live ), () => undefined );
    } else {
      try {
        this.showStore( await this.api.home( slug ) );
      } catch {
        this.notFound.set( true );
        return;
      }
    }
    void this.saved.load();
    const params = this.route.snapshot.queryParamMap;
    const q = params.get( 'q' );
    const productId = params.get( 'product' );
    if ( q ) await this.ask( q );
    else if ( params.get( 'view' ) === 'all' ) await this.browse( params.get( 'category' ), params.get( 'sort' ) === 'new' ? 'new' : 'best' );
    // A saved item (Account → Saved): find it here.
    else if ( productId ) {
      const product = await this.api.product( slug, productId ).catch( () => null );
      if ( product ) await this.ask( product.title );
    }
  }

  /** The store data embedded in the page for this slug, once (later visits in the app use the API). */
  private takeEmbeddedStore ( slug: string ): StoreWithHome | null {
    const el = this.document.getElementById( 'tm-store-data' );
    if ( !el ) return null;
    el.remove();
    try {
      const data = JSON.parse( el.textContent || '' ) as StoreWithHome;
      return data && data.slug === slug && data.home ? data : null;
    } catch {
      return null;
    }
  }

  private showStore ( { home, ...store }: StoreWithHome ): void {
    // The live copy usually matches the embedded one: skip the re-render.
    if ( JSON.stringify( store ) === JSON.stringify( this.store() ) && JSON.stringify( home ) === JSON.stringify( this.homeData() ) ) return;
    this.store.set( store );
    this.homeData.set( home );
    this.seo.set( { title: `${ store.name } | 16Ahead Store`, description: store.heroLine || `Shop ${ store.name } on 16Ahead Store.`, path: `/${ store.slug }` } );
    this.seo.setJsonLd( 'store-jsonld', {
      '@context': 'https://schema.org', '@type': 'Store', name: store.name, url: `https://${ this.address() }`,
      hasOfferCatalog: { '@type': 'OfferCatalog', url: `https://16ahead.store/feeds/${ store.slug }.json` },
    } );
  }

  tint ( i: number ): string {
    return TILE_TINTS[i % TILE_TINTS.length];
  }

  onScroll (): void {
    const hero = this.heroSearch()?.nativeElement;
    this.compact.set( !!hero && !this.inner() && hero.getBoundingClientRect().bottom < 0 );
  }

  /** A category tile: counts the tap (it ranks the categories), then shows the category. */
  openCategory ( id: string ): void {
    const store = this.store();
    if ( store ) void this.api.tap( store.slug, id ).catch( () => undefined );
    void this.browse( id );
  }

  async browse ( category: string | null = null, sort: 'best' | 'new' = 'best' ): Promise<void> {
    const store = this.store();
    if ( !store ) return;
    this.result.set( null );
    this.error.set( '' );
    this.browseLoading.set( true );
    this.compact.set( false );
    void this.router.navigate( [], { queryParams: { view: 'all', category: category || null, sort: sort === 'new' ? 'new' : null }, replaceUrl: true } );
    try {
      this.browsing.set( { ...await this.api.browse( store.slug, { category, sort } ), category, sort } );
    } catch ( error ) {
      this.browsing.set( null );
      this.error.set( apiErrorMessage( error, "We couldn't load those products. Try again." ) );
    } finally {
      this.browseLoading.set( false );
    }
    if ( typeof window !== 'undefined' ) window.scrollTo( { top: 0 } );
  }

  /** A product card: its product page. */
  openProduct ( card: ProductCard ): void {
    const store = this.store();
    if ( store ) void this.router.navigate( ['/', store.slug, 'products', card.id] );
  }

  isSaved ( card: ProductCard ): boolean {
    return this.saved.has( this.store()?.id || '', card.id );
  }

  /** The heart: saving needs an account, so signed-out shoppers sign in first and come back here. */
  toggleSave ( card: ProductCard ): void {
    const store = this.store();
    if ( !store ) return;
    if ( !this.auth.isSignedIn() ) {
      void this.router.navigate( ['/sign-in'], { queryParams: { as: 'shopper', store: store.slug, next: this.router.url } } );
      return;
    }
    void this.saved.toggle( { storeId: store.id, productId: card.id, title: card.title, storeName: store.name, storeSlug: store.slug, image: card.image } );
  }

  async ask ( text?: string ): Promise<void> {
    const q = ( text ?? this.query() ).trim();
    const store = this.store();
    if ( !q || !store ) return;
    this.query.set( q );
    this.browsing.set( null );
    this.compact.set( false );
    this.searching.set( true );
    this.error.set( '' );
    this.rating.set( '' );
    void this.router.navigate( [], { queryParams: { q }, replaceUrl: true } );
    // The top matches first, then the AI's looks replace them (Ty, 2026-11-18:
    // every search waited about 20 seconds). A newer search wins.
    const seq = ++this.searchSeq;
    this.refining.set( false );
    try {
      const fast = await this.api.search( store.slug, q, false );
      if ( seq !== this.searchSeq ) return;
      this.result.set( fast );
    } catch ( error ) {
      if ( seq !== this.searchSeq ) return;
      this.result.set( null );
      this.error.set( apiErrorMessage( error, 'Search is having trouble. Try again in a moment.' ) );
      this.searching.set( false );
      return;
    }
    this.searching.set( false );
    if ( !this.result()?.looks?.length ) return;
    this.refining.set( true );
    try {
      const full = await this.api.search( store.slug, q );
      if ( seq === this.searchSeq ) this.result.set( full );
    } catch {
      // The matches are already showing.
    } finally {
      if ( seq === this.searchSeq ) this.refining.set( false );
    }
  }

  home (): void {
    this.result.set( null );
    this.browsing.set( null );
    this.query.set( '' );
    this.error.set( '' );
    void this.router.navigate( [], { queryParams: {}, replaceUrl: true } );
  }

  addLook ( look: Look ): void {
    look.items.forEach( ( item ) => this.bag.add( item ) );
  }

  lookInBag ( look: Look ): boolean {
    return look.items.every( ( i ) => this.bag.has( i.id ) );
  }

  /** Best match: the store's pieces plus the network piece, in one tap. */
  async addAll ( look: Look ): Promise<void> {
    this.addLook( look );
    if ( look.referral && !this.bag.has( look.referral.item.id ) ) await this.addReferred( look.referral.item );
  }

  allInBag ( look: Look ): boolean {
    return this.lookInBag( look ) && ( !look.referral || this.bag.has( look.referral.item.id ) );
  }

  pieceWord ( n: number ): string {
    return ['', 'one', 'two', 'three', 'four', 'five', 'six'][n] || String( n );
  }

  pieceCount ( look: Look ): number {
    return look.items.length + ( look.referral ? 1 : 0 );
  }

  /** A network item: record the referral first, so the sale is credited to this store. */
  async addReferred ( product: PublicProduct ): Promise<void> {
    const store = this.store();
    if ( !store || this.adding() ) return;
    this.adding.set( product.id );
    try {
      const { referralId } = await this.api.referral( store.slug, { toStoreId: product.storeId, productId: product.id, sessionId: this.bag.sessionId, query: this.query() } );
      this.bag.add( product, { referralId, referredByStoreId: store.id } );
    } catch ( error ) {
      this.error.set( apiErrorMessage( error, "We couldn't add that item. Try again." ) );
    } finally {
      this.adding.set( '' );
    }
  }

  async rate ( key: string ): Promise<void> {
    const store = this.store();
    if ( !store ) return;
    this.rating.set( key );
    await this.api.feedback( store.slug, key, this.query() ).catch( () => undefined );
  }

  mosaic ( look: Look ): ( { image: string | null; label: string; tint: string } )[] {
    const tints = ['var(--t-pink)', 'var(--t-cyan)', 'var(--surface2)'];
    const items = [...look.items, ...( look.referral ? [look.referral.item] : [] )].slice( 0, 3 );
    return items.map( ( item, i ) => ( { image: item.image, label: item.title, tint: tints[i] } ) );
  }
}
