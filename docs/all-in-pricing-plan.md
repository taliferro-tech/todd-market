# All-in prices: shipping and tax included

Status: plan only, not built. Written 2026-11-01.

## The idea

A shopper on 16Ahead Store sees one price, and that's what they pay. The
price on the product card, the product page, the bag and the checkout is the
same number. No shipping line appears at checkout, no tax is added at the
end, and there are no fees.

To make that work, we work out what shipping will cost **when a product is
added to the catalog**, not at checkout, and build it into the price.

What already works this way:

- **Our platform fee and Stripe's fee** come out of the store's side (the
  Stripe application fee on the store's own charge). The shopper never sees
  them. Nothing to change.

What doesn't yet:

- **Shipping** is a flat rate per order (Standard $8, Express $18 by default,
  under Settings → Shipping), chosen and added at checkout.
- **Tax** is calculated by Stripe Tax at checkout and added on top. The
  store setting `tax.pricesIncludeTax` exists and sets the store's Stripe
  default, but checkout ignores it: it always adds `tax_amount_exclusive` to
  the total.

## How the shopper sees it

- Product card and page: **$24** · "Shipping and tax included".
- Bag and checkout: the total is the sum of the prices. No shipping picker
  unless the store offers a faster option (see Decisions).
- Receipt and order email: the total, then a small line, "Includes $5.40
  shipping and $1.62 sales tax". Some states expect the tax to be shown, and
  it's honest.
- Referral bags with items from several stores get the biggest win: today
  each store adds its own shipping line. With all-in prices there's nothing
  to add.

## Working out shipping when a product is added

### 1. What's in the box

The product editor gets a **Package** section:

- Presets that cover most stores, chosen once per product: "Coffee bag
  (12 oz)", "T-shirt mailer", "Shoe box", "Small box", "Medium box", or
  custom size.
- Weight in ounces or pounds, per product, with an optional weight per
  variant (a size 13 boot weighs more than a size 7).
- The AI suggests a preset and weight from the photos and category ("This
  looks like a 12 oz coffee bag, about 14 oz packed"). The merchant
  confirms it. We never use a guess without the merchant seeing it.

The store also needs a **ship-from ZIP**. It comes from the store address
already in Settings → Store.

### 2. The estimate

For each package and ship-from ZIP, we get rates to a set of sample
destinations across the lower 48 (one per USPS zone, weighted by where
people live). We use the cheapest reliable service (normally USPS Ground
Advantage) and take a high-side figure (the 75th percentile, not the
average), so most orders cost the store less than we built in.

Where the rates come from:

- **Shippo rate quotes**, using a 16Ahead platform Shippo key for quotes
  only. Getting quotes doesn't buy anything. Stores still buy their own
  labels on their own Shippo account (decision of 2026-10-17).
- **A fallback table** in code with published USPS Ground Advantage prices by
  weight and zone, used until the Shippo key is set up or when Shippo is
  down.
- **Printful items**: Printful's shipping-rates API for that item, since
  Printful ships them and bills the store.

Estimates are cached by ship-from ZIP prefix and package, so most new
products don't need a fresh call.

### 3. What the merchant sees

In the editor, under Price:

> **Shopper pays $24.00** · shipping and tax included
> Your price $18.00 · Shipping about $5.40 · Rounded up $0.60
> Tax is taken out of this at checkout and varies by where it's going.

The merchant enters **their price** (what the item is worth to them). We add
the shipping estimate and round **up** to a clean price. The rounding is kept
as extra shipping cover. The merchant can also type the shopper price
directly, and the editor shows what's left for them.

### 4. Keeping estimates current

- A monthly scheduled job re-estimates every product. USPS changes prices
  in January and July.
- If an estimate goes up by more than 10%, the merchant gets a notice on
  Products ("3 products cost more to ship than their price covers") with a
  one-tap "Update prices". We never change a shopper price without the
  merchant saying so.
- After labels are bought through 16Ahead (phase 4), the Orders page shows
  "Shipping built in vs. paid" per month, so the merchant can see if the
  estimates are right.

## Tax included

US sales tax depends on where the order goes (0% to about 10%), so a single
tax-included price means the merchant's take varies a little by
destination. That's how tax-included pricing works everywhere, and the
rounding above usually covers it.

How we'd build it:

- Send line items and shipping to Stripe Tax with `tax_behavior:
  "inclusive"`, and read `tax_amount_inclusive`. The total stays equal to the
  sum of the prices; Stripe works out the tax inside it.
- Split each price into the item part and the shipping part we built in, so
  Stripe Tax can tax shipping correctly where states treat it differently,
  and so our platform fee stays on the item part only (the Pricing page
  promises "not tax or shipping").
- Turn `tax.pricesIncludeTax` on for all-in stores and make checkout honor
  it.

**Needs checking before launch:** whether any states where our merchants
sell require sales tax to be listed separately at checkout, rather than
just on the receipt. That's a question for an accountant or tax lawyer,
not something to guess.

## Orders with more than one item

Each item has its own shipping built in, but several items usually go in one
box. So a 3-bag coffee order collects more shipping than it costs.

For v1 the store keeps the difference. It's simple, it's what "free
shipping" shops do, and it covers the far-away and heavy orders that cost
more than the estimate. A later option is a "shipping saved" discount at
checkout for multi-item orders. Lowering the total at the end is a pleasant
surprise, not a hidden fee.

## Imported products

- **Shopify** exports include a weight per variant ("Variant Grams"). We use
  it and suggest a box from the category.
- **CSV and supplier sheets**: we read a weight column if there is one;
  otherwise the AI suggests one.
- During the build we ask once: "Do your current prices already include
  shipping?" If yes, we keep the prices and show the merchant their take. If
  no, we suggest new prices with shipping built in, for the merchant to
  approve in one step on Review.

## What changes in the code

Backend (`functions/market`):

- Product: `package {preset, weightOz, lengthIn, widthIn, heightIn}`,
  optional `weightOz` per variant, `shipEstimateCents`, `shipEstimateAt`,
  `itemPriceCents` (the merchant's price); the existing `priceCents` stays
  the shopper price.
- Store: `settings.pricing.allIn`, ship-from ZIP from the store address.
- New `shippingEstimate.service.js`: zone sampling, Shippo quotes, the USPS
  fallback table, the cache. Pure parts unit-tested like `pricing.js`.
- `checkout.service.js` `priceBag`: in all-in mode, no shipping charge;
  split each line into item and shipping parts; inclusive tax; platform fee
  on the item part.
- `shippo.service.js`: outbound labels on the store's own Shippo account
  (today it only does return labels), with the package from the products.
- `products.service.js`, import and build jobs: package fields, AI
  suggestion, estimate on save.
- Scheduled monthly re-estimate (can live in the build sweeper or its own
  function).

Web (`web-products/market`):

- Product editor: Package section and the price breakdown.
- Product card, product page, bag: "Shipping and tax included".
- Checkout: drop the shipping lines and the added tax; keep a faster-delivery
  option if offered.
- Receipt, order confirmation and emails: "Includes $X shipping and $Y
  tax".
- Settings → Shipping: ship-from address, faster option, pickup. The
  flat-rate table goes away for all-in stores.
- Orders: Buy label, and "Shipping built in vs. paid".
- Landing, Pricing and Help copy: a selling point for shoppers. Raise the
  wording with Todd.

## Phases

1. **Packages and estimates** (no shopper-visible change): Package section,
   AI suggestion, estimate service with the USPS fallback, price breakdown
   in the editor.
2. **All-in checkout**: shopper sees one price; inclusive tax; receipt
   breakdown; pickup and faster-delivery handling; store setting, on by
   default for new stores.
3. **Imports**: Shopify weights, CSV weight column, AI guesses, the
   "prices already include shipping?" step.
4. **Labels and tracking**: Buy label on Orders through the store's own
   Shippo, tracking filled in automatically, "built in vs. paid" report,
   monthly re-estimate with merchant notices.

Phase 1 can ship on its own and gives merchants useful numbers even before
checkout changes.

## Decisions for you

1. **Faster delivery.** Offer it as an optional upgrade at checkout
   ("Arrives Thursday · +$9")? It's a choice the shopper makes, not a hidden
   fee. Recommendation: yes, only when the store turns it on.
2. **Store pickup.** Shipping is built into the price, so a pickup shopper
   would overpay. Recommendation: pickup takes the built-in shipping off
   ("Pick up in store · $5 off").
3. **Alaska, Hawaii, Puerto Rico.** They cost far more to ship to.
   Options: absorb it, don't ship there, or show the extra on the product
   page before the bag. Recommendation: the store chooses between absorbing
   it and not shipping there; no surprise charge.
4. **Rounding.** Round shopper prices up to whole dollars ($24), to .99
   ($23.99), or not at all? Recommendation: whole dollars.
5. **Existing stores.** Switch them to all-in once their packages are set,
   or let each store choose? Recommendation: on by default for new stores,
   a one-tap switch for existing ones after phase 1 has given them
   estimates.
6. **Platform Shippo key** for quotes. Needs a 16Ahead Shippo account,
   separate from the stores' own accounts.
