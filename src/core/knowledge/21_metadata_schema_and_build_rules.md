# Metadata Schema and Build Rules
> Topic: Content type classification, metadata tagging, separation rules
> Layer: System Architecture
> Freshness: Evergreen (structural rules)
> Confidence: High

---

## The Five Content Types (Never Mix Together)

1. Evergreen Principle: A marketing truth that doesn't change (e.g., "Scarcity increases perceived value"). Shelf life: indefinite.
2. Platform-Specific Rule: A current rule for a specific platform (e.g., "Instagram excludes accounts with 10+ reposts in 30 days from recommendations"). Shelf life: until the platform changes it.
3. Observed Tactic: Something that appears to work based on practitioner observation but is not officially documented (e.g., "Posting at 7 AM EST gets more LinkedIn engagement"). Shelf life: months. May stop working anytime.
4. Case Study Evidence: A documented result from a specific brand. Shelf life: directional value for 12-18 months.
5. Temporary Platform Update: A live change with limited relevance window (e.g., "Google upgrading Video Action Campaigns to Demand Gen by April 2026"). Shelf life: until change is complete.

These five types must be kept separate in the knowledge base. Mixing them creates unreliable outputs.

---

## Metadata Schema for Every KB Entry

Every entry should carry:
- Source: Where information comes from (official docs, case study, practitioner, book)
- Freshness Date: When last verified
- Geography: Which market(s) (global, US, India, EU, etc.)
- Channel: Which platform or channel
- Funnel Stage: Where in the funnel (awareness, consideration, conversion, retention)
- Business Model Tag: B2B, D2C, Service, App, E-commerce
- Confidence Level: High (official, multiple confirmations), Medium (single credible source), Low (anecdotal)
- Example Assets: Real examples in action
- Anti-Patterns: What NOT to do
- "When This Stops Working": Conditions making advice obsolete
- Compliance Risk: Legal, policy, or ethical considerations
- Prompt-Ready Output Format: How the agent should structure responses

---

## The Build Rule

The smartest version of this product functions like a chief strategist + platform specialist + media buyer + CRM lead + measurement analyst + prompt operator, all grounded in official docs and proven case evidence.

What makes the system feel intelligent instead of generic is the metadata. Without it, the agent gives generic advice. With it, the agent gives contextual, confident, appropriately caveated recommendations.

---

## Maintenance Schedule

- Weekly: Platform changelog entries
- Monthly: Refresh platform-specific rules with latest updates
- Quarterly: New case studies and report ingestion
- Annually: Full validation against official platform documentation
- Tag updates with freshness dates and confidence levels
