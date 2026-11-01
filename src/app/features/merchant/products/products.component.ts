import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../../services/market-api.service';
import { MerchantService, ProductRow, StockStatus } from '../../../services/merchant.service';
import { IconComponent } from '../../../shared/icon/icon.component';
import { MoneyPipe } from '../../../shared/money.pipe';

type Filter = 'all' | 'low' | 'some-out' | 'out' | 'drafts';

const STATUS: Record<StockStatus, { label: string; tint: string }> = {
  in: { label: 'In stock', tint: 'tm-tint-green' },
  low: { label: 'Low stock', tint: 'tm-tint-yellow' },
  'some-out': { label: 'Some sizes out', tint: 'tm-tint-violet' },
  out: { label: 'Sold out', tint: 'tm-tint-pink' },
  // Untracked never sells out.
  untracked: { label: 'In stock', tint: 'tm-tint-green' },
};

/**
 * Products (Store inventory handoff 6a): every product with its stock,
 * rolled-up status and a filter per status. Import and Add product sit
 * side by side. The "Shoppers waiting" column and filter come with
 * back-in-stock alerts (phase 2).
 */
@Component( {
  selector: 'tm-products',
  standalone: true,
  imports: [RouterLink, IconComponent, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="wrap">
      @if (setup(); as s) {
        <div class="setup tm-card">
          <div><strong>{{ s.title }}</strong><span class="muted">{{ s.detail }}</span></div>
          @if (s.cta) { <a class="tm-btn tm-btn--primary" [routerLink]="s.cta.link">{{ s.cta.label }}</a> }
        </div>
      }
      <div class="head">
        <div><h1>Products</h1><p class="muted">{{ subline() }}</p></div>
        <div class="actions">
          <a class="tm-btn" [routerLink]="importLink()"><tm-icon name="upload" [size]="18" />Import</a>
          <a class="tm-btn tm-btn--primary" routerLink="/app/products/new"><tm-icon name="plus" [size]="18" />Add product</a>
        </div>
      </div>

      @if (loading()) { <p class="muted">Loading your products…</p> }
      @else if (error()) { <p class="tm-error" role="alert">{{ error() }}</p> }
      @else if (!rows().length) {
        <div class="empty tm-card">
          <strong>No products yet</strong>
          <span class="muted">Add one by hand, with its photos, sizes and how many you have, or import your catalog.</span>
          <a class="tm-btn tm-btn--primary" routerLink="/app/products/new"><tm-icon name="plus" [size]="18" />Add product</a>
        </div>
      } @else {
        <div class="filters" role="group" aria-label="Show">
          @for (f of filters(); track f.key) {
            <button type="button" [class.on]="filter() === f.key" [attr.aria-pressed]="filter() === f.key" (click)="filter.set(f.key)">{{ f.label }}<span class="count">{{ f.count }}</span></button>
          }
        </div>
        <div class="table" role="table" aria-label="Products">
          <div class="row th" role="row">
            <span role="columnheader"></span><span role="columnheader">Product</span><span role="columnheader">Price</span>
            <span role="columnheader">Stock</span><span role="columnheader">Status</span><span role="columnheader"></span>
          </div>
          @for (p of shown(); track p.id) {
            <div class="row" role="row">
              <a class="thumb" role="cell" [routerLink]="['/app/products', p.id]" [attr.aria-label]="'Edit ' + p.title">@if (p.image) { <img [src]="p.image" alt="" loading="lazy"> } @else { <tm-icon name="image" [size]="20" /> }</a>
              <span class="name" role="cell"><a [routerLink]="['/app/products', p.id]"><strong>{{ p.title }}</strong></a><span class="muted">{{ p.summary }}</span></span>
              <span class="price" role="cell">{{ p.priceCents == null ? 'No price' : (p.priceCents | money) }}</span>
              <span class="stock" role="cell">
                @if (p.stock.units != null) {
                  <span><strong>{{ p.stock.units }} {{ p.stock.units === 1 ? 'unit' : 'units' }}</strong> <span class="muted">{{ note(p) }}</span></span>
                  <span class="bar"><span [class]="'fill ' + p.stock.status" [style.width.%]="barWidth(p)"></span></span>
                } @else { <span class="muted">Not tracked</span> }
              </span>
              <span class="status" role="cell">
                @if (p.draft) { <span class="tm-tag">Draft</span> }
                @else if (p.hidden) { <span class="tm-tag">Hidden</span> }
                @else { <span class="tm-tag" [class]="statusOf(p).tint">{{ statusOf(p).label }}</span> }
              </span>
              <span class="act" role="cell"><a class="tm-btn" [routerLink]="['/app/products', p.id]">Edit</a></span>
            </div>
          } @empty { <p class="muted none">Nothing here.</p> }
        </div>
      }
    </section>`,
  styles: [`
    .wrap { display: flex; flex-direction: column; gap: 22px; }
    .setup { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; justify-content: space-between; }
    .setup div { display: flex; flex-direction: column; gap: 4px; }
    .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    h1 { font-size: 40px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.05; margin: 0 0 4px; }
    .muted { color: var(--muted); }
    .actions { display: flex; gap: 10px; }
    .empty { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
    .filters { display: flex; gap: 8px; flex-wrap: wrap; }
    .filters button { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 8px 0 14px; border: 0; border-radius: 999px;
      background: var(--surface); color: var(--text); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
    .filters button.on { background: var(--text); color: var(--bg); }
    .count { min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px; display: inline-grid; place-items: center; font-size: 12px; background: var(--bg); color: var(--text); }
    .table { display: flex; flex-direction: column; }
    .row { display: grid; grid-template-columns: 56px 2.2fr 90px 1.6fr 150px 110px; gap: 16px; align-items: center; padding: 12px 0; border-top: 1px solid var(--surface2); }
    .row.th { border-top: 0; padding-top: 0; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    .thumb { width: 56px; height: 56px; border-radius: 16px; background: var(--surface); display: grid; place-items: center; overflow: hidden; color: var(--muted); }
    .thumb img { width: 100%; height: 100%; object-fit: cover; }
    .name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .name a { color: var(--text); }
    .name .muted { font-size: 13px; }
    .price { font-weight: 700; }
    .stock { display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
    .stock strong + .muted { margin-left: 4px; }
    .bar { height: 6px; border-radius: 3px; background: var(--surface2); overflow: hidden; }
    .fill { display: block; height: 100%; border-radius: 3px; background: var(--t-green-fg); }
    .fill.low { background: var(--t-yellow-fg); }
    .fill.out { background: var(--t-pink-fg); }
    .act { justify-self: end; }
    .act .tm-btn { height: 38px; min-width: 96px; }
    .none { padding: 16px 0; }
    @media (max-width: 860px) {
      .row.th { display: none; }
      .row { grid-template-columns: 56px 1fr auto; grid-template-areas: "thumb name act" "thumb stock status"; row-gap: 8px; }
      .thumb { grid-area: thumb; align-self: start; }
      .name { grid-area: name; }
      .price { display: none; }
      .stock { grid-area: stock; }
      .status { grid-area: status; justify-self: end; }
      .act { grid-area: act; }
      .act .tm-btn { min-width: 0; }
    }
  `],
} )
export class ProductsComponent implements OnInit {
  readonly merchant = inject( MerchantService );
  readonly rows = signal<ProductRow[]>( [] );
  readonly loading = signal( true );
  readonly error = signal( '' );
  readonly filter = signal<Filter>( 'all' );

  readonly filters = computed( () => {
    const rows = this.rows();
    const count = ( status: StockStatus ) => rows.filter( ( r ) => !r.draft && r.stock.status === status ).length;
    const drafts = rows.filter( ( r ) => r.draft ).length;
    return [
      { key: 'all' as Filter, label: 'All', count: rows.length },
      { key: 'low' as Filter, label: 'Low stock', count: count( 'low' ) },
      { key: 'some-out' as Filter, label: 'Some sizes out', count: count( 'some-out' ) },
      { key: 'out' as Filter, label: 'Sold out', count: count( 'out' ) },
      ...( drafts ? [{ key: 'drafts' as Filter, label: 'Drafts', count: drafts }] : [] ),
    ];
  } );

  readonly shown = computed( () => {
    const f = this.filter();
    if ( f === 'all' ) return this.rows();
    if ( f === 'drafts' ) return this.rows().filter( ( r ) => r.draft );
    return this.rows().filter( ( r ) => !r.draft && r.stock.status === f );
  } );

  readonly subline = computed( () => {
    const rows = this.rows();
    const out = rows.filter( ( r ) => !r.draft && ( r.stock.status === 'out' || r.stock.status === 'some-out' ) ).length;
    return [`${ rows.length } product${ rows.length === 1 ? '' : 's' }`, out ? `${ out } with sizes sold out` : ''].filter( Boolean ).join( ' · ' );
  } );

  private readonly maxUnits = computed( () => Math.max( 1, ...this.rows().map( ( r ) => r.stock.units || 0 ) ) );

  /** Before the store is live: where this page sits in setup. */
  readonly setup = computed( () => {
    const store = this.merchant.store();
    if ( !store || store.status === 'live' ) return null;
    const count = this.rows().filter( ( r ) => !r.draft ).length;
    if ( store.onboardingStep === 'import' || store.onboardingStep === 'brand' ) {
      return count
        ? { title: 'Your store isn\'t live yet', detail: 'Add as many products as you like, then set up your brand.', cta: { label: 'Next: your brand', link: '/app/onboarding/brand' } }
        : { title: 'Your store isn\'t live yet', detail: 'Add your first product to keep going.', cta: null };
    }
    return { title: 'Your store isn\'t live yet', detail: 'New products show up when you go live.', cta: { label: 'Back to setup', link: '/app' } };
  } );

  /** A draft store imports from onboarding; a live one adds from Settings → Products. */
  readonly importLink = computed( () => this.merchant.store()?.status === 'live' ? '/app/settings/products' : '/app/onboarding/import' );

  async ngOnInit (): Promise<void> {
    void this.merchant.current().catch( () => null );
    try {
      const { products } = await this.merchant.products();
      this.rows.set( products );
    } catch ( error ) {
      this.error.set( apiErrorMessage( error, "We couldn't load your products. Refresh to try again." ) );
    } finally {
      this.loading.set( false );
    }
  }

  statusOf ( p: ProductRow ): { label: string; tint: string } {
    return STATUS[p.stock.status];
  }

  barWidth ( p: ProductRow ): number {
    return Math.round( ( p.stock.units || 0 ) / this.maxUnits() * 100 );
  }

  /** "Walnut 10 and 11 out", "12 out", "all sizes out", "low in 2 sizes". */
  note ( p: ProductRow ): string {
    const { status, outTitles, lowTitles } = p.stock;
    if ( status === 'out' ) return p.variantCount > 1 ? 'all sizes out' : 'sold out';
    if ( status === 'low' ) return p.variantCount > 1 ? `low in ${ lowTitles.length } size${ lowTitles.length === 1 ? '' : 's' }` : '';
    if ( status !== 'some-out' ) return '';
    const groups = new Map<string, string[]>();
    for ( const title of outTitles ) {
      const parts = title.split( ' / ' );
      const group = parts.length > 1 ? parts.slice( 1 ).join( ' / ' ) : '';
      groups.set( group, [...( groups.get( group ) || [] ), parts[0]] );
    }
    if ( groups.size > 2 ) return `${ outTitles.length } out`;
    return [...groups.entries()].map( ( [group, list] ) => `${ group ? group + ' ' : '' }${ list.length > 1 ? list.slice( 0, -1 ).join( ', ' ) + ' and ' + list[list.length - 1] : list[0] }` ).join( '; ' ) + ' out';
  }
}
