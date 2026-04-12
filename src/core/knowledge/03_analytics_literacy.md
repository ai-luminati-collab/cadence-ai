# Analytics Literacy -- Metrics, Attribution, and Dashboard Design
> Topic: CAC, ROAS, MER, LTV, Retention, Cohort Logic, UTM Governance, Attribution Models
> Layer: Basics (Foundation)
> Freshness: Evergreen principles; attribution model details current to Q1 2026
> Confidence: High

---

## Metrics Definitions and When They Mislead

**CAC (Customer Acquisition Cost)**: Total marketing and sales cost divided by new customers acquired. Misleading when: blended across channels with very different unit economics; when including brand spend that drives awareness but not direct acquisition; when not accounting for time lag between spend and conversion.

**ROAS (Return on Ad Spend)**: Revenue attributed to ads divided by ad spend. Misleading when: using platform-reported (not blended) ROAS, since platforms over-attribute; when not factoring COGS, so a 4x ROAS may still be unprofitable; when comparing ROAS across channels without accounting for their role in the funnel (branded search ROAS is always higher than prospecting ROAS, but that does not mean prospecting is less valuable).

**MER (Marketing Efficiency Ratio)**: Total revenue divided by total marketing spend. Also called "blended ROAS." This is the single most honest efficiency metric because it cannot be gamed by attribution. If you spend $100K total and generate $500K total, MER is 5.0. Period.

**LTV (Customer Lifetime Value)**: Total net profit from a customer over their lifetime. Simple formula: Average Order Value x Purchase Frequency x Customer Lifespan. More advanced: use cohort-based analysis. Misleading when: projected too far into the future without real retention data; when not discounted for time value of money; when averaged across very different customer segments.

**Payback Period**: How long it takes to recover CAC from a customer's margin. Critical for cash flow planning. A business with a 12-month payback period needs very different financing than one with a 30-day payback period, even if LTV is the same.

**Retention and Cohort Analysis**: Track what percentage of customers from a given acquisition period return to purchase again in subsequent periods. A cohort curve that flattens (stops declining) indicates product-market fit. One that never flattens indicates a leaky bucket.

**Conversion Rate**: Varies dramatically by context. E-commerce site-wide: 1-3%. Landing page: 5-15% (paid traffic). Email click-to-purchase: 1-5%. TikTok Shop: 10%+ (in-app checkout). Always specify the denominator (sessions, visitors, clicks, impressions).

---

## UTM Governance

UTM parameters must follow a consistent taxonomy across the organization. Recommended structure:
- utm_source: Platform (google, meta, tiktok, email, linkedin)
- utm_medium: Channel type (cpc, paid_social, organic_social, email, referral)
- utm_campaign: Campaign name (use lowercase, hyphens, no spaces)
- utm_content: Creative variant or ad identifier
- utm_term: Keyword (for search campaigns)

Common mistakes: inconsistent capitalization (Google vs. google creates two entries in GA4), missing parameters, using UTMs on internal links (pollutes source data), and not documenting the taxonomy for the team.

---

## Attribution Models

- Last-click: Gives 100% credit to the final touchpoint. Over-credits bottom-funnel channels (branded search, retargeting). Under-credits top-funnel (social, display, content).
- First-click: Gives 100% credit to the first touchpoint. Over-credits awareness channels.
- Linear: Distributes credit equally across all touchpoints.
- Time-decay: Gives more credit to touchpoints closer to conversion.
- Data-driven (DDA): Uses machine learning to assign credit based on actual conversion path data. Google's default in GA4. Requires sufficient conversion volume to be reliable (typically 300+ conversions/month).
- Modeled conversions: Google and Meta now model conversions that cannot be directly observed due to privacy restrictions (cookie consent, ATT opt-outs). These are statistical estimates, not observed events.

When to trust which: Use DDA for tactical optimization decisions within a single platform. Use MER/blended metrics for strategic budget allocation across platforms. Use lift tests for incrementality validation. Use MMM for long-term, cross-channel strategic planning.

---

## Dashboard Interpretation

A good dashboard answers three questions: What happened? Why did it happen? What should we do next? Structure dashboards by funnel stage, not by platform. Include trend lines (week-over-week, month-over-month), not just snapshots. Always show metrics in context (benchmark, target, previous period). Avoid vanity metrics (total impressions without CPM context, follower count without engagement rate).
