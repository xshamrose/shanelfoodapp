# Shanel Foods

Mobile app for the Shanel Foods cloud kitchen — order dispatch, delivery lists,
subscriptions, and accounts for a small team (Android-first, built with Expo).

## Running the app

```bash
npx expo start
```

- **On your Android phone:** install the free "Expo Go" app from the Play Store,
  then scan the QR code shown in the terminal (phone and computer must be on the
  same Wi-Fi).
- **In a web browser (for quick checks):** press `w` in the terminal.

## Logging in

Everyone shares the same app; what you see depends on your role.
Default demo users (change them in the **Team** tab as the owner):

| Person         | Role           | PIN  | Sees                                       |
| -------------- | -------------- | ---- | ------------------------------------------ |
| Shanel         | Owner          | 1234 | Everything                                 |
| Dispatch Desk  | Dispatch       | 2345 | Orders, plans, customers, menu              |
| Rider One      | Delivery Rider | 3456 | Only their own deliveries                  |
| Accounts Desk  | Accountant     | 4567 | Orders, plans, accounts, customers          |

## Saving a customer's exact location

Typed addresses are guesswork for a rider. Instead, ask the customer to share
their location on WhatsApp, copy the **Google Maps link**, and paste it into the
customer's **Google Maps location** field.

All the usual link shapes work, including the short `maps.app.goo.gl/...` ones.
When a link contains coordinates the app pulls them out and opens turn-by-turn
directions straight away; a short link is opened as-is and Maps resolves it.
Customers with a saved pin show a small green 📍 in the list.

Keep the **address** field as human-readable text (`Flat 4B, 2nd floor`) even
when you save a link — the rider still needs to read where to go once they have
parked. Pasting a link into the address box does still work for navigation, it
just reads badly on the delivery list.

## Sharing data across the team (one-time setup)

Until this is done the app works fully, but **each phone keeps its own separate
data** — an order dispatch creates will not appear on a rider's phone. The
badge on the Home screen says *"This phone only"* when that is the case.

