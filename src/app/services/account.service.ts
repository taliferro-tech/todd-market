import { Injectable, computed, inject } from '@angular/core';

import { Address, QuotePart } from './checkout.service';
import { browseRefusal } from './browse-mode';
import { MarketApiService } from './market-api.service';
import { MarketAuthService } from './market-auth.service';

export interface SavedItem { storeId: string; productId: string; title: string; storeName: string; storeSlug: string; image: string | null }
export interface AccountOrder { id: string; paidAt: number; totalCents: number; stores: string[]; status: 'in_progress' | 'delivered' | 'refunded'; image: string | null }
export interface ReturnableItem { productId: string; variantId: string | null; title: string; variantTitle: string; priceCents: number; quantity: number; image: string | null; swaps: { variantId: string; title: string }[] }
export interface OrderDetailPart extends QuotePart {
  status: string; fulfillment: { status: string; tracking: string | null; deliveredAt: number | null } | null; refundedCents: number;
  returnableUntil: number | null; returnableItems: ReturnableItem[]; returnPolicy: string; returnShippingCents: number;
  storeLocation: string; pickup: boolean; referred: boolean;
}
export interface OrderDetail { id: string; status: string; paidAt: number; totalCents: number; card: { brand: string; last4: string } | null; address: Address; email: string; parts: OrderDetailPart[]; reasons: string[] }
export interface StartedReturn { id: string; refundCents: number; sendBack: 'label' | 'dropoff'; refundMethod: 'original' | 'exchange'; exchange: { title: string; toTitle: string }[] | null; label: { labelUrl: string; trackingNumber: string; carrier: string } | null; storeName: string; card: { brand: string; last4: string } | null }

/**
 * The signed-in shopper's account. Signed out (browse mode) the pages show
 * empty lists without calling the backend, and every save is refused.
 */
@Injectable( { providedIn: 'root' } )
export class AccountService {
  private readonly api = inject( MarketApiService );
  private readonly auth = inject( MarketAuthService );
  readonly browsing = computed( () => this.auth.user() === null );

  orders (): Promise<{ orders: AccountOrder[] }> {
    return this.browsing() ? Promise.resolve( { orders: [] } ) : this.api.get( '/account/orders' );
  }
  order ( id: string ): Promise<OrderDetail> {
    return this.browsing() ? browseRefusal( "You're in browse mode. Sign in to see this order." ) : this.api.get( `/account/orders/${ encodeURIComponent( id ) }` );
  }
  startReturn ( orderId: string, body: unknown ): Promise<StartedReturn> {
    return this.browsing() ? browseRefusal() : this.api.post( `/account/orders/${ encodeURIComponent( orderId ) }/returns`, body );
  }
  profile (): Promise<{ email: string; name: string; addresses: Address[]; saved: SavedItem[] }> {
    return this.browsing() ? Promise.resolve( { email: '', name: '', addresses: [], saved: [] } ) : this.api.get( '/account/profile' );
  }
  saveSaved ( saved: SavedItem[] ): Promise<{ saved: SavedItem[] }> {
    return this.browsing() ? browseRefusal() : this.api.put( '/account/saved', { saved } );
  }
  saveAddresses ( addresses: Address[] ): Promise<{ addresses: Address[] }> {
    return this.browsing() ? browseRefusal() : this.api.put( '/account/addresses', { addresses } );
  }
  paymentMethods (): Promise<{ methods: { id: string; brand: string; last4: string; expMonth: number; expYear: number }[] }> {
    return this.browsing() ? Promise.resolve( { methods: [] } ) : this.api.get( '/account/payment-methods' );
  }
  removePaymentMethod ( id: string ): Promise<unknown> {
    return this.browsing() ? browseRefusal() : this.api.delete( `/account/payment-methods/${ encodeURIComponent( id ) }` );
  }
}
