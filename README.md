# Waypoint Logistics

Tech-Triathlon 2026, Hackathon phase submission.

A delivery planning system for **Waypoint Group**, a fictional Sri Lankan retail company with three brands (Fresh, Style, Tech) that share one delivery fleet. Four roles work in one connected flow: **Store Manager, Dispatcher, Loader and Driver**.

## Live Deployment

- **URL:** http://waypointlogistics.duckdns.org
- Runs as a single Docker container on a Microsoft Azure Linux VM.

## Demo Accounts (seeded)

| Role | Email | Password |
|---|---|---|
| Store Manager | storemanager@waypoint.lk | password123 |
| Dispatcher | dispatcher@waypoint.lk | password123 |
| Loader | loader@waypoint.lk | password123 |
| Driver | driver@waypoint.lk | password123 |

## Run Locally

Requirements: Docker Desktop.

```bash
docker compose up --build
```

Then open http://localhost:3000. The database (SQLite) is created and seeded from the CSV datasets on first start, so every rebuild starts with all 85 orders in PENDING.

## Judge Walkthrough

Use the live URL or the local one. Keep each role in its own browser tab (or use Logout between roles).

1. **Store Manager:** log in, pick an outlet, add items to the cart (Ambient / Chilled tabs), press **Submit Daily Order**. The order appears under *My Orders & Deliveries* with a live status.
2. **Dispatcher:** log in. Press **Auto-Allocate All Pending** (or **Auto-Allocate** on a single order), then **Assign**. Orders that cannot be served show a reason and can be **Deferred**. The *Live Trips* panel shows assigned trips. The screen refreshes every 5 seconds.
3. **Loader:** log in. Only assigned orders appear, grouped by truck and trip, with the LIFO loading protocol. Press **Mark Loaded**.
4. **Driver:** log in (best on a phone-sized screen). Loaded orders appear as stops. Press **Confirm Delivery** (proof of delivery). **Offline test:** in Chrome DevTools, open the Network tab and set *Offline*, confirm a delivery (it shows *SAVED OFFLINE - PENDING SYNC*), then set the network back to *No throttling*. The queued delivery syncs automatically (or press *Retry sync*).
5. **Store Manager:** open the delivered order, press **Confirm Receipt & Inspect**, enter received quantity, condition, note and a signature. The order becomes RECEIVED.
6. **Reset:** on the Loader screen press **Reset Demo State** to remove store-submitted orders and put all orders back to PENDING.

Note: the dataset represents a peak day, so a newly submitted store order may be marked **Over Capacity** because it has the lowest priority.

## Order Status Flow

`PENDING` -> `ALLOCATED` or `OVER_CAPACITY` -> `ASSIGNED` -> `LOADED` -> `DELIVERED` -> `RECEIVED`

An order can also be `DEFERRED` (from PENDING, ALLOCATED or OVER_CAPACITY), always with a human-readable reason.

## Allocation Engine

Implemented in `backend/allocation.js` (`runAllocation`). Rules enforced:

- Depot match between order and vehicle
- Chilled orders only on reefer vehicles
- `van_only` outlets only on vans
- Weight and volume capacity per vehicle across all its orders
- Maximum 2 trips per vehicle per day
- Daily time budget: Fresh 270 minutes, Style + Tech 480 minutes (trip time = outbound travel + inter-stop travel + handling allowance)
- Orders merge into one trip only for the same brand and district
- Priority: deferred yesterday, longest unserved, Fresh first, earliest window close, heavier first
- Clear deferral reasons for every order that is not served

On the supplied peak-day data it serves 69 of 85 orders and defers 16.

## Offline Operation and Recovery (Driver)

- Delivery confirmations are queued in the browser (localStorage) when the server cannot be reached
- Automatic sync every 8 seconds, on reconnect, and via a manual *Retry sync* button
- Job list is cached so the Driver can keep working without coverage
- Offline banner and a clear *pending sync* state per stop

## Architecture

```text
React + Vite + Tailwind CSS (frontend, 4 role screens)
        |  REST /api/...
Express.js API (backend/index.js) + Allocation engine (backend/allocation.js)
        |
SQLite (backend/waypoint.db, seeded from CSV datasets)
```

The frontend is built into static files and served by the Express server, so the whole system runs as **one Docker container** (multi-stage Dockerfile). More detail and diagrams are in the `docs/` folder.

## Repository Structure

```text
backend/        Express API, allocation engine, CSV data, SQLite seeding
frontend/       React + Vite + Tailwind app (pages per role)
docs/           Architecture diagram, data model, AI tool disclosure
ui-designs/     Screen captures from the Design phase
Dockerfile      Multi-stage build (frontend build + backend runtime)
docker-compose.yml
```

## Changes from the Day 5 Design

- **Dispatcher:** the Fuel Quota card was replaced by an Orders Assigned card, order filter tabs and a Live Trips panel
- **Store Manager:** added a real cart, an outlet selector and a My Orders & Deliveries view with live status
- **Loader:** the truck and trip shown come from the allocation result, and only dispatcher-assigned orders appear
- **Driver:** added offline queue and sync, and stops grouped by truck and trip
- **All roles:** added a Logout button

## Known Limitations

- Delivery windows and weekly fuel quotas are not yet enforced by the allocation engine
- Photo evidence upload, barcode scanning and *Flag Missing/Damage* / *Report Delay / Issue* are placeholders
- Sign-in uses fixed demo accounts (no real authentication)
- The item catalogue uses demo weights and volumes
- No automated tests
- The database lives inside the container, so a rebuild resets it to the seeded state

## Figma Design

[Interactive Figma prototype (Design phase)](https://www.figma.com/proto/4S3KEnumXY14PeFgHe3G2y/Untitled?node-id=1-2&t=qWeHN4npVP0y1fBK-1&scaling=scale-down&content-scaling=fixed&page-id=0%3A1)

## AI Tool Disclosure

Claude (by Anthropic) was used as a coding and planning assistant during development. The team reviewed, tested and ran all the code. See `docs/` for details.

## Data Confidentiality

The competition datasets in `backend/data/` are confidential, so this repository is private.
