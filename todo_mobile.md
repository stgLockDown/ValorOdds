# Mobile Optimization Fix

## Issues identified from screenshots
- [x] Homepage hero still says "betting intelligence" / "smart bettors" (de-betting)
- [x] Footer description still says "betting intelligence" (de-betting)
- [x] Dashboard `.card` padding `p-6` too large on mobile → reduce to `p-4 sm:p-6`
- [x] Data tables (Odds) get crushed on mobile → table-scroll wrapper + min-width
- [x] Prose-chat tables (AI responses) now scroll horizontally on mobile
- [x] Command Center live scores card width responsive (170px mobile, 200px desktop)
- [x] Chat embedded height responsive (60vh mobile, 70vh desktop)
- [x] Homepage hero heading responsive (text-3xl mobile → text-5xl → text-6xl)
- [x] Homepage stats grid responsive (smaller text/gaps on mobile)
- [x] All section headings text-2xl on mobile (was text-3xl)
- [x] Section vertical padding reduced on mobile (py-10/py-12 vs py-16/py-20)
- [x] Section inner padding reduced on mobile (p-5/p-6 vs p-8/p-10)
- [x] Hero section top padding reduced on mobile (pt-10 vs pt-16)
- [x] Dashboard layout padding fixed (was doubled container-px + px-4)
- [x] Sportsbooks tab gap responsive
- [x] OG image / meta / SEO de-betting (layout.tsx, og route, seo.ts)
- [x] Footer mobile layout (grid-cols-2 on mobile, brand col spans 2)

## Build & deploy
- [x] TypeScript clean
- [ ] Push branch, create PR, merge
- [ ] Verify on production
