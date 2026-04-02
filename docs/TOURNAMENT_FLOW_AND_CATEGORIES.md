# Tournament flow, categories, and brackets

This document describes the **intended product flow** for a tournament from registration through category play, plus **rules** for category splits, placement, bracket scope, and organizer controls. It is the reference for implementation (client, server, and admin).

---

## 1. Lifecycle flow (happy path)

1. **Sign-in & waitlist**  
   Players sign in and are listed on the **waiting list** for the tournament (and relevant **division**, when divisions apply).

2. **Team formation**  
   Players on the waitlist **form teams** (pairs) with other waitlisted players. When a team is created, it appears on the **Teams** tab.

3. **Capacity & groups**  
   When tournament teams are **full** (per configured capacity), the **organizer creates groups**.  
   - Organizers **must** be able to **shuffle / change group composition** before groups are finalized (or until a defined “groups locked” moment).

4. **Classification**  
   After groups exist, the **classification round** table (schedule / standings) is **visible**. Referees can **start** a classification match (see **§7**).

5. **End of classification**  
   When **all** classification matches for that scope are **finished**, **categories** (Gold / Silver / Bronze — see §3) are **filled** with teams according to **ranking** (wins, points, and **tie-breakers** — see **§6**).

6. **Category (knockout) phase**  
   From then on, referees (see **§7**) can **start matches** within **each category’s bracket**.  
   Brackets are **independent** per **division** and per **category** (e.g. Mixed → Gold, Mixed → Silver, Mixed → Bronze are **three separate** brackets).

---

## 2. Views per category

For each category bracket, the product should support **both**:

- **Bracket view** — knockout tree, progression.  
- **List view** — standings / schedule-friendly table (especially on small screens).

---

## 3. Category labels and defaults

- **Fixed labels** (v1): **Gold**, **Silver**, **Bronze** (no per-tournament rename).

### Default split by number of categories (all overridable)

| Categories | Default split | Notes |
|------------|----------------|--------|
| **1** | N/A (single bucket for playoff) | After classification, an **advance rule** applies (see §4). **All teams that advance** enter **one** elimination bracket. |
| **2** | **50% / 50%** | e.g. Gold / Silver. |
| **3** | **~33% / 33% / 33%** | Gold / Silver / Bronze; use a defined **rounding** rule when counts do not divide evenly. |

**Override model (Option C):** defaults above, plus **advanced** tournament settings: **fixed caps** per category and/or **custom percentages**, validated against total teams in the division.

### Placement order (2+ categories)

Teams are **ranked** by classification results (wins, points, then **tie-breakers** in a fixed order). They are placed **sequentially**: fill **Gold** to its quota, then **Silver**, then **Bronze**.

**Odd totals:** **Gold receives the extra team first**, then Silver, then Bronze if further remainder rules are needed.

---

## 4. Single-category tournaments (no Gold/Silver/Bronze split)

- There is **one** competitive path: **one** bracket after classification for **all advancers**.  
- **Default advance rule:** **50%** of teams **continue** to the playoff bracket; **50%** are **eliminated**.  
- **Eliminated (default):** they **remain as spectators** (read-only / not in the draw).  
- This advance behaviour (and spectator vs other outcomes) must be **configurable** in **tournament creation and editing**.

---

## 5. Brackets

- **Format:** **seeded single elimination** with **byes** as needed so the main tree aligns to a **power of two** (common tournament software behaviour). **Higher seeds** receive byes when applicable.  
- **Third place:** **Yes** — include a **bronze / 3rd-place** match (or equivalent) so placement is not only 1st and 2nd.  
- **Scope:** **One bracket per division × per category** (e.g. `mixed` + `Gold` is distinct from `mixed` + `Silver`).

---

## 6. Organizer and admin controls

### Manual moves between categories

- **Organizers and admins** may **move teams between categories** after placement.  
- **Brackets must be recalculated** when category membership changes in a way that affects a bracket.

### Recalculate / config changes (no silent reshuffle)

Changing category **percentages**, **caps**, or **re-running** placement from classification must **not** apply silently if assignments or brackets already exist.

- Use an **explicit action**, e.g. **“Recalculate category assignments”**.  
- Show a **diff preview** (team A: Silver → Gold, …) and require **confirm**.  
- Optionally support **undo** of the last placement (if the product stores prior state).

### Bracket lock

