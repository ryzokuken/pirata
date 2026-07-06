# ADR 0002: Social simulation data model

**Status:** Accepted · **Date:** 2026-07-06 · **Milestone:** M2

## Context

M2 adds NPCs with schedules, data-driven dialogue, and reputation that visibly
reacts to the player (spec §4.3). The systems must be deterministic, serializable,
and entirely content-driven, and they must leave room for M3's crime/gossip loop
without building it now.

## Decisions

1. **Reputation is a deed ledger, not a number.** `GameState.deeds` records
   `{deedId, npcId, tick}`; standings are computed on demand. Deed _meanings_
   (standing deltas) live in content packs.
2. **M2 knowledge rule: witnesses tell their faction instantly.** Faction standing
   sums deeds witnessed by members. M3 replaces this single rule with gossip
   propagation over in-game time (a `knownBy` set per deed) — the ledger shape
   already supports that.
3. **Dialogue is a tree of nodes with condition-gated choices.** The condition
   vocabulary is tiny (npc/faction standing thresholds, always relative to the
   interlocutor) and grows by content demand; effects record deeds. The link pass
   requires one unconditioned choice per node, so the player can never be stranded.
4. **Schedules are hour→location lists.** NPCs take one deterministic BFS step per
   tick toward the current target; an occupied next step means waiting a tick.
   Locations are named walkable points in the Tiled map's `locations` object layer.
5. **Dialogue takes no game time.** Talking and choosing don't tick the clock, so
   conversation partners never walk away mid-sentence; time passes only on move/wait.
6. **Save version bumped to 2.** State grew; old saves are rejected with a clear
   error and the client starts fresh.

## Consequences

- Faction reactions are instant in M2, which slightly overstates how fast word
  spreads; accepted as a placeholder the M3 gossip system replaces.
- BFS ignores entities, so an NPC standing on another's destination causes polite
  hovering, not rerouting — cheap, deterministic, and reads as social behavior.
- The dialogue condition vocabulary is deliberately minimal; new condition types
  are code contributions to core, not content hacks.
