# 90-day link-building playbook

What to do, week by week. Every action here is low-cost and doesn't
require headcount — founder or marketing lead can run it solo on a
few hours a week.

## Week 1 — baseline

- [ ] Pull current backlink profile from Ahrefs / SEMrush. Note domain
      rating, referring domains, top linked pages.
- [ ] Run three competitors (OddsJam, ArbPicker, Unabated) through the
      same tool. Export their backlink profile. This is your seed list.
- [ ] Claim:
  - [ ] Google Search Console
  - [ ] Bing Webmaster Tools
  - [ ] Google Business Profile (company page)
  - [ ] Crunchbase company page
  - [ ] LinkedIn company page
  - [ ] Product Hunt (save for launch moment)
- [ ] Submit sitemap to Google + Bing.
- [ ] Run the site through:
  - [ ] https://search.google.com/test/rich-results (every template type)
  - [ ] https://validator.schema.org
  - [ ] https://hstspreload.org (submit after one week of live HSTS)

## Week 2 — low-hanging fruit

- [ ] **Directory submissions** (see `directory-submissions.md`).
      Target 10-15 quality directories. Skip any that cost money or
      look like link farms.
- [ ] **Competitor mentions:** every site that reviewed OddsJam / ArbPicker
      in the last 18 months — pitch them with `pitch-affiliates.md`
      Play 1. Aim for 30 pitches in the week.
- [ ] **Reddit:** identify 5 posts in r/sportsbook where users are
      actively asking about arbitrage tools. Helpful reply with a single
      link. Not spam — genuinely helpful content.
- [ ] **Unlinked mentions:** Google `"valor odds" -site:valorodds.com`.
      Any mention without a link is a 30-second outreach to fix.

## Week 3 — data journalism launch

- [ ] Publish Brief 1 (line-shopping cost) from `data-journalism-briefs.md`:
  - [ ] Write 500-word blog post at `/blog/cost-of-not-line-shopping`
        (requires a separate PR to add a blog route — do this later,
        for now publish as a `/learn/*` article).
  - [ ] Export the CSV to `/data/line-shopping-cost.csv`
  - [ ] Generate the hero chart, save as PNG + SVG in press kit.
  - [ ] Email the tier-1 journalist list (Template 2 in
        `pitch-journalists.md`).
- [ ] Follow up with journalists 5-7 business days after send.

## Week 4 — podcast outreach

- [ ] Identify the top 20 betting podcasts (see `pitch-podcasters.md`
      target list).
- [ ] Send Template 1 (guest pitch) to tier-1 shows, Template 3 (show
      notes) to tier-2 shows. 20 emails.
- [ ] Budget: set aside $2,500-5,000 for first two tier-2 sponsorships.
      These pay for themselves on a ~1% conversion rate.

## Month 2 — systematic affiliate outreach

- [ ] Build the affiliate target list:
  - [ ] 50 sites from "best sports betting tools" SERP top 20
  - [ ] 50 Reddit-adjacent creators
  - [ ] 50 YouTube channels in the betting vertical
- [ ] Send Play 1 (competitor-aware) + Play 2 (content idea) in
      batches of 30/week. Track in spreadsheet.
- [ ] Launch an affiliate program promo: 40% revenue share for the
      first 30 days of any signup in the month. Drives urgency.
- [ ] Publish Brief 2 (where arbitrage is hiding).

## Month 3 — scale what works

- [ ] Measure: which outreach play had the highest reply → link
      conversion? Double the volume of the winner.
- [ ] First podcast sponsorships go live; track UTM → signup data.
- [ ] Publish Brief 3 (player prop gold rush). These compound — the
      more data-journalism content we have out there, the more
      journalists come to us for quotes.
- [ ] Identify the 3 outlets with the strongest backlinks gained and
      double down — pitch them a follow-up story, offer exclusive data,
      propose a regular column.

## KPIs

| Metric | Month 1 target | Month 3 target | Month 6 target |
|--------|----------------|----------------|-----------------|
| Referring domains (new) | 15 | 50 | 150 |
| Domain rating (Ahrefs) | +0 | +3 | +8 |
| Data-journalism hits | 1 | 3 | 10 |
| Podcast sponsorships | 0 | 3 | 12 |
| Affiliate signups | 5 | 25 | 100 |
| Organic sessions (GA4) | +10% | +40% | +200% |

Honest note: SEO is a 6-month discipline minimum. Backlinks take 4-8
weeks to influence rank. The goal of month 1-3 is to build the pipeline;
ranking lift is a month-4+ outcome.