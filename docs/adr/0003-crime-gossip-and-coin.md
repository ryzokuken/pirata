# 0003 — Crime, gossip, and coin

**Status:** Accepted (2026-07-07) · **Milestone:** M3

## Context

M2 shipped a deed ledger with a placeholder rule: a witness's whole faction learned of
a deed instantly. M3 closes the crime loop (spec §4.3), which requires knowledge to
travel — and be evadable. Theft needs something to steal, so items and coin arrive here.

## Decision

- **Knowledge-based standing.** `DeedRecord.knownBy` lists who knows. NPC standing sums
  deeds they know; faction standing sums deeds any member knows, once per deed.
- **Gossip is co-location.** NPC pairs within Chebyshev 2 with line of sight merge
  knowledge every tick. No rates, no RNG: schedules make rumor geography (the tavern at
  night). All deeds spread, kind words included.
- **Awareness is radius + Bresenham LOS.** Radius 5 by day, 2 at night (21:00–05:00),
  halved sneaking. Sneak is free to toggle; sneaking movement costs 2 ticks.
- **Crimes are content.** A `crime` object maps verb → deed; a verb without a crime def
  is rejected. Unwitnessed crimes land on the ledger with empty `knownBy` (no standing
  effect anywhere).
- **Confrontation is knowledge-gated.** An NPC with `confront` forces dialogue when
  adjacent and _personally_ below the threshold. Fines use the new dialogue vocabulary
  (`coin-at-least`, `pay`). Paying squares you with the guard, not with everyone who
  knows — factions forgive separately.
- **Trade bands as consequence.** Shopkeeper's faction standing picks refuse / wary /
  normal / friendly price bands (constants in core until a second shop needs data).
  Infinite stock, buys anything, no stolen-goods flag yet.

## Consequences

- SAVE_VERSION 3; M2 saves start fresh (designed path).
- Every consequence is evadable by controlling who knows — silence, distance, or speed.
- Deferred: eavesdropping and lockpicking (M4), guard escalation beyond fines, stolen
  goods tracking, per-pack tuning of perception/trade constants.
