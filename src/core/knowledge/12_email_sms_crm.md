# Email, SMS, CRM, and WhatsApp Commerce
> Topic: Email flows, deliverability, segmentation, SMS compliance, WhatsApp Business, conversational commerce
> Layer: Search/Web/Owned Media
> Freshness: Q1 2026 (Gmail bulk sender rules, Yahoo requirements)
> Confidence: High
> Channel: Email, SMS, WhatsApp
> Business Model: All (D2C, B2B, Service, E-commerce)

---

## Essential Email Flows

Every brand must have these automated flows:
1. Welcome series: Triggered on signup. 3-5 emails over 7-14 days. Introduce brand, set expectations, drive first purchase.
2. Abandoned cart: Triggered on cart abandonment. 2-3 emails over 24-72 hours. Recover lost revenue.
3. Browse abandonment: Triggered after product page visit without cart add. Softer sell than cart abandonment.
4. Post-purchase: Order confirmation, shipping updates, review request, cross-sell recommendations.
5. Win-back: Triggered after inactivity (typically 30-90 days). Re-engage lapsed customers.
6. Sunset/re-engagement: Final attempt before suppressing inactive subscribers. Protects deliverability.

---

## Deliverability (2026)

Gmail's bulk sender requirements (enforced since February 2024) and Yahoo's equivalent:
- Authenticate with SPF, DKIM, and DMARC
- Provide easy one-click unsubscribe
- Keep spam complaint rates below 0.1% (never above 0.3%)
- Use a legitimate sending domain (no free email providers for bulk)
- Monitor sender reputation via Gmail Postmaster Tools and Yahoo Sender Hub

Deliverability is the foundation. None of your email strategy matters if emails land in spam. Domain reputation, IP reputation, list hygiene, and complaint rates are the four pillars.

---

## Segmentation Strategy

Segment by: purchase history, engagement recency, lifecycle stage, product interest, acquisition source, geographic location, and predicted LTV. The most impactful single segmentation is by engagement recency (active, lapsed, dormant).

---

## Frequency Governance

More email is not always better. Monitor unsubscribe rate, spam complaint rate, and engagement rate by frequency cohort. Most D2C brands find 3-5 emails/week is the ceiling before fatigue. B2B is typically 1-2/week. Always let recipients control their frequency preferences.

---

## SMS Best Practices

- Get explicit opt-in (legally required)
- Use for time-sensitive communications (flash sales, shipping updates, back-in-stock alerts)
- Keep messages under 160 characters when possible
- Include opt-out instructions in every message
- 10DLC compliance for US messaging
- Coordinate with email to avoid over-messaging

---

## WhatsApp Business (2026)

Setup: WhatsApp Business API (for scale) vs. WhatsApp Business App (small businesses). Business verification required for API access.

Message quality and compliance:
- Meta assigns quality ratings based on user feedback. Low quality restricts messaging volume.
- Template messages require pre-approval
- Strict opt-in requirements
- 24-hour customer service window (free-form messages only within 24 hours of last customer message)
- Outside the window, only template messages allowed

Use cases: Order confirmations and shipping, abandoned cart recovery, customer support with escalation to humans, appointment reminders, product catalogs and quick replies, CRM integration for personalized messaging.

---

## Amazon Ads (Marketplace/Retail Media)

Amazon Ads ecosystem:
- Sponsored Products: Keyword and product-targeted ads in search results and product pages. The workhorse.
- Sponsored Brands: Banner ads with brand logo, headline, multiple products. Awareness.
- Sponsored Display: Retargeting and audience-based display on and off Amazon.
- Amazon DSP: Programmatic display and video across Amazon properties and third-party sites.
- Amazon Marketing Cloud (AMC): Clean-room analytics connecting ad exposure with purchase data.

Key principles:
- Amazon search is a purchase-intent engine. Users are ready to buy.
- Product listing optimization (title, bullets, images, A+ content) is the foundation before ad spend.
- Bid strategy must account for product margin and target ACOS.
- AMC connects ad execution with retail measurement at individual level.
