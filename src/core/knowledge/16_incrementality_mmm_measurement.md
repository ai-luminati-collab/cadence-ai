# Incrementality, MMM, and Clean-Room Intelligence
> Topic: Measurement hierarchy, platform attribution vs. true incrementality, MMM, clean rooms
> Layer: Super-Advanced (Elite)
> Freshness: Q1 2026 (Google DDA docs, Meta lift studies, Amazon Marketing Cloud)
> Confidence: High
> Funnel Stage: Measurement/Optimization

---

## The Measurement Hierarchy (Least to Most Reliable)

1. Platform-reported ROAS: What Meta/Google/TikTok reports. Over-attributes. Useful for within-platform optimization, not cross-channel comparison.
2. Blended MER: Total revenue / total marketing spend. Honest but no channel-level insight.
3. Data-driven attribution (DDA): Google's GA4 model. Better than last-click but operates within one ecosystem.
4. Modeled conversions: Statistical estimates for unobservable conversions (consent, ATT). Directionally useful.
5. Conversion lift studies: Platform-native experiments measuring incremental impact. More reliable but single-platform.
6. Geo lift tests / holdout tests: Cross-channel incrementality. Expensive, slow, reliable.
7. Marketing Mix Modeling (MMM): Statistical analysis of all marketing inputs over time. Best for strategic allocation. Requires 2-3 years of data.
8. Clean-room analytics (AMC, Google Ads Data Hub): Privacy-safe environments joining first-party with platform data.

---

## When to Use What

- Under $50K/month: MER + platform metrics + basic A/B testing
- $50K-$250K/month: Add conversion lift studies, geo tests, structured creative testing
- $250K+/month: Invest in MMM, incrementality partners, clean-room analysis

---

## Key Principle

The AI agent should always distinguish between correlation (platform attribution) and causation (incrementality). A 10x ROAS on branded search does not mean branded search is the most valuable channel; those customers were likely going to buy anyway. The agent should flag when a result is correlational versus incrementality-backed.
