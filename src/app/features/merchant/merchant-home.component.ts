import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../services/market-api.service';
import { MerchantService } from '../../services/merchant.service';

/**
 * /app: sends the merchant to where they left off (onboarding step, or the
 * dashboard once live). Signed out (browse mode) it stays, and lists the
 * setup steps and the store's pages to look around.
 */
@Component( {
  selector: 'tm-merchant-home',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (browsing) {
      <section class="wrap">
        <div><h1 class="tm-h1">Your store on 16Ahead.</h1><p class="tm-lead">Bring your catalog, and 16Ahead builds the store. Then run it from here.</p></div>
        <div class="cols">
          <div class="tm-card">
            <span class="tm-label">Set up</span>
            <ol>@for (s of setupPages; track s.link) { <li><a [routerLink]="s.link">{{ s.label }}</a><span>{{ s.detail }}</span></li> }</ol>
          </div>
          <div class="tm-card">
            <span class="tm-label">Run it</span>
            <ul>@for (s of storePages; track s.link) { <li><a [routerLink]="s.link">{{ s.label }}</a><span>{{ s.detail }}</span></li> }</ul>
          </div>
        </div>
      </section>
    } @else if (error()) { <p class="tm-error" role="alert">{{ error() }}</p> } @else { <p class="loading">Opening your store…</p> }`,
  styles: [`
    .loading { color: var(--muted); }
    .wrap { display: flex; flex-direction: column; gap: 22px; }
    .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 14px; }
    .tm-card { display: flex; flex-direction: column; gap: 10px; }
    ol, ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
    li { display: flex; flex-direction: column; gap: 2px; font-size: 15px; }
    li a { font-weight: 600; }
    li span { font-size: 13px; color: var(--muted); }
  `],
} )
export class MerchantHomeComponent implements OnInit {
  private readonly merchant = inject( MerchantService );
  private readonly router = inject( Router );
  readonly error = signal( '' );
  readonly browsing = this.merchant.browsing();
  readonly setupPages = [
    { link: '/app/onboarding/import', label: 'Import', detail: 'Bring your catalog from Shopify, a CSV, Printful, photos, or add by hand.' },
    { link: '/app/onboarding/brand', label: 'Brand', detail: 'Your logo and colours.' },
    { link: '/app/onboarding/build', label: 'Build', detail: '16Ahead builds the store from your catalog.' },
    { link: '/app/onboarding/review', label: 'Review', detail: 'Check the preview and fix anything that needs your eye.' },
    { link: '/app/onboarding/get-paid', label: 'Get paid', detail: 'Connect Stripe to take orders.' },
    { link: '/app/onboarding/live', label: 'Live', detail: 'Your store is open.' },
  ];
  readonly storePages = [
    { link: '/app/products', label: 'Products', detail: 'Everything you sell, with stock.' },
    { link: '/app/orders', label: 'Orders', detail: 'Shipping and returns.' },
    { link: '/app/dashboard', label: 'Referrals', detail: 'Shoppers you send to nearby stores, and the ones they send you.' },
    { link: '/app/settings', label: 'Settings', detail: 'Store details, returns, tax, shipping and web address.' },
  ];

  async ngOnInit (): Promise<void> {
    if ( this.browsing ) {
      void this.merchant.load();
      return;
    }
    try {
      const store = await this.merchant.load();
      if ( !store ) await this.router.navigateByUrl( '/app/onboarding/import', { replaceUrl: true } );
      else if ( store.status === 'live' ) await this.router.navigateByUrl( '/app/dashboard', { replaceUrl: true } );
      // Added by hand, nothing added yet: back to Add product.
      else if ( store.source === 'manual' && !store.stats?.productCount ) await this.router.navigateByUrl( '/app/products/new', { replaceUrl: true } );
      else await this.router.navigateByUrl( `/app/onboarding/${ store.onboardingStep || 'import' }`, { replaceUrl: true } );
    } catch ( error ) {
      this.error.set( apiErrorMessage( error, "We couldn't open your store. Refresh to try again." ) );
    }
  }
}
