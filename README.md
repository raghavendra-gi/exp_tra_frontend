# Expense Tracker — Frontend

React 19 + Vite app for submitting and approving expense requests. Talks to the FastAPI backend under `/api`.

## Roles
| Role | Can do |
|---|---|
| **Employee** | Submit expenses (Pooja, Food, Plan Trip, Regional Trip, Accommodation, Inauguration, Couriers, Gifts, Miscellaneous), edit while Pending, start/end Regional Trips, fix & resubmit rejected requests, delete anything not yet approved |
| **Head / HR** | See every request, approve or reject (with a comment), bulk approve/reject |

## Run locally
```bash
npm install
cp .env.example .env      # optional — fill in VITE_GOOGLE_MAPS_KEY for distance/autocomplete
npm run dev               # http://localhost:5173  (/api is proxied to http://127.0.0.1:8000)
```
Start the backend first on port 8000.

## Build / deploy
```bash
npm run build             # output in dist/
```
On Vercel set `VITE_API_BASE_URL=https://<your-backend>.onrender.com` (and `VITE_GOOGLE_MAPS_KEY`), then redeploy.

## Project layout
```
src/
  api/client.js            fetch wrapper (auth header, wake-up retries, 401 → sign out)
  AuthContext.jsx          session (optimistic restore, verified in background)
  App.jsx                  routes; pages are code-split and prefetched after sign-in
  pages/                   Login, Dashboard (approver + employee), Expenses, SelectExpenseType, ExpenseForm
  components/              ExpenseTable, ExpenseDetailModal, FieldRenderer, PlaceInput, RoutePanel, modals…
  hooks/useExpenses.js     shared list (lite payload, cache, in-place updates)
  hooks/useExpenseActions  view / approve / reject / edit / delete flows + their dialogs
  constants/expenseTypes   the form definition for every expense type
  utils/                   formatting, theme, maps loader, route service, file compression
  index.css                the design system: tokens (colour, type scale, spacing) and every component style
```

## Design
- Type: IBM Plex Sans (bundled via `@fontsource/ibm-plex-sans`, works offline), 14px body on a 12/13/14/16/20/24 scale; amounts use tabular figures.
- Colour: navy sidebar, off-white page, white surfaces, brand blue for actions, muted status colours. Light and dark themes are both defined in `index.css`.
- Phones: tables turn into cards, forms go to one column with a pinned Submit bar.

## Notes
- Lists request `GET /api/expenses?lite=1` (no attachment bytes); the full request with attachments is loaded when it's opened. Older backends ignore `lite` and still work.
- Dark/light choice is remembered per browser.
