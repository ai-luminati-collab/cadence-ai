# Privacy, Consent, and Data Governance
> Topic: Consent Mode, ATT, GDPR, CCPA, first-party data, cookie dependencies, ad personalization
> Layer: Super-Advanced (Elite)
> Freshness: Q1 2026 (Google, Apple, California DOJ)
> Confidence: High (official regulatory and platform documentation)

---

## Consent Mode (Google)

Google's Consent Mode adjusts how tags behave based on user consent:
- Basic: Tags don't fire until consent is granted
- Advanced: Tags fire with limited functionality (no cookies). Google models the missing data.

---

## App Tracking Transparency (ATT, Apple)

Since iOS 14.5, Apple requires apps to ask permission before cross-app tracking. Opt-in rates hover around 25-30%.

Impact: Significant reduction in Meta's (and others') ability to attribute and target.

Response: First-party data, CAPI (Conversions API), server-side tracking, modeled conversions, creative-as-targeting.

---

## GDPR (EU) and CCPA/CPRA (California)

GDPR: Explicit consent required, right to access/delete data, data processing must have legal basis, applies to any company processing EU residents' data.

CCPA/CPRA: Right to know, right to delete, right to opt-out of sale/sharing, data minimization requirements, applies to California residents.

---

## First-Party Data Strategy

With third-party cookies being phased out and tracking restrictions increasing, first-party data is the most valuable marketing asset:
- Email/SMS lists (permissioned)
- Account data (purchase history, preferences)
- On-site behavior (with consent)
- CRM data (lead scoring, lifecycle stage)
- Survey/quiz data (zero-party data, explicitly given by the user)

---

## Key Principle

Measurement and personalization now operate inside privacy infrastructure, not outside it. Every recommendation involving tracking, targeting, or attribution should account for consent state. The AI agent must factor privacy constraints into all strategy recommendations.
