# Safar – shared trip planner

Track trains, buses, flights and cabs (with confirmed / waitlist / pending status), hotels, veg-friendly food, places to visit with dates, a live route map, and a shared money tracker with "who owes whom". Built for two people planning together (e.g. one in Dubai, one in Jammu & Kashmir).

No build step. Plain HTML + JS. Works offline-first on one phone, and syncs between two phones once you add Firebase.

## 1. Run it on GitHub Pages (free)

1. Create a GitHub repo and push these files to the `main` branch.
2. Repo → **Settings → Pages → Source: GitHub Actions**.
3. The included workflow (`.github/workflows/pages.yml`) deploys on every push. Your app will be at `https://<username>.github.io/<repo>/`.

At this point the app already works, but data is stored only in that browser.

## 2. Sync between both phones with Firebase

1. [Firebase Console](https://console.firebase.google.com) → create a project.
2. **Build → Authentication → Sign-in method → enable Anonymous.**
3. **Build → Firestore Database → Create database.**
4. **Project settings → Your apps → Web (`</>`)** → copy the config object into `firebase-config.js` (replace `null`).
5. Publish the rules: paste `firestore.rules` into Firestore → Rules, or run `firebase deploy --only firestore:rules`.
6. If you use your GitHub Pages site, add `<username>.github.io` under Authentication → Settings → Authorized domains.
7. Commit and push. Open the app on both phones, tap the badge at the top right and enter the **same trip code** (8+ characters, hard to guess, e.g. `rajasthan-nov26-k7x9q2`).

The trip code is the shared secret: anyone who knows it can read and edit the trip, so don't share it publicly.

### Optional: host on Firebase instead of GitHub

```bash
npm i -g firebase-tools
firebase login
firebase init hosting   # public dir: .   (don't overwrite files)
firebase deploy
```

## Using it

- **Home** – countdown, **Trip health** (what is missing or clashing), a **Today** card during the trip (today's plan, tonight's hotel with tap-to-call), the weather forecast, what is still to book, and budget.
- **Plan** – day-by-day timeline combining transport, hotels and places.
- **Hotels** – its own tab: night-by-night view (which nights have no bed, one tap to add), booked status, shortlist + Choose, phone, veg info.
- **Transport** – transport with status (Not booked → Waitlist/RAC → Confirmed) and *who is travelling* (both / you / her), plus hotels with veg flag and phone number.
- **Places** – dated places, veg flag, ticket flag ("Need to book ahead" shows up in Trip health), visited tick.
- **Map** – numbered route of places, dashed travel lines, hotels; tap a day chip for just that day.
- **Money** – spending in ₹ or AED, equal split, category totals, who owes whom.
- **Lists** – packing, documents & IDs, to-dos with due dates, and contacts / emergency numbers. Type an item and press Enter to add.

### Trip health: what it checks
Transport or hotels not booked as the date gets close; train booking windows; a **night with no hotel**; **double-booked** nights; **a missing leg** (e.g. you arrive in Jaisalmer but the next leg leaves from somewhere else); tickets marked "book ahead"; two places at the same time; confirmed tickets with no PNR; veg food not confirmed; budget over or nearly over; overdue checklist items.

### Extras
- **Add to calendar** (Home → Settings) saves a `.ics` file you can open on Google or Apple Calendar so both phones get reminders.
- **Share summary** sends a WhatsApp-ready day-by-day text. **Print** gives a clean itinerary.
- **Works offline.** After the first visit the app opens with no signal (desert, train, flight). On a phone choose *Add to Home Screen*. Map tiles you have already viewed are kept; new areas need internet.

First time: Home → **Load Rajasthan sample trip**. It is an 11-day plan (Jammu → Jaipur → Ranthambore safari → Jodhpur → Jaisalmer → Sam dunes camp → Udaipur → home) with transport, hotels, places with entry-ticket costs and veg notes, packing / documents / to-do lists and emergency contacts.

How accurate is the sample? Train numbers and times, flight options, hotel names/veg status, entry fees and safari prices come from web listings checked in Nov 2026, but they change. Anything marked "rough estimate" (most fares, cab prices, some room rates) is my guess. Booking statuses, PNRs and the "(sample)" expenses are made-up demo data. Hotel phone numbers are left blank for you to fill in. Verify everything on IRCTC / airline / official sites before paying, and delete what you don't need.

## Syncing safely when you both edit

Changes are merged **item by item** (each booking, hotel, place, expense, checklist item), newest edit wins per item, and deletions are remembered. If you edit different things at the same time, both edits are kept. If you both edit the *same* item, the later save wins.

## Security

- **Publish the updated `firestore.rules`** (Firebase Console → Firestore → Rules → paste → Publish). The new rules let someone open a trip only if they know its exact code, block listing/browsing all trips, block deletes, and cap the size of what can be written. The earlier version of the rules allowed listing, so please replace it.
- Use a long, hard-to-guess trip code and share it privately.
- Optional: in Google Cloud Console → APIs & Services → Credentials, restrict the Firebase web API key to your site address (`https://<username>.github.io/*`).

## Notes

- Map tiles and place search use OpenStreetMap / Nominatim (free; fine for personal use).
- Backup / Restore buttons on Home export and import everything as JSON.
- Conflicts: the latest save wins, which is fine for two people but avoid editing the same item at the same moment.

## Screen sizes

Layout adapts automatically: phones get bottom tabs and single-column cards; tablets get two columns; laptops (960px+) get a left sidebar with 2–3 columns and a full-height map; very wide monitors get 4 columns. Printing a page (Ctrl/Cmd+P) gives a clean itinerary without buttons. Tested at 320, 390, 768, 1024, 1366 and 1920px wide with no sideways scrolling.

## Your real trip (Jan–Feb 2027) and arrival timers

Tap **Home → Load the Rajasthan trip** to fill the app from your TRAIN_BOOKINGS and RAJASTHAN_ITINERARY documents:
8 train legs, flights home, 6 planned stays plus 12 shortlisted hotels (Jaipur, Bikaner, Bharatpur), 19 places, to-dos and contacts.

- **Arrival timers**: every transport leg shows a live countdown ("Arrives in 3d 6h 30m", "On the way", "Arrived"). Set the arrival date/time and time zone (India or Dubai) in the booking form. Timers appear on Home, Plan, Today and Bookings.
- **Alternative legs**: where your two documents disagree, both versions are kept; alternatives show timers but are left out of the plan, budget and checks.
- **Shortlisted hotels**: press ✓ Choose on one; the rest of that city's options are cancelled and the budget uses your pick.
- Statuses all start as "Not booked": change them as you book. Set your budget and AED rate under Money.
- If you use Firebase, re-publish `firestore.rules` from this folder.

## Sync and calendar fixes
- Plan tab: a month calendar plus day-by-day list that follow the trip dates in Trip settings. Items outside those dates are flagged.
- Sync: edits are merged inside a transaction (no overwriting each other), refreshed on opening, focus, reconnect and every minute, retried after errors. Tap the badge (or Home → 🔄 Sync now) to force a refresh; hover/long-press it to see the last sync time or error.
- Both phones must use the same sync code, and Firestore rules + Anonymous sign-in must be enabled (README steps above).

## First open
The app now opens with the Rajasthan Jan–Feb 2027 trip already in it. Edit anything; edits always win over the starting copy when two phones sync.

## Passcode lock
The app opens on a passcode screen. Your Rajasthan trip is stored **encrypted** in `trip.enc` (AES-256), so the public site and repository show only scrambled bytes. Unlocking checks the passcode by decrypting that file.
- **Upload `trip.enc`** with the other files. It must be in the same folder as `index.html`.
- **Change the passcode:** open `change-passcode.html` in a browser (it works offline), choose `trip.enc`, enter the old and new passcode, and upload the new `trip.enc` it creates.
- **Lock a phone:** Home → 🔒 Lock. "Remember on this device" keeps a phone unlocked for 30 days.
- The lock keeps strangers out of the app and hides the built-in trip. Live edits stay protected by your Firebase sync code and rules. Keep both secret.
