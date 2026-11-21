import { BuildJob, MerchantStore, ReviewData } from '../models/merchant.model';

/**
 * Browse mode: signed out, the seller app (/app) and the shopper account
 * (/account) still open, show their layout with sample or empty data, and
 * say what the page is for. Nothing reaches the backend and nothing saves.
 */

/** Shown when a save or submit is tried signed out (the shape apiErrorMessage reads). */
export const BROWSE_SAVE_MESSAGE = "You're in browse mode, so nothing is saved. Sign in, or start a store, to make changes.";

/** A rejected call, shaped like a backend error so every existing catch shows the message. */
export function browseRefusal ( message = BROWSE_SAVE_MESSAGE ): Promise<never> {
  return Promise.reject( { error: { error: message } } );
}

/** The sample store shown to signed-out visitors: Betty's Bridal, the labelled sample store. */
export const SAMPLE_STORE: MerchantStore = {
  id: 'sample-bettys-bridal',
  name: "Betty's Bridal",
  slug: 'bettys-bridal',
  status: 'live',
  source: 'manual',
  onboardingStep: 'live',
  voice: 'warm',
  heroLines: {
    warm: 'Gowns, veils and everything for the big day.',
    classic: 'Bridal gowns and accessories.',
    minimal: 'Bridal.',
  },
  quickTiles: [],
  brand: {
    palette: { main: '#c9849a', accent: '#4a2340', background: '#efe3d3' },
    tuned: { accent: '#b55674', tintLight: '#f6eaee', tintDark: '#391923', tintFgLight: '#763866', tintFgDark: '#d39cae', accentShiftPct: 13, notes: [] },
    logoUrl: null,
  },
  referral: { offeredRatePct: 8, minCommissionPct: 8, blockedCategories: [], blockedStoreIds: [], acceptFrom: 'any', approvedStoreIds: [], networkSearch: true, webListings: true },
  directoryCategory: 'Bridal',
  customDomain: null,
  isSample: true,
  claimedListing: null,
  settings: {
    store: { email: '', phone: '', location: 'Seattle, WA', pickup: true, address: null },
    returns: { windowDays: 30, shopperPaysShipping: true, returnShippingCents: 0, finalSaleCategories: [], requireTags: true },
    tax: { auto: true, pricesIncludeTax: false },
    shipping: {
      rates: [{ id: 'standard', label: 'Standard', detail: '3 to 5 business days', priceCents: 800, minDays: 3, maxDays: 5 }],
      freeOverCents: 15000,
    },
  },
  stats: { productCount: 0, photoCount: 0, collectionCount: 3, networkCount: 0 },
  stripe: { connected: false, chargesEnabled: false, payoutsEnabled: false, bankLast4: null, taxStatus: null },
};

export const SAMPLE_REVIEW: ReviewData = {
  store: SAMPLE_STORE,
  collections: [
    { id: 'sample-gowns', name: 'Gowns', productCount: 0, enabled: true },
    { id: 'sample-veils', name: 'Veils', productCount: 0, enabled: true },
    { id: 'sample-shoes', name: 'Shoes', productCount: 0, enabled: false },
  ],
  issues: [],
};

export const SAMPLE_BUILD: BuildJob = {
  id: 'sample',
  status: 'running',
  error: null,
  steps: [
    { label: 'Read your catalog', detail: '', state: 'done' },
    { label: 'Group products into collections', detail: '', state: 'done' },
    { label: 'Write names and descriptions', detail: '', state: 'active' },
    { label: 'Make your store readable by shopping agents', detail: '', state: 'pending' },
    { label: 'Find nearby stores for your network', detail: '', state: 'pending' },
  ],
};

/** What each seller page does, for its browse-mode note (keyed by the path after /app). */
const MERCHANT_PAGES: [RegExp, string][] = [
  [/^onboarding\/import/, 'Import brings your catalog in from Shopify, Salesforce Commerce, a CSV file, Printful, photos, or one product at a time.'],
  [/^onboarding\/brand/, 'Brand sets your logo and colours, tuned so text on your store stays easy to read.'],
  [/^onboarding\/build/, 'Build shows 16Ahead turning your catalog into a store, step by step.'],
  [/^onboarding\/review/, 'Review shows a preview of your store, where you pick its voice, turn collections on or off, and fix anything that needs your eye.'],
  [/^onboarding\/get-paid/, 'Get paid connects Stripe, so your store can take orders and send you payouts.'],
  [/^onboarding\/live/, 'Live is what you see once your store is open: its address, payments and what to do next.'],
  [/^products\/new/, 'Add product is where you add photos, a price, sizes and colours, and how many you have of each.'],
  [/^products\/./, 'Edit product is where you change a product’s photos, price, sizes and stock.'],
  [/^products/, 'Products lists everything you sell, with stock and whether it shows in your store.'],
  [/^orders/, 'Orders shows each order, its shipping status, and returns to receive.'],
  [/^dashboard/, 'Referrals shows the shoppers you send to nearby stores and the ones they send you, what you earned, and who you work with.'],
  [/^settings/, 'Settings holds your store details, home page, returns, sales tax, shipping and web address.'],
];

/** The browse-mode note for a seller page. */
export function merchantBrowseNote ( url: string ): string {
  const path = url.split( /[?#]/ )[0].replace( /^\/app\/?/, '' );
  const page = MERCHANT_PAGES.find( ( [match] ) => match.test( path ) )?.[1]
    ?? 'This is where you run your store on 16Ahead: products, orders, referrals with nearby stores, and settings.';
  return `${ page } You're signed out, so it shows Betty's Bridal, a sample store, and saving is turned off.`;
}

/** What each shopper account page does, for its browse-mode note. */
export function accountBrowseNote ( url: string ): string {
  const path = url.split( /[?#]/ )[0].replace( /^\/account\/?/, '' );
  const page = path.startsWith( 'saved' ) ? 'Saved keeps the items you save at any 16Ahead store.'
    : path.startsWith( 'addresses' ) ? 'Addresses keeps where you ship to, so checkout is quicker.'
    : path.startsWith( 'payment-methods' ) ? 'Payment methods lists the cards Stripe keeps for you.'
    : path.startsWith( 'security' ) ? 'Sign-in & security is where you add a passkey and see how you sign in.'
    : 'Orders lists everything you bought at any 16Ahead store, with tracking and returns.';
  return `${ page } You're signed out, so there's nothing to show yet and saving is turned off.`;
}
