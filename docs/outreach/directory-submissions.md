# Directory submissions

Curated list of directories to submit Valor Odds to. Every directory
here has been vetted on three criteria:

1. **Domain rating ≥ 40** (Ahrefs scale) — below this, the link isn't
   worth the time.
2. **Editorial review** — we do not submit to auto-accept directories or
   link farms. Google penalizes both.
3. **Free or reasonable fee** ($0-100). Skip anything that feels like a
   toll booth.

## General / business directories

- [ ] **Crunchbase** — company page, free. High DR. Add investors,
      leadership, description, logo.
- [ ] **LinkedIn Company Page** — free. Post updates regularly.
- [ ] **G2** — SaaS review aggregator. Create company page; seed with
      3-5 honest user reviews.
- [ ] **Capterra** — free listing. Same flow as G2.
- [ ] **Product Hunt** — save for a launch moment. Not a directory so
      much as a launch event; a top-5 finish drives ~10k visits.
- [ ] **BetaList** — only if we have a pre-launch product to list (N/A
      now, keep for future).
- [ ] **AlternativeTo** — crowdsourced "alternatives to [competitor]"
      directory. Free. Submit as alternative to OddsJam, ArbPicker,
      Unabated.
- [ ] **SaaSHub** — free SaaS listing.
- [ ] **StackShare** — if we open-source any tooling.

## Sports betting vertical

- [ ] **SportsHandle** — contact them about a company profile.
- [ ] **Gambling.com** — paid, but worth it if priced under $500.
      Verify DR before committing.
- [ ] **BetReviews** — submit for review. Free.
- [ ] **BonusSeeker** — tool section. Free to submit.
- [ ] **CardsChat** — has a tool directory. Free.

## Developer / API directories

- [ ] **ProgrammableWeb** — API directory (if we launch a public API).
- [ ] **RapidAPI** — marketplace. Good discovery channel.
- [ ] **APIs.guru** — open-source API catalog.
- [ ] **GitHub Awesome lists** — submit PRs to "awesome-sports-data",
      "awesome-nextjs-projects" (if we open-source any examples).

## Startup & investor-facing

- [ ] **AngelList / Wellfound** — company profile.
- [ ] **Crunchbase** (above).
- [ ] **Signal NFX** — if we raise; press coverage can flow through.
- [ ] **F6S** — startup community; low-effort listing.

## Data / dataset directories

(Use these once we publish the data-journalism briefs and host CSVs.)

- [ ] **Data.world** — free data publishing.
- [ ] **Kaggle** — if any of our datasets are generally useful.
- [ ] **Google Dataset Search** — requires schema.org/Dataset JSON-LD
      on the page hosting the data. See `lib/seo.ts` for the helper.

## What we explicitly do NOT do

- Buy PBN / link-farm links
- Pay for "guest post" placements on sites that sell them (different
  from legitimate sponsored content — the test is: would this site
  publish this post without payment?)
- Use automated submission tools / "submit to 500 directories" services
- Submit to any directory that requires a reciprocal link

## Process

For each submission:

1. Company name: **Valor Odds**
2. Tagline: **AI-powered sports betting intelligence**
3. Description (short, ≤160 chars): "Real-time arbitrage, +EV alerts,
   and best-odds comparison across 30+ sportsbooks."
4. Description (long, ~500 chars): "Valor Odds is an AI-powered sports
   betting intelligence platform. We monitor prices across 30+ major
   US sportsbooks in real time to surface arbitrage opportunities,
   positive-expected-value bets, and best-odds comparisons for 10
   major sports including NFL, NBA, MLB, and NHL. Our alerts ship in
   under a second so bettors can capture edges before lines correct."
5. Logo: `/public/logo.png` (or hosted on press kit)
6. Category: **Sports Betting / Fantasy Sports / Gambling Tools**
7. Website: `https://valorodds.com/?utm_source=<directory_slug>&utm_medium=directory&utm_campaign=listings`

Track submissions in the same spreadsheet as the outreach log, with a
`submitted_at` and `status` column. Most directories approve within
1-2 weeks; follow up once after 14 days if nothing happens.