**Step 1 — make a free database.** Go to [supabase.com](https://supabase.com),
sign up, and create a new project. Any region near you is fine. Save the
database password it asks you to set (you will not need it for the app, but
Supabase will want it later). Creating the project takes a couple of minutes.

**Step 2 — create the tables.** In your new project click **SQL Editor** in the
left sidebar, then **New query**. Open the file `supabase/schema.sql` from this
project, copy all of it, paste it in, and press **Run**. It should say success.

> Re-run this same file whenever `schema.sql` gains new tables (it did for
> subscriptions). It only ever adds what is missing — running it again never
> deletes or duplicates your data. If the Home screen badge says
> *"Cloud problem"* and names a table, this is the fix.

**Step 3 — copy your two values.** In Supabase go to **Settings → API** and copy:

| Supabase calls it                                    | Paste into `.env` as            |
| ---------------------------------------------------- | ------------------------------- |
| Project URL                                          | `EXPO_PUBLIC_SUPABASE_URL`      |
| **Publishable** key (older projects: `anon` `public`) | `EXPO_PUBLIC_SUPABASE_ANON_KEY` |

Open the `.env` file in this project and paste them after the `=` signs.

> ⚠️ **Use the publishable key, never the secret key.** The secret key (starts
> `sb_secret_`, older name `service_role`) ignores every access rule in
> `schema.sql`, and it would ship inside the app on every rider's phone. The
> publishable key obeys the rules; that is the whole point of it.

**Step 4 — restart the app** so it picks up the new settings:

```bash
npx expo start -c
```

The Home screen badge should now read **"Shared with team"**. Whatever was
already on your phone gets uploaded the first time, so nothing is lost.

### What happens when there is no signal

Riders lose signal in lifts and basements, so the app never waits on the
network: it always reads and writes the copy on the phone first, then catches up
with the cloud in the background. If a change cannot be sent, the badge shows
*"N changes waiting"* and it retries automatically once the phone is back
online (or immediately if you tap the badge). When two people change the same
thing while apart, the most recent change wins.

### A note on security

The app carries the `anon` key, which grants access to this data — so install it
only on your own team's phones. If a phone is lost or someone leaves, go to
**Settings → API → Reset anon key** in Supabase, put the new key in `.env`, and
rebuild. If you later want each person to have their own real account instead,
that can be added.

## Where things live

- `src/screens/` — one file per screen
- `src/utils/accounts.ts` — every money calculation, with `accounts.test.ts` beside it
- `src/utils/subscriptions.ts` — delivery generation and skip handling
- `src/data/store.ts` — the data layer: on-device storage plus cloud sync
- `src/data/remote.ts` — Supabase connection and table/field mapping
- `src/data/sync.ts` — cloud status and the offline retry queue
- `supabase/schema.sql` — the database setup script
- `src/navigation/RootNavigator.tsx` — which role sees which tabs
- `src/theme.ts` — colors and the currency symbol (`CURRENCY`)
- `.env` — your Supabase settings (never committed to git)

## Roadmap

1. ✅ Phase 1 — logins with roles, customer address book, menu management
2. ✅ Phase 2 — order entry for dispatch, order statuses, rider daily list
3. ✅ Shared cloud data with offline support (see setup above)
4. ✅ Phase 3 — subscriptions with auto daily orders and skip-a-day
5. ✅ Phase 4 — COD reconciliation, dues/statements, sales summary, expenses

## Accounts (owner and accountant only)

Riders and dispatch cannot see the money screens.

**Profit, not just takings.** Pick Day / Week / Month and the top card shows
profit — delivered sales minus what you spent. Sales breaks down into money
actually received versus delivered-but-unpaid, and splits by how customers pay.

Two decisions worth knowing, because they affect every figure:

- **Revenue counts only delivered orders.** Food still being cooked is shown
  separately as "still to deliver" so takings are never flattered.
- **Cancelled and skipped days are excluded entirely**, so a subscriber who was
  away is never charged.

**Cash from riders** answers "who is holding my money". For each rider on a
given day it shows cash collected, cash handed in, and the gap. Record a
handover with one tap, and the audit trail notes who received it. Only
cash-on-delivery counts — a UPI or monthly-billed delivery never puts notes in a
rider's pocket, so counting them would invent a shortfall. Cash is credited to
whoever actually marked the delivery done, so reassigning a round mid-day keeps
the money with the person who took it.

If a cash delivery went out and nothing was collected, that shows as a separate
warning: the **customer** owes it, not the rider.

**Customers who owe** lists unpaid deliveries by customer, oldest first. Open one
for a statement you can copy or send through your own WhatsApp — nothing is ever
sent automatically. Record the whole amount, or tick off single deliveries.

**Expenses** are recorded by category (ingredients, gas, salaries, rent,
packaging, transport) with an optional note and who paid. Dispatch can add
expenses from their Home screen without seeing any of the other money screens.

### Checking the arithmetic

The money calculations have a test with hand-computed expected figures:

```bash
npm run check:accounts
```

## Subscriptions (the Plans tab)

A subscription is a standing arrangement: *this customer gets these items on
these weekdays*. Set one up once and the app creates the deliveries itself.

- Deliveries for the **next 7 days** are created automatically and appear in
  Orders tagged **Subscription**, so dispatch can see the week coming.
- Each generated delivery has a fixed id built from the subscription and the
  date. That is what stops duplicates: if the owner and dispatch both open the
  app at 6am, they compute the same id, so the customer gets one breakfast.
- **Skipping a day** (customer away): tap the day on the subscription screen, or
  tap **Customer away — skip this day** on the order itself. The delivery is
  cancelled and the day drops out of the bill.
- The subscription screen shows the running month: delivered, still to come,
  skipped, and the billable total with skipped days excluded.
- Turning a subscription **off** pauses it without losing the setup. Deliveries
  already made stay in your records.

Cancelled and deleted deliveries are never recreated, so a day you removed by
hand stays removed.

## How an order flows

1. **Dispatch** taps + on the Orders tab, picks the customer, taps menu items
   (or types a custom line), picks the payment type, and assigns a rider.
2. The order moves **New → Preparing → Out for delivery → Delivered**. Dispatch
   advances it; the assigned rider can do the final "delivered" step.
3. The **rider** sees only their own deliveries for today, with the address,
   landmark, delivery notes, and how much cash to collect.
4. Marking a cash order delivered asks **"Cash collected?"** — answering *no*
   leaves it flagged as unpaid so the accountant can follow up.

Orders with no rider assigned show a red **No rider** tag so nothing gets
forgotten.