- **Adopted rule:** a category bracket **locks** when the **first match in that division × category** **leaves the “scheduled” state** (e.g. becomes **in progress** or receives a **recorded result**).  
- After lock, **block** silent edits that would break integrity; further changes use an **explicit** admin path (e.g. void/regenerate with warnings).

### Tie-breakers (ranking, seeding, placement)

Primary sort is always:

1. **Wins** (descending)  
2. **Points** (or points-for / standings points — same field the product uses for classification tables; descending)

When teams are **still tied** after wins and points, use this **fixed order** (same for ranking, seeding, and category placement):

3. **Head-to-head** among the tied teams only (mini-standings: wins, then points in those mutual matches). If still tied or not all pairs played, continue.  
4. **Overall point differential** across **all** classification matches for that team (`points for − points against`, or set differential if the app tracks sets — prefer the metric already stored).  
5. **Points scored for** (total across classification).  
6. **Organizer decision** (manual tie-break in admin/organizer UI) as last resort — no silent random seeding in production without logging.

### Audit log

- **Required:** log **organizer/admin** actions that change competitive state, including: category **assignment** changes, **manual** team moves between categories, **recalculate category assignments** (who confirmed), **bracket regenerate/void**, and **manual tie-break** decisions.  
- Include **actor**, **timestamp**, **tournament/division**, and enough **payload** to reconstruct or audit the change.

---

## 7. Referees (who may officiate)

### Who is always allowed

- **Organizers** (and **admins**, if the product grants the same powers) may act as referee for **any** classification or category match in that tournament.

### Suggested referees — classification (by group)

For a given **classification match**, **suggested** referees are:

- Teams in the **same group** as the match being officiated, whose team is **not** playing in that match and is **not** **about to play** (next scheduled match for that team is not this one and not imminent — product should use clear rules: e.g. not one of the two teams on court, and not the **next** match slot for their team).

**Rationale:** idle teams in the same group are physically present and neutral for that pitch.

### Suggested referees — category (knockout) phase

For a given **category bracket match**, **suggested** referees are:

- Teams **in that category** (same division × category) who are **not** playing that match and **not** **about to play** (same “about to play” definition as above).  
- Plus **organizers** as above.

### Users outside the group or category

- If a user attempts to be referee for a match but their team is **not in that classification group** (classification) or **not in that category** (knockout), the app must show a **reminder** (confirmation dialog) explaining that they are **outside** that group/category before allowing them to proceed.  
- Organizers/admins may bypass this reminder or see a lighter notice — product choice; default is **still log** the action if audit requires it.

### Implementation notes

- **“About to play”** should be defined in code (e.g. next match for team within N minutes, or “listed as Team A/B on this match card”). Document the chosen rule next to match state enums.  
- Anyone not in the suggested set may still be allowed after **confirmation** (policy TBD); suggested set drives UI hints and defaults.

---

## 8. Implementation checklist (for devs)

- [ ] Waitlist → team creation → Teams tab (existing behaviour aligned with this doc).  
- [ ] Full tournament → organizer creates groups + **shuffle** groups.  
- [ ] Classification table visible; referees start matches (**§7** + **out-of-group reminder**).  
- [ ] Classification complete → **rank** (**§6** tie-breakers) → **assign categories** (defaults + overrides).  
- [ ] Generate **per division × per category** brackets (+ bronze).  
- [ ] UI: **bracket + list** per category.  
- [ ] Tournament settings: category defaults, single-category advance %, spectator default.  
- [ ] Admin: manual category moves + **bracket recalculation** + **diff/confirm** for bulk recalc.  
- [ ] Bracket **lock** (first match leaves scheduled — **§6**).  
- [ ] Fixed strings: Gold / Silver / Bronze.  
- [ ] **Audit log** (**§6**).  
- [ ] Category phase: **suggested referees** + **out-of-category reminder** (**§7**).

### Testing (deferred)

- **Unit tests** for ranking, placement, and bracket generation are **intentionally deferred** for now; add them in a later slice once behaviour stabilises.

---

## 9. Open / TBD

- Exact definition of **“about to play”** (time window vs next slot only).  
- Whether non-suggested users may referee **only after** confirmation or are blocked entirely.  
- Organizer **bypass** copy for out-of-group reminder.

---

*Last updated from product discussion; amend via PR when behaviour changes.*
