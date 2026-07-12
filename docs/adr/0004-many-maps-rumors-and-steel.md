# 0004 — Many maps, rumors, and steel

**Status:** Accepted (2026-07-12) · **Milestone:** M4

## Context

M3 closed the crime loop on a single map. M4 closes v0 (spec §7): a rumor bought or
earned in the tavern points to the smugglers' cove; the player travels there through
the game's first map transition, and either times a stealth heist past the guards'
patrols or fights when the plan fails. Hunger and coin pressure push the player to
act; fencing the treasure completes the spec's success criterion — a stranger arrives,
learns, schemes, transgresses, and profits, ideally without drawing a blade.

## Decision

- **Multi-map, minimally.** `WorldDef.maps: Record<id, MapModel>` + `startMapId`
  replaces the single `map`. NPCs carry `mapId` and never cross maps in v0; movement,
  awareness, gossip, confrontation, and aggro all filter to a single map.
  `currentMap(state, world)` is the one accessor everything uses.
- **Portals are map data.** A `portals` object layer in Tiled, object name
  `"<toMapId>/<toLocation>"` on a walkable tile. Walking onto one switches `mapId` and
  lands the player on the named location of the target map as a normal move (an NPC on
  the arrival tile blocks it, like any other move). The link pass extends reachability
  per map, rooted at that map's entry points (the start map's spawn; other maps' portal
  arrivals).
- **Rumors are knowledge, not quests** (spec §4.3: no quest log, no markers).
  `RumorDef {id, text}`; a dialogue effect `{type:"rumor", rumorId}` appends to
  `state.rumors` (idempotent). The cove exists whether or not you've heard of it — the
  rumor only tells you it's there and when the guard drinks at the mouth. Two
  extraction paths: pay the tavernkeeper coin, or earn it free at high standing.
- **Combat is an encounter mode, D&D-shaped.** `state.combat: {enemyIds} | null`,
  entered when an alerted hostile becomes adjacent. `CombatantDef {maxHp, attackBonus,
armorClass, damage}` on NPCs and a `PLAYER_COMBAT` core constant for the player.
  Rounds: one player intent (`attack` | `flee`), then every living enemy acts
  (adjacent → attack roll; else → one BFS step toward the player). To-hit is
  `d20 + attackBonus ≥ armorClass`; all rolls thread `state.rng`. Combat rounds do not
  advance the world tick — deliberately structured so future party combat and a
  detailed inventory can grow into it (owner direction).
- **Aggro rides the awareness model.** Hostile NPCs that can see the player (same
  radius/LOS as witnesses — sneak and night genuinely help) go `alert` and chase via
  the existing BFS; stealth bypass falls out of systems M3 already built. Alert clears
  when the player is out of chase range or leaves the map.
- **Defeat is robbed-not-dead** (owner decision): player hp ≤ 0 wakes the player at the
  start map's spawn with coin 0, items empty, hp restored, combat cleared. Enemies keep
  their wounds and lose alert. No deed, no game over.
- **Hunger is a slow clock.** `player.hunger` accrues per tick, clamped, with three
  stages (fed/hungry/starving). While starving, hunger increments also cost hp — but hp
  never drops below 1 from hunger alone; combat is the only killer in v0. `eat`
  consumes a carried food item.
- **The cove is the second generated map**, built by the same ASCII-layout script
  (renamed to build from a table of layouts). Its geometry encodes the encounter
  design: a tide-tunnel entrance outside the inside guard's perception radius, but a
  treasure chamber beside his post — the heist only works while his schedule has him
  drinking at the mouth, exactly as the rumor hints.
- **Save:** `SAVE_VERSION = 4`; M3 saves start fresh (designed path).
- **Victory beat:** selling any item flagged `treasure: true` emits `fortune-made`
  once — v0's success criterion, made visible.

## Consequences

- SAVE_VERSION 4; M3 saves start fresh.
- Combat's shape (explicit encounter state, content-driven stats) is meant to carry
  forward into party combat and a real inventory system without rework.
- Deferred: murder-as-crime (no witnesses in the cove yet; lands with M5's law depth),
  combat XP/gear progression, eavesdropping/lockpicking (carried over from M3, still
  M5+), per-pack combat/hunger tuning constants, starvation death (capped by design).
