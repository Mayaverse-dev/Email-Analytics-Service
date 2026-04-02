# Frontend - React SPA

## Architecture

React 18 + Vite 5 + Tailwind CSS 3. No state management library - uses useState/useEffect with per-page data fetching. Theme context for light/dark mode (persisted to localStorage).

## Routing (React Router v6)

```
/ → DashboardPage
/broadcasts → BroadcastsPage
/broadcasts/:id → BroadcastDetailPage
/users → UsersPage
/users/:email → UserDetailPage
/segments → SegmentsPage
/segments/:id → SegmentDetailPage
```

## Pages

- **DashboardPage**: Parent folder audience cards, overall metrics, SVG trend charts with modal expand
- **BroadcastsPage**: Paginated table (50/page), search, side panel detail with HTML content preview
- **BroadcastDetailPage**: Full view with iframe HTML rendering, recipients table
- **UsersPage**: Complex slot-based segment filtering (union/intersect/exclude), folder tag chips, sortable columns, side panel. Filter state persists to localStorage
- **UserDetailPage**: Profile with metrics and broadcast history
- **SegmentsPage**: Expandable folder tree, inline rename, move-to-folder dropdown, CSV import. Expand state persisted to localStorage
- **SegmentDetailPage**: Stats, members table, associated broadcasts

## API Communication

`src/api/client.js` - fetch wrapper with:
- Base URL from `VITE_API_BASE_URL` env var
- Credentials included (cookies)
- 401 → redirect to portal (`https://portal.entermaya.com`)
- All API functions exported as named functions

## Styling

- Tailwind with custom color palettes: cream (warm neutrals), brand (red/pink), carbon (cool grays)
- CSS variables for theme switching (light/dark)
- Component layer classes: `.card`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.input`, `.table-*`
- Dark mode via `.dark` class strategy

## Patterns

- `dataVersion` state in App triggers child re-fetches after sync
- `mounted` flag in useEffect cleanup prevents state updates after unmount
- Side panels: right-side drawer overlay with click-outside close
- Pagination: offset/limit with PAGE_SIZE=50
- Charts: custom SVG line charts (no charting library)
- Icons: Lucide React
