# Discussion

**ID:** 11
**Started:** 2026-05-03
**Status:** ✅ Closed
**Language:** Russian
**Started by:** TeamLead Claude (post Phase A closure 2026-05-03; PR #16 merged → master `2438660`; Phase B unblocked under clean-slate decision)

---

## User

### Контекст (recap для свежих агентов)

**Где мы сейчас:** Initiative Phase A ✅ closed under clean-slate amendment (User confirmed weight v1 НЕ в production; dual-running concerns N/A; t115 deprecated; default template = simplified; estimate 5-6 → ~3-4 months).

**Sequence post Phase A:**
- ✅ Phase A: ADR-0005 promoted + accepted (multi-template plurality + simplified architecture + generate-vs-not-generate divider + Phase C amendment clause + TBD placeholders Q7=e REJECT)
- 🟡 **Phase B (this discussion design)** — simplified template implementation: generate-vs-not-generate divider в codegen core
- ⏭ Phase C: synthetic t<200> reference project (5-7 entities)
- ⏭ Phase D: `--template <name>` CLI flag finalize + manifest markers + TASK-CI-001 3-suite split
- ⏭ `<weight-build TASK>`: fresh Flutter app on simplified template (after Phase A-D gate close)

**Phase B scope per ADR-0005 + closure-report Phase B placeholder:**
- Implement generate-vs-not-generate divider per ADR Section 3 (6 generate categories + 5 NOT-generate + 1 optional)
- Apply generate-side anti-examples + migration-side anti-examples (constraining drift в обе стороны)
- Resolve Phase B-D TBD placeholders (Riverpod variant / Drift conventions / manifest markers)
- Resolve test-inventory Open Questions #1 (RelationPatcher applicability) / #2 (OrchestratorPatcher DI style) / #3 (directory layout dependency)
- Codegen core changes (parsers / replacement / generators) для multi-template support — laying groundwork для Phase D `--template` flag

### Что Phase B доставляет

Per closure-report Phase B placeholder section + ADR-0005 anti-examples:

1. **Codegen core multi-template support infrastructure** — separation Clean-specific patches от universal infrastructure
2. **Simplified template scaffolding** — TBD WHERE simplified template живёт
3. **Riverpod variant decision** — какие patterns simplified template emit'ит для DI factory bindings (Section 7.1 TBD)
4. **Drift conventions** — table layout / DAO method naming в simplified template (Section 7.2 TBD)
5. **Manifest markers для simplified** — set может быть смягчён vs t115's 7-marker pattern (Section 7.3 TBD)
6. **Tests для simplified-suite** — emerge as simplified template implements
7. **Open Questions resolution** — directly answer #1/#2/#3 from test-inventory-audit.md

### 10 Подвопросов

**Q1.** Phase B structure — single TASK или multi-task split?
- (a) **Single TASK с N sub-phases STOP-gates** (как Phase A) — atomic acceptance scope
- (b) **Multi-task split** — parallel tasks (TASK-B-core / TASK-B-simplified-content / TASK-B-tests / TASK-B-Riverpod / TASK-B-Drift / TASK-B-markers) — параллелизация
- (c) **Sequenced TASKs** — TASK-B1 (core multi-template infra) → TASK-B2 (simplified template content) → TASK-B3 (tests + Open Q resolution) — sequential, atomic per TASK
- (d) **Hybrid** — single TASK для foundation (B1), затем optional split для content phases

**Q2.** Simplified template location?
- (a) **`G:/Templates/flutter/simplified/`** parallel к t115 (named, не numbered)
- (b) **`G:/Templates/simplified/`** new top-level (clearer separation)
- (c) **Embedded в codegen src** (`src/templates/simplified/...` templated strings)
- (d) **Same folder, t115 deprecated subfolder** (`G:/Templates/flutter/t115-legacy/` rename + new `simplified/`)

**Q3.** Codegen core changes scope?
- (a) **Refactor existing generators** для multi-template awareness (parsers/replacement остаются universal; relation_patcher/orchestrator_patcher gain template-aware switches)
- (b) **Add new simplified-only generators** alongside existing (no refactor; parallel code path)
- (c) **Strategy pattern** — abstract `TemplateStrategy` interface, t115 + simplified implementations
- (d) **Defer infrastructure** — implement simplified hard-coded для now, Phase D refactors к `--template` flag awareness

**Q4.** Riverpod variant decision approach (TBD Section 7.1)?
- (a) **Decide upfront в Phase B** — pick `@riverpod codegen` annotations + flat Notifier
- (b) **Two prototypes side-by-side** — generate same entity through `@riverpod` + manual `Provider`, compare
- (c) **Defer к Phase C** — synthetic t<200> resolves через trial
- (d) **Defer к weight build** — simplified template НЕ emits Riverpod files; manual write per entity

**Q5.** Drift conventions decision approach (TBD Section 7.2)?
- (a) **Same as t115** — table per entity, DAO method naming `getXById/insertX/updateX/deleteX/watchX`, FK references inline
- (b) **Simplified flat** — single shared db.dart с inline tables (no separate per-entity files)
- (c) **Defer к Phase C**
- (d) **Defer к weight build**

**Q6.** Manifest markers для simplified — какой scheme?
- (a) **Same 7-marker pattern as t115** (driftTableImports / driftTableColumns / oneToManyMethods / etc.) — backwards compat
- (b) **Reduced 3-4 marker set** — `simplifiedDriftTable / simplifiedDao / simplifiedRepository / simplifiedAdapters`
- (c) **No markers** — simplified template как fully-generated stub (no manual edit zones, regen overwrites everything)
- (d) **Decide в B + iterate в C** — start с reduced set (b), add back if Phase C runs into limitations

**Q7.** Tests strategy для simplified-suite в Phase B?
- (a) **Mirror t115-suite structure** — для каждого Clean test добавить simplified analog
- (b) **TDD-first** — write simplified tests перед simplified template implementation (red → green)
- (c) **Test on synthetic t<200> только** — Phase C synthetic project = primary acceptance, unit tests minimal
- (d) **Reuse existing tests** через template parametrization (per Sub-A4 `rewrite-for-template-abstraction` action)

**Q8.** Open Question #1 (test-inventory) — RelationPatcher applicability в simplified?
- (a) **YES** — simplified тоже использует marker-based regen
- (b) **NO** — simplified = fully-generated stub, no marker patching
- (c) **PARTIAL** — simplified uses markers только для core sync_core wiring, не для relations

**Q9.** Open Question #2 (test-inventory) — OrchestratorPatcher DI style adaptation для simplified?
- (a) **Simplified uses different DI** (provider-direct lookup) → orchestrator_patcher.test.ts требует `port-simplified` adaptation
- (b) **Simplified inherits t115 DI pattern** (`ConfigurationLocalApply(ConfigurationDao(dbService))` style)
- (c) **Simplified avoids OrchestratorPatcher entirely**

**Q10.** Phase B multi-agent review composition?
- (a) **Same as Phase A Sub-A5** (4 reviewers: architecture / sync / test / adversarial overlay)
- (b) **3 thematic reviewers** (architecture / generator-core / test) + 1 Adversarial — Phase B specific (no sync changes если ADR-0005 sync_core integration model unchanged)
- (c) **2 reviewers** (Standard + Adversarial) — minimal pattern, Phase B = mechanical implementation per ADR-0005
- (d) **Per sub-task review** — review каждый Sub-B sub-phase отдельно (2 reviewers minimum per sub-phase)

### Что я (teamlead) рекомендую (initial position)

- **Q1=c** sequenced 3 TASKs (B1 core infra → B2 simplified content → B3 tests + Open Qs)
- **Q2=a** `G:/Templates/flutter/simplified/` parallel location
- **Q3=a** refactor existing generators для template-aware switches
- **Q4=a** decide upfront `@riverpod codegen` + flat Notifier
- **Q5=a** same Drift conventions as t115
- **Q6=b** reduced 3-4 marker set
- **Q7=b** TDD-first для simplified-suite tests
- **Q8=b** NO RelationPatcher в simplified (fully-generated stub philosophy)
- **Q9=a** different DI для simplified (provider-direct lookup)
- **Q10=b** 3 thematic + 1 Adversarial overlay per TASK
- **Open Q #3 resolution:** Phase B simplified preserves Clean directory layout (`data/datasources/local/tables/`) — `app_database_generator.test.ts` 11 cases stay universal

**Phase B estimate:** ~3.5-4.5 weeks executor work (sequenced 3 TASKs), hard ceiling 5 weeks.

### Risks (initial)

1. **TASK-B1 refactor scope creep** — codegen core touches everything; mitigation: scope tight ("template-aware switches only")
2. **Riverpod variant Q4=a "decide upfront" risk** — wrong pattern → Phase C discovers issue → ADR amendment; mitigation: Phase C amendment clause covers
3. **Q6=b reduced markers risk** — Phase C synthetic discovers reduced set insufficient; mitigation: changelog в test-inventory + ADR amendment
4. **t115 regression risk** — TASK-B1 refactor может subtly break t115 generation; mitigation: CI gate (TASK-CI-001) catches via keep-t115-legacy 17% tests; TASK-B1 acceptance includes "t115 generation проверен на existing test project (e.g. t164)"
5. **Phase B scope creep к D** — `--template <name>` CLI flag temptation в TASK-B1; mitigation: Q3=a hard scope ("infrastructure для multi-template, не CLI flag implementation")

### Что я ожидаю от агентов

1. Verify Q1 sequenced approach — sequenced TASKs vs single TASK для implementation work
2. Q2 simplified template location — `G:/Templates/flutter/simplified/` (a) vs alternatives
3. Q3 codegen core changes scope — refactor existing (a) vs strategy pattern (c)
4. Q4 Riverpod variant — decide upfront (a) vs prototype side-by-side (b)
5. Q6 manifest markers — reduced set (b) vs same as t115 (a)
6. Q7 TDD-first — write tests первыми (b) vs after implementation (a)
7. Q8/Q9 Open Questions — verify rationale solid
8. Open Q #3 (directory layout) — Phase B should commit к Clean-style hierarchy preservation OR flatten?
9. Q10 review composition — 3 thematic + 1 Adversarial (b) per-TASK
10. Risks I missed
11. Estimate sanity — 3.5-4.5 weeks executor (sequenced 3 TASKs) realistic?

### Что НЕ обсуждаем здесь

- Phase C synthetic t<200> entity choices (Phase C scope)
- Phase D `--template <name>` CLI flag implementation (Phase D scope)
- `<weight-build TASK>` content (post Phase A-D gate close)
- ADR-0005 fundamental architectural revisions (Q7=e REJECT in Discussion #10)
- t115 deprecation removal timing (post weight build)
- Backend strategy / sync_core integration model (Phase A done, ADR-0005 codifies)

---

## Claude_1

2026-05-03 18:56

### Общая позиция

В целом teamlead's recommendation set sound и хорошо опирается на Phase A foundations. Соглашаюсь с **8 из 10 vote'ов** (Q1=c, Q2=a, Q3=a, Q5=a, Q7=b, Q8=b, Q9=a, Q10=b + Open Q #3) и расхожусь концептуально на **Q4 и Q6** — оба расхождения связаны с одной и той же мета-проблемой: ADR-0005 Section 7 явно REJECT'ил pre-decision этих TBD в Phase B без prototype data (Q7=e Discussion #10). Teamlead рекомендует Q4=a "decide upfront в Phase B" и Q6=b "reduced 3-4 markers" — это **частично воспроизводит** именно тот anti-pattern, который Phase A пыталась избежать.

Главный structural concern: в Phase B sequence (B1 → B2 → B3) отсутствует **explicit prototype-first sub-phase** перед freezing Riverpod variant и marker scheme. Phase A заложил amendment clause + Phase C amendment slot для этих самых open questions; Phase B должен **производить evidence**, а не **предписывать решения** до того как simplified entity #1 actually generated end-to-end. Иначе Phase C получает frozen contract с возможной needless ADR amendment iteration.

### Vote per Q

- **Q1=c** — согласен. Sequenced 3 TASKs (B1 core infra → B2 simplified content → B3 tests + Open Qs) корректно: dependency граф линейный (можно ли refactor'ить generators до того как simplified template existing? нет — нужно знать чего simplified template хочет от core. Можно ли писать simplified content без core support? с трудом — fallback к hard-coded paths). Hybrid (Q1=d) рассматривал, но split sequence чище в acceptance gates чем "single TASK + optional split downstream". Single TASK (Q1=a) Phase A-style тут хуже работает: Phase A was design-only (no code), Phase B = implementation-heavy с realistic TASK boundaries 1-2 weeks each — смешивать в один atomic = поощряет scope creep.

- **Q2=a** — согласен. `G:/Templates/flutter/simplified/` parallel к t115 = consistent с established convention (t115 flutter template family). Top-level (Q2=b) разрывает namespace без выгоды; embedded в codegen src (Q2=c) ломает scan-based template discovery (`TemplateService.scanTemplates`); rename-and-coexist (Q2=d) добавляет git churn без архитектурной ценности. **Дополнение:** настойчиво рекомендую **named** не numbered — `simplified/` (не `t116/`). Numbered convention t115 = legacy; multi-template plurality (ADR-0005) предполагает именованные templates.

- **Q3=a** — согласен с caveat. Refactor existing generators для template-aware switches = right scope для Phase B. Strategy pattern (Q3=c) overkill для 2 templates (interface ради interface — YAGNI; abstract `TemplateStrategy` оправдан только при ≥3 templates). Defer infrastructure (Q3=d) ломает core principle Phase B = "lay groundwork для Phase D". Add new parallel generators (Q3=b) удваивает maintenance без переиспользования — ADR-0005 Section 5 говорит 78% cases / 72% files universal, parallel impl выкидывает этот reuse. **Caveat:** "template-aware switches" должны быть **explicit boolean parameter / strategy enum**, не implicit detection from file paths — иначе orchestrator_patcher style heuristics return.

- **Q4=b** — **расхождение с teamlead (a)**. Teamlead голосует "decide upfront" `@riverpod codegen + flat Notifier`. ADR-0005 Section 7.1 explicit REJECT этого: "Phase B prototype simplified template + side-by-side с generated stub usage → данные для решения. ADR amendment когда зафиксировано." Q4=b (two prototypes side-by-side) **literally** что Section 7.1 prescribes: generate same entity (Configuration) через `@riverpod` + manual `Provider`, сравнить в context simplified DI factory bindings, **затем** commit. Teamlead's risk #2 ("wrong pattern → ADR amendment") — это **inherent в decide-upfront approach**; mitigation "Phase C amendment clause covers" = treat amendment clause как safety net вместо preventing the situation. Discussion #10 Q7=e specifically rejected этот reasoning.

- **Q5=a** — согласен. Same Drift conventions as t115 (table per entity, DAO method naming `getXById/insertX/updateX/deleteX/watchX`, FK references inline). Rationale (Open Q #3 dependency): сохранение Drift conventions = сохранение directory layout = `app_database_generator.test.ts` 11 cases stay universal. Simplified flat (Q5=b) ломает 11 universal cases без обоснования (Drift conventions ортогональны generate-vs-not-generate divider — flat структура DAO ничего не упрощает в business layer manual write). Defer (Q5=c/d) опасно: weight build TASK будет blocked если Drift conventions не finalized. **Дополнение:** "same as t115" применяется **только к conventions**, не к marker scheme (см. Q6).

- **Q6=d** — **расхождение с teamlead (b)**. Teamlead голосует reduced 3-4 marker set upfront. Я голосую **Q6=d "decide в B + iterate в C"** = start с reduced set hypothesis, validate на synthetic t<200>, iterate если limitations discovered. Difference от teamlead's (b) тонкая, но critical: teamlead's framing предполагает marker set finalized в Phase B, ADR amendment if Phase C needs more (= rework). Q6=d framing предполагает marker set **provisional в B** + Phase C synthetic = **acceptance test** для marker scheme. Practically: B prototype emits простейший marker set достаточный для Configuration entity (1-2 markers, не 3-4), Phase C extends на 5-7 entities → finds gaps → amendment clause adds. **Same as t115** (Q6=a) over-constrains: t115's 7-marker pattern designed для multi-layer Clean wire-up который simplified eliminates, copy-paste 7 markers = ceremony без purpose. **No markers** (Q6=c) = fully-generated stub приемлемо если regen всегда overwrites — но ADR-0005 Section 4.1 requires Repository = atomic transaction site, что **может потребовать manual edits** (e.g., custom transaction logic для multi-entity workflow), → markers нужны как minimum.

- **Q7=b** — согласен с TDD-first. Write simplified tests перед simplified template implementation (red → green) consistent с sync_core CLAUDE.md TDD principle ("тесты до кода — TASK-002 28 integration tests пишутся **до** реализации в TASK-003"). Mirror t115-suite (Q7=a) механически = test cargo cult; test on synthetic only (Q7=c) leaves Phase B without acceptance gate (executor может claim "done" без verifiable criteria); reuse via parametrization (Q7=d) is downstream optimization (`generation_service.test.ts` rewrite-for-template-abstraction case) — **не** strategy для new tests. **Caveat:** TDD-first работает только если ADR-0005 generate-divider **specific enough** для writing failing tests без implementation knowledge — Section 3.4 anti-examples + Section 3.1 generate categories = достаточная specificity (✅).

- **Q8=b** — согласен. Simplified = fully-generated stub philosophy = NO RelationPatcher. RelationPatcher = marker-based regen для multi-layer Clean wire-up (`:base / :oneToManyMethods / :methods` markers); simplified eliminates multi-layer hierarchy per ADR-0005 Section 2 (flat Repository + sync adapters, no layered notifier wire-up). Если simplified не эмитит multi-layer markers → не нуждается в RelationPatcher. **Q8=c** (PARTIAL) интересен но добавляет complexity без clear benefit — если markers нужны для core sync_core wiring, OrchestratorPatcher already covers это (Q9). Test-inventory Open Q #1 → **resolved NO**.

- **Q9=a** — согласен. Simplified uses different DI (provider-direct lookup) → orchestrator_patcher.test.ts требует `port-simplified` adaptation. Rationale: t115's DI pattern (`ConfigurationLocalApply(ConfigurationDao(dbService))` = constructor injection chain) = Clean Architecture artifact (explicit dependency wiring); simplified's Riverpod factory bindings (Section 3.4.4) = `ref.read(xxxDaoProvider)` style = provider-direct lookup. Это два concept'но разных DI paradigms, не cosmetic difference. Q9=b (inherit t115 DI) ломает Section 3.4.4 generate divider; Q9=c (avoid OrchestratorPatcher entirely) over-corrects — sync_core 5 adapters per entity per ADR-0005 Section 1 **require** orchestrator registration, just с different DI lookup style. Test-inventory Open Q #2 → **resolved port-simplified**.

- **Q10=b** — согласен. 3 thematic (architecture / generator-core / test) + 1 Adversarial overlay per TASK = right composition для Phase B. Same as Phase A (Q10=a) добавляет sync reviewer без явной потребности — ADR-0005 Section 4 codifies sync_core integration model unchanged, sync reviewer's catch rate в Phase A был относительно low (10 findings, 0 CRITICAL); generator-core reviewer более applicable для Phase B (template refactor + simplified emission logic). 2 reviewers (Q10=c) под-ресурсирован для 3 TASKs sequenced — Adversarial overlay один не catches architecture mistakes без architecture reviewer. Per-sub-task review (Q10=d) подходит если sub-tasks substantial; sequenced TASKs Q1=c уже provide natural review boundaries.

- **Open Q #3** — согласен с teamlead. Phase B simplified preserves Clean directory layout (`data/datasources/local/tables/`). **Rationale:** flatten layout (e.g., `lib/features/<entity>/<entity>_table.dart`) ломает 11 cases в `app_database_generator.test.ts` (universal verdict conditional на Clean hierarchy preservation per test-inventory-audit Sub-A5 fix). Cost benefit: flatten saves **zero generated LOC** (path strings same length); cost = 11 cases require `rewrite-for-template-abstraction` action (parametrize `tableScanPath`). **Verdict:** preserve Clean hierarchy не потому что Clean architecture, а потому что hierarchy = sync_core sufficient + already tested + flatten не приносит value. **Дополнение к teamlead's verdict:** **Lock decision в TASK-B1 acceptance** (не оставлять как assumption) — explicit acceptance criterion "TASK-B1 simplified template directory layout = `lib/features/<feature>/data/datasources/local/{tables,daos,adapters}/...` + `lib/core/sync/sync_queue_table.dart` (preservation of Clean hierarchy paths, generate-vs-not-generate divider applied to file content not directory structure)".

### Расхождения с teamlead

1. **Q4 (Riverpod variant) decide-upfront vs prototype-first:** Teamlead Q4=a, я Q4=b. Direct contradiction с ADR-0005 Section 7.1 + Discussion #10 Q7=e REJECT. Mitigation предложение: include в TASK-B2 (simplified content) **explicit Sub-B2.1 prototype phase** = generate Configuration через 2 Riverpod variants side-by-side, document tradeoffs, decide. Не "decide on day 1, hope it sticks". Cost: +0.5-1 day TASK-B2 estimate, gain: prevents ADR amendment cycle (которая сама ~1-2 week user decision latency).

2. **Q6 (manifest markers) reduced-upfront vs reduced-iterate:** Teamlead Q6=b "reduced 3-4 marker set", я Q6=d "iterate". Difference: teamlead bakes 3-4 markers в TASK-B1 acceptance; я предлагаю TASK-B1 emit minimum-viable markers (1-2 for Configuration entity), TASK-B3 / Phase C synthetic add markers по факту need. Same outcome direction, но "reduced 3-4" может оказаться over-shoot или under-shoot — depends on Phase C entity coverage. Q6=d framing more honest о что мы don't know yet.

### Дополнительные observations / risks teamlead пропустил

1. **TASK-B1 → TASK-B2 hand-off contract risk.** Sequenced 3 TASKs require explicit interface contract между B1 (core) и B2 (simplified content). Если B1 ships "template-aware switches" но B2 discovers needed switch missing → B1 reopen или B2 adds workaround. Mitigation: TASK-B1 acceptance включает **B2 stub** (mock simplified template invocation проходит через core switches) — proves contract complete до B1 close.

2. **Test-inventory living document update obligation.** Per audit `test-inventory-audit.md` line 9-13: "Mandatory: any (file, category, action) tuple change". Phase B будет добавлять simplified-suite tests + потенциально re-categorize generation_service.test.ts (rewrite-for-template-abstraction → universal post-refactor). TASK-B1/B2/B3 acceptance must include "test-inventory-audit.md changelog updated с этим TASK's changes". Teamlead's risks list не упоминает.

3. **CI 3-suite split (TASK-CI-001) activation criteria.** Per closure-report.md line 56: "wired когда (a) ≥1 simplified suite файл exists AND (b) generation_service.test.ts refactored". Phase B TASKs trigger both conditions → CI split может wire'нуться during Phase B (не Phase D как изначально планировалось). Teamlead должен decide: wire during Phase B OR keep deferred to Phase D? Я рекомендую **defer to Phase D** — Phase B sequenced TASKs benefit from single-suite simplicity (избегаем CI infrastructure churn parallel с template implementation work).

4. **t115 regression risk amplification через TASK-B1 refactor scope.** Teamlead's risk #4 mentions это, но mitigation "CI gate catches via keep-t115-legacy 17% tests" недостаточен — 31 cases / 3 files coverage может miss subtle regressions в universal-suite файлах (which **also** must continue passing для t115). Stronger mitigation: TASK-B1 acceptance включает **explicit t115 generation smoke на reference project** (e.g., regenerate t164 entity, verify zero diff in generated output vs pre-B1 baseline). Не "проверен на existing test project" — explicit **diff zero** acceptance criterion.

5. **`--with-interfaces` flag scope clarification.** ADR-0005 Section 3.3 codifies optional `--with-interfaces` flag (default OFF). Phase B В scope или Phase D? Если Phase B — adds к TASK-B1 scope (CLI flag plumbing). Если Phase D — TASK-B2 simplified content emits without interfaces always, Phase D adds flag wiring. **Recommend Phase D** — keeps Phase B focused, `--with-interfaces` = flag-orthogonal к generate-divider (additive, не gating).

6. **Discussion file-based review pattern для Phase B reviewers.** Phase A Sub-A5 used multi-agent file-based review (Discussion #10 + sub-discussions per reviewer). Phase B per-TASK review (Q10=b) — какой mechanism? Inline comments в task.md? Separate review file `ai/tasks/active/TASK-Bx/review-<reviewer>.md`? Phase A established pattern — Phase B TASKs должны **explicitly inherit** этот pattern в task.md template, иначе reviewers improvise → inconsistent artifacts. Recommend: each TASK-Bx task.md acceptance includes "4 reviewer files attached: review-architecture.md / review-generator-core.md / review-test.md / review-adversarial.md".

7. **Phase B-only subset of generate-vs-not-generate divider.** ADR-0005 Section 3.1 lists 6 generate categories. Phase B implements **all 6** или phased rollout? E.g., TASK-B2 могла implement только Drift table + DAO + Repository + sync adapters (4/6), defer Riverpod data providers + mappings к later. Recommend: **all 6 в TASK-B2** (atomic Configuration entity end-to-end = clearer acceptance) — иначе TASK-B3 tests don't have full surface to validate. But explicit decision needed; teamlead's recommendation implicitly all-6 без statement.

### Estimate sanity check

3.5-4.5 weeks executor sequenced 3 TASKs **realistic если**:

- **TASK-B1 (core multi-template infra):** 1-1.5 weeks. Refactor scope tight per Q3=a — touches `relation_patcher.ts` / `orchestrator_patcher.ts` + parsers (template-aware switches) + `app_database_generator.ts` (если directory layout не preserved — но Open Q #3 resolves preserve, so possibly минимальный touch). Add t115 regression smoke acceptance = +0.5 day.
- **TASK-B2 (simplified template content):** 1.5-2 weeks. Generate first Configuration entity end-to-end через все 6 generate categories. Side-by-side Riverpod prototype (Q4=b) = +0.5-1 day. Drift conventions same as t115 (Q5=a) = no design overhead. Initial marker scheme provisional (Q6=d) = no over-design.
- **TASK-B3 (tests + Open Qs resolution):** 1-1.5 weeks. TDD-first means tests written first **в** TASK-B2 (red → green); B3 = simplified-suite consolidation + Open Q #1/#2/#3 documented resolution + test-inventory-audit changelog + closure-report Phase B section.

**Total: 3.5-5 weeks** — соответствует teamlead's estimate, hard ceiling 5 weeks (а не 4.5) учитывая TDD-first + side-by-side prototype overhead. **Risk:** если Q4 = teamlead's (a) decide-upfront и Phase C discovers wrong choice → Phase C amendment iteration adds 1-2 weeks downstream. Q4=b proactive mitigation worth +0.5-1 day TASK-B2.

### Готов к Decision

Готов. Convergence с teamlead 8/10 sub-questions; 2 расхождения (Q4 / Q6) сводятся к одному принципу: prototype-first вместо decide-upfront для TBD placeholders. Если teamlead поддерживает Q4=b shift, я ready unconditional approve. Если Q4=a stays — flag в Decision как "Claude_1 dissent: Q4=a contradicts ADR-0005 Section 7.1 + Discussion #10 Q7=e; Phase C amendment risk acknowledged по mitigation (clause covers)". Q6=b vs Q6=d тонкое расхождение, не deal-breaker — оба converge на "minimal markers, iterate".

Open Q #3 resolution (preserve Clean directory layout) поддерживаю unconditionally + recommend explicit lock в TASK-B1 acceptance criterion.

---

## ClaudeAdv_1

2026-05-03 19:35

### Adversarial mode warning

Adversarial overlay для Phase B planning. Phase A precedent: Adversarial caught 2 deal-breakers, что 3 thematic reviewers пропустили. Phase B = высокий blast radius (codegen core + simplified scaffolding + future weight build base). Catch rate threshold ≥1 critical/high mandatory. Ниже — фактические находки с file:line evidence; generic concerns исключены.

### DEAL-BREAKERS (must address перед Phase B start)

1. **Teamlead's "7-marker pattern" claim в Q6 wording фактически неверен — t115 emit'ит ≥13 уникальных markers, и Q6 framing построен на ложной baseline.** Discussion #11 (User section line 39 + 76, teamlead's Q6 prompt line 76) утверждает "t115 use[s] 7-marker pattern" + ADR Section 7.3 line 332 повторяет. Я выполнил `grep -oE "generated_start:[a-zA-Z]+" G:/Templates/flutter/t115/t115_flutter | sort -u` — фактически **13 уникальных marker names** (`base`, `driftTableColumns`, `driftTableImports`, `entityToServerpodParams`, `freezedConstructor`, `oneToManyMethods`, `serverpodToModelParams`, `simpleFields`, `syncEntityTypes`, `syncImports`, `syncRegistrations`, `valueWrappedFields`, `valueWrappedFieldsModel`). Из 13 как минимум 3 (`driftTable*`, `serverpod*`, `freezedConstructor`, `simpleFields`) применимы к simplified template независимо от того reduce'м ли мы Clean ceremony. Q6=b "reduced 3-4 marker set" сейчас sounds like simplification от 7 → 3-4; на самом деле это reduction от **13 → 3-4** (≈75% drop). Это либо (a) over-aggressive — Phase C discovery каждый раз будет requesting amendment (Claude_1's Q6=d concern усиливается); либо (b) не основан на actual current state generator. **Fix mandatory:** перед Q6 vote — TeamLead должен повторить `grep` + provide accurate baseline + re-frame Q6 options относительно actual marker landscape. Иначе Phase B locks в hypothesis built on wrong number.

2. **Q9=a и Q4 — undisclosed coupling. Q9 не resolvable без Q4 resolved.** Teamlead vote Q4=a (`@riverpod codegen + flat Notifier`) И Q9=a ("simplified uses different DI provider-direct lookup → orchestrator_patcher.test.ts требует port-simplified") — в одном breath. Но Q9 формулировка "provider-direct lookup" **зависит** от Q4 resolution: `@riverpod codegen` annotations → `ref.watch(xxxProvider)` style, manual `Provider` → `ref.read(xxxProvider)` style, `AsyncNotifier` → `ref.watch(xxxNotifierProvider.notifier)` style. orchestrator_patcher.test.ts `port-simplified` адаптация **значительно различается** в каждом из этих сценариев — fixture template `'$Repository(dao: $Dao(database))'` constructor-chain pattern → flat-provider pattern совсем разный refactor для each Riverpod variant. Если Phase B принимает Q4=b (Claude_1 prototype-first + я согласен), то Q9 vote должен быть **deferred** до prototype evidence. Voting Q4=a + Q9=a одновременно без acknowledging coupling = fragile commitment chain. **Fix mandatory:** либо Q4 vote shift к (b) (prototype-first) → Q9 deferred; либо Q4 stays (a) с explicit acknowledgement что Q9=a binds к specific @riverpod codegen variant, и если prototype reveals issue → both reverse together. Currently недокументировано.

3. **Q3=a "template-aware switches" — фактический refactor scope значительно шире teamlead's framing, потому что ключевые literals в обоих patcher'ах hardcoded к Clean assumptions.** Я прочитал [relation_patcher.ts:18-19](file:///G:/Projects/vs_code_extensions/code-generator/src/features/generation/generators/relation_patcher.ts#L18) — fixed: `const relationTemplateEntity = 'task'; const templateRelatedEntity = 'category'; const markerName = 'oneToManyMethods';` + [line 36](file:///G:/Projects/vs_code_extensions/code-generator/src/features/generation/generators/relation_patcher.ts#L36) — `const directories = ['feature/', 'server/'];`. И [orchestrator_patcher.ts:42-48](file:///G:/Projects/vs_code_extensions/code-generator/src/features/generation/generators/orchestrator_patcher.ts#L42) — `path.join(config.targetFlutterProjectPath, 'lib', 'core', 'sync', 'sync_orchestrator_provider.dart')` hardcoded. И [app_database_generator.ts:21](file:///G:/Projects/vs_code_extensions/code-generator/src/features/generation/generators/app_database_generator.ts#L21) — `path.join(this.config.templFlutterLibPath, 'core', 'data', 'datasources', 'local', 'database.dart')`. Все 3 generator'а имеют либо fixed entity names (Clean fixture coupling), либо fixed directory paths (Clean hierarchy assumption). "Template-aware switch" не = добавить boolean parameter; это **rip-out hardcoded literals + thread template config через 3+ generator constructors + adapt 31 t115-legacy test cases (потому что fixtures используют те же hardcoded names) + verify universal-suite не сломалась**. Teamlead's risk #1 ("scope creep") + Claude_1 risk #4 (t115 regression) signaling правильное направление, но severity недооценена. Phase B-D estimate 1-1.5 weeks для TASK-B1 в Claude_1's calculation = **optimistic**; realistic 2-2.5 weeks если делать правильно. Если делать "правильно для TASK-B1 atomic" → 3+ weeks → triggers User scope question. **Fix mandatory:** TASK-B1 acceptance должен **list concrete files trip refactor** с estimate per-file (не aggregate), иначе scope creep инвариантно начнётся через "ой ещё один generator hardcodes path".

### HIGH (likely to bite в B-D execution или production)

1. **TDD-first (Q7=b) circular dependency для simplified template emerging behavior.** ADR-0005 Section 7.1/7.2/7.3 explicit TBD = simplified template behavior **не fully specified** в Phase A. Riverpod variant TBD, Drift conventions TBD, marker scheme TBD. TDD-first требует ability writing failing test = **knowing expected behavior** в advance. Если Phase B prototype = first artifact показывающий "что simplified emit'ит", какие tests writable до prototype? Только generate-divider category tests ("file `xxx_dao.dart` создан", "file `xxx_usecase.dart` НЕ создан") — это smoke-level; behavioral tests на DI wire-up, marker positions, atomic transaction site все требуют post-prototype design. Claude_1's caveat ("TDD-first работает только если ADR-0005 generate-divider specific enough") = inadequate mitigation; generate-divider говорит **what** to generate, не **how** structure looks. **Fix recommended:** Phase B уровень TDD должен явно differentiate: (a) **divider tests** TDD-first (file existence, anti-example violation detection — writable upfront); (b) **behavioral tests** TDD-after-prototype (marker positions, DI patterns — written после first prototype emerges). TASK-B2 acceptance должен codify split, иначе executor будет либо stuck (waiting for spec to write tests) либо writing post-hoc tests called "TDD" — common anti-pattern.

2. **`G:/Templates/flutter/simplified/` location (Q2=a) — undeclared assumption о PowerShell sandbox writability.** Global memory C:\Users\User\.claude\CLAUDE.md документирует known issue: "PowerShell sandbox limits — НЕ workaround" (rm/delete blocks). `G:/Templates/flutter/` имеет существующий t115 + Packages/ subdirs. Создание `simplified/` как parallel scaffolding (потенциально hundreds of files initial) potentially triggers sandbox prompts each `mkdir`/`Write` call. Verified `ls G:/Templates/flutter/` accessible read-only; **write operations не verified**. Q2=a vote assumes write access без verification. **Fix recommended:** TASK-B1 first acceptance criterion = "scaffold pilot single-file `G:/Templates/flutter/simplified/.gitkeep` через actual subagent worktree → verify no sandbox block" — если block, Q2 vote re-evaluates (e.g., subdirectory `G:/Templates/flutter/t115/../simplified/` symlink, OR fallback embedded в codegen src per Q2=c rejected option, OR alternative writable path under user home).

3. **Open Q #3 resolution "preserve Clean directory layout" contradicts simplified philosophy без acknowledgement.** Teamlead + Claude_1 unanimous: preserve `lib/features/<feature>/data/datasources/local/tables/`. Verified t115 actual depth: `t115_flutter/lib/features/configuration/data/datasources/local/{tables,daos,datasources,interfaces}/...` = **6 levels deep** under `lib/`. Migration-side anti-example (ADR Section 3.5) prohibits "Datasource interfaces по-умолчанию" + "Mappers как separate class" — explicitly attacks Clean ceremony. Но preservation of 6-level Clean directory hierarchy = preserving largest visible Clean ceremony в template structure, без soft-justification "tests cost too much to refactor". Это **trade-off не articulated в ADR-0005** + Claude_1's rationale ("hierarchy = sync_core sufficient + already tested + flatten не приносит value") prioritizes test maintenance cost over simplified philosophy. Future weight-build dev opening simplified template + seeing 6-level directory hierarchy + reading "simplified template" branding → cognitive dissonance. **Fix recommended:** Either (a) justify preservation explicitly в ADR amendment (cost-benefit: 11 universal cases preserved vs simplified philosophy minor regression, accepted) OR (b) invest 1-2 days в TASK-B1 для `rewrite-for-template-abstraction` `app_database_generator.test.ts` 11 cases parametrize tableScanPath → free up flatten option for genuine simplified hierarchy. Don't paper over decision via "lock in TASK-B1 acceptance" without flagging trade-off.

4. **Phase B 3-TASK closure-report.md fill process undocumented.** Closure-report.md line 69-83 (Phase B placeholder) accumulates Verification + sign-offs. Phase B has **3 sequenced TASKs (B1/B2/B3)**. Process question: каждая TASK fills partial Phase B section (incremental updates), либо Phase B section filled только after B3 closure (atomic)? Phase A было single-TASK = trivial. Phase B 3-TASK → ambiguous. Если incremental — каждая TASK acceptance includes "closure-report.md updated с TASK-B<N> verification artifacts" (process overhead per TASK). Если atomic — "Phase B section pending" indicator confuses readers пока B1+B2 done но B3 outstanding. **Fix recommended:** Decide explicitly + document в Phase B initiation. Recommend incremental с per-TASK accumulator section "## Phase B — TASK-B1 deliverable section" / "## Phase B — TASK-B2 deliverable section" / "## Phase B — TASK-B3 deliverable section" + final "## Phase B — closure verdict" sub-section after B3. Иначе process improvise → inconsistent.

5. **TASK-CI-001 currently single-suite, Phase B simplified-suite tests added → simplified bugs delay merge of t115 fixes.** Verified [.github/workflows/test.yml:44](file:///G:/Projects/vs_code_extensions/code-generator/.github/workflows/test.yml#L44) — single command runs **all** `out/test/**/*.test.js`. Phase B TASK-B3 will add simplified-suite tests (закладывает первые `port-simplified` файлы per test-inventory-audit roadmap). CI workflow doesn't yet split — все tests run together. Operational consequence: если simplified-suite test fail (likely during TASK-B3 iteration), **t115 hotfix PR also blocked** на CI (cannot land if any test fails). Claude_1 observation #3 правильно flag это; teamlead's risks list НЕ упоминает. Claude_1 рекомендует defer 3-suite split к Phase D — но это leaves Phase B-D **execution period 3.5-5 weeks** где CI = "all-pass-required" блокирующий tutorial t115 fixes. **Fix recommended:** Either (a) 3-suite split wired в TASK-B1 (acknowledge упомянуто как Phase D scope, scope creep — но reduces operational risk) OR (b) explicit policy "during Phase B, simplified-suite tests marked `.skip` until promoted в TASK-B3" с follow-up cleanup TASK. Don't leave operational risk implicit.

6. **`<weight-build TASK>` placeholder vs actual TASK ID — Phase A-D gate verification chain integrity.** closure-report.md references `<weight-build TASK>` placeholder; TASK ID assigned at `new_task.py` invocation time. Phase B docs (3 TASK markdowns + 4 reviewer files × 3 = 12+ files) will accumulate references to placeholder. Phase A-D gate close requires **batch grep+replace** placeholder → actual TASK ID. Closure-report.md line 57 mentions "batch grep+replace `<weight-build TASK>` placeholder во всех живых docs" — но **process not specified**. Phase B execution adds 12+ new files containing placeholder references — replacement scope grows. **Fix recommended:** Phase B initiation includes explicit instruction "all Phase B docs use literal placeholder string `<weight-build TASK>` (not invented IDs); Phase A-D gate close runs `grep -rl '<weight-build TASK>' ai/` + sed replace per documented procedure". Codify procedure в `ai/scripts/` или roadmap.md. Иначе Phase A-D gate close manual cleanup → drift.

### Vote per Q (с расхождениями vs teamlead где relevant)

- **Q1=c** — согласен с teamlead + Claude_1. Sequenced 3 TASKs corrects. Дополнение: B1→B2→B3 dependency chain должен быть **acceptance-gate enforced**, not just "next TASK starts after". Concrete: TASK-B2 не может start пока TASK-B1 acceptance ✅ + reviewer sign-off ✅ + closure-report Phase B incremental section filled (см. HIGH #4). Teamlead's "sequenced" framing implicit;нужно explicit.

- **Q2=a** — согласен conditional на DEAL-BREAKER #2 / HIGH #2 verification (PowerShell write access). Если block обнаружен → Q2 re-evaluate.

- **Q3=a** — согласен conditional на DEAL-BREAKER #3 (refactor scope explicit listing). Strategy pattern (Q3=c) by default rejected per Claude_1's "interface ради interface YAGNI" — но если TASK-B1 file count ≥4 generators trip refactor, **revisit** Q3=c с argued scope evidence. Currently Q3=a vote based on assumed-tight scope; evidence shows scope wider.

- **Q4=b** — **расхождение с teamlead (a), согласие с Claude_1**. Усиление: Q4=a violates ADR-0005 Section 7.1 explicit "Phase B prototype + side-by-side с generated stub usage → данные для решения". Это не just "wrong choice risk"; teamlead's recommendation **directly contradicts** ADR's explicit guidance. Phase B teamlead pre-deciding TBD без prototype = **same anti-pattern Discussion #10 Q7=e REJECT addressed**. Mitigation "Phase C amendment clause covers" inverts logic — clause = safety net for **discovered** issues, не license to skip prototyping. Я vote Q4=b unconditional; если teamlead Q4=a stays, mark в Decision section "ClaudeAdv dissent: Q4=a contradicts ADR-0005 Section 7.1 + Discussion #10 Q7=e; Phase C amendment cycle = 1-2 weeks downstream cost vs +0.5-1 day TASK-B2 prototype Q4=b option".

- **Q5=a** — согласен. Пока Q5=a + preserve directory layout linked: invariant "Drift conventions same as t115 → directory hierarchy preserved". Если Phase B-D discovers Drift convention divergence нужен (например simplified добавляет stream-watching pattern), revisit Q5 separately от Q3 + directory layout.

- **Q6=d** — **расхождение с teamlead (b), согласие с Claude_1**. Дополнение к Claude_1's argument: DEAL-BREAKER #1 показывает что Q6 framing основано на ложной baseline ("7-marker pattern" — actually 13). Q6=b "reduced 3-4" sounds harmless; actually = 75% reduction от current state. Q6=d "iterate" = honest acknowledgement + Phase C amendment slot. Vote Q6=d.

- **Q7=b** — согласен conditional на HIGH #1 split (divider tests TDD-first vs behavioral tests TDD-after-prototype). Если Q7=b vote interpreted как "all tests TDD-first" — расхождение, vote shifts (a/c hybrid). Currently Q7=b ambiguous; clarification needed.

- **Q8=b** — согласен с teamlead + Claude_1. NO RelationPatcher в simplified.

- **Q9=a** — **conditional на DEAL-BREAKER #2** (Q9 coupling к Q4). Если Q4=b prototype-first → Q9 vote deferred. Если Q4=a stays → Q9=a vote conditional на specific Riverpod variant chosen + acknowledged "if prototype reveals different DI shape, Q9 re-decides".

- **Q10=b** — согласен в principle. Дополнение: Phase A multi-agent review = single discussion (#10) для design phase. Phase B per-TASK = 4 reviewers × 3 TASKs = **12 reviewer invocations**. Operational cost (User attention для review approvals + reviewer dispatch coordination) substantial — verify capacity. Рекомендую **batch review per-TASK** (один discussion file per TASK с 4 reviewer sections) = 3 discussion files total, не 12. Cost amortizable.

- **Open Q #3 resolution** — flagged trade-off в HIGH #3. Vote conditional на acknowledgement trade-off в ADR amendment либо invest в parametrize. Currently недостаточно articulated.

### Hidden assumptions / undeclared dependencies

1. **Q4 ↔ Q9 coupling** (DEAL-BREAKER #2). Vote chain fragile.

2. **Q5 ↔ Open Q #3 coupling.** "Same Drift conventions as t115" + "preserve Clean directory layout" — две decisions linked invariantly (если Drift conventions diverge → directory layout может тоже). Не surfaced в teamlead's recommendation list.

3. **Q3=a "template-aware switches" mechanism unspecified.** DEAL-BREAKER #3 partial. Claude_1 caveat ("explicit boolean parameter / strategy enum, не implicit detection") direction-correct, но конкретный shape (constructor injection? config field? GenerationConfig extension?) undefined. Phase B executor will improvise → likely inconsistent across 3+ generator files.

4. **Q7=b TDD-first assumes simplified behavior fully spec'd** (HIGH #1). Spec'd via what? ADR-0005 generate-divider = file-presence level; behavioral tests need shape data emerging from prototype.

5. **`G:/Templates/flutter/simplified/` writability** (HIGH #2). Sandbox limit unverified.

6. **t115 tasks/ + configuration/ feature literals** в [relation_patcher.ts:18-19](file:///G:/Projects/vs_code_extensions/code-generator/src/features/generation/generators/relation_patcher.ts#L18). Refactor для simplified требует либо preserve Clean fixture entity names в simplified (= simplified inherit Clean's fixture entity choices; смешанные signals) либо decouple completely (= bigger refactor than teamlead estimated).

7. **Simplified template "first entity = Configuration" assumption.** TASK-B2 implicitly будет start с Configuration (matches sync_core 0.3.0 baseline + t115 first entity). Не stated explicitly in teamlead's plan. Если TASK-B2 starts с другой entity (например first FK-only entity для validate generate-divider не lookup-only) — different test scaffolding requirements. Lock в TASK-B2 acceptance: "TASK-B2 first entity = Configuration (sync_core baseline parity); subsequent entities (Phase C scope) test divider corner cases".

### Process / sequencing landmines

1. **Phase B TASK-B1 → TASK-B2 hand-off contract** (Claude_1 observation #1 правильно flag). Стратегия mitigation = TASK-B1 acceptance включает **B2 stub** validating contract — Claude_1 правильное направление. Reinforce: stub test demonstrates "core invokes simplified template path with template-aware switch parameter X → simplified template responds with file Y at path Z". Не wave-hand "interface complete".

2. **3 reviewer files × 3 TASKs = 12 review artifacts.** Q10 operational scaling concern (мой Q10 vote дополнение). Solution: per-TASK discussion file (3 total) с 4 reviewer sections внутри. Documented in Phase B initiation.

3. **closure-report.md Phase B section incremental fill** (HIGH #4). Process undocumented.

4. **CI single-suite operational risk** (HIGH #5). 3.5-5 weeks Phase B execution period с CI = all-pass-required → simplified bugs block t115 hotfix PRs.

5. **Phase A → Phase B transition User decision points.** Phase A had explicit Sub-A1 + Sub-A6 STOP-gates с 1 week SLA each = 2 weeks user-side. Phase B teamlead's estimate 3.5-4.5 weeks "mostly executor". Verify: User decision points zero? Я вижу minimum 2:
   - **Q4 vote resolution** (если teamlead → Q4=a, Claude_1 + ClaudeAdv → Q4=b): Decision section requires User tiebreaker. SLA?
   - **Q6 reduced markers vs iterate**: similar.
   - **DEAL-BREAKER #1 marker baseline correction**: requires TeamLead + User re-vote Q6.
   Realistic Phase B = ~4-5 weeks executor + ~1-2 weeks user-side decision gates = **5-7 weeks calendar**. Teamlead's 3.5-4.5 weeks framing optimistic; realistic 5-6 weeks. Hard ceiling 6 weeks (vs teamlead's 5).

6. **`<weight-build TASK>` placeholder replacement procedure undocumented** (HIGH #6).

### Recommendation

**Request changes** перед Phase B start. Concrete gates:

1. DEAL-BREAKER #1 fixed (Q6 re-framed against actual 13-marker baseline).
2. DEAL-BREAKER #2 fixed (Q4 vote → b, либо Q9 vote conditionally deferred с explicit acknowledgement).
3. DEAL-BREAKER #3 fixed (TASK-B1 acceptance lists concrete generator files refactor + estimate per-file).
4. HIGH #1-#6 addressed либо explicitly accepted as known risks с mitigation в task acceptance.

После fixes — Approve. Convergence direction sound (Phase B sequenced, location parallel, refactor focused, TDD-first, Open Q #1/#2 resolutions correct).

### Catch count: 6 deal-breakers/high + 7 hidden assumptions + 6 process landmines = 19 findings (≥1 threshold substantially exceeded)


---

## User_2 (CRITICAL stack-lock decision 2026-05-03)

**⚠ CRITICAL OVERRIDE — applies к всему Phase B-D + weight build:**

**Стэк t115 НЕ меняется без явного User approval.** Все package choices фиксируются от t115 baseline:

- **Riverpod** = `@riverpod` annotations (codegen-based) — same as t115. **Q4=a confirmed** by User explicit decision; Claude_1 + ClaudeAdv Q4=b prototype side-by-side recommendation **OVERRULED** (стэк lock = hard constraint, не subject to ADR-0005 Section 7.1 TBD reasoning). ADR-0005 amendment will reflect this как resolved decision.
- **Drift** as ORM — same as t115 (table per entity, DAO conventions per Q5=a).
- **Clean directory layout** = preserved (`lib/features/<feature>/data/datasources/local/tables/<entity>_table.dart` + `lib/core/sync/sync_queue_table.dart`). **Open Q #3 resolved:** preserve hierarchy, simplified философия НЕ flatten directory structure.
- **sync_core 0.3.0** as sync library — same package, mutation-first contract preserved.
- **Serverpod** as backend framework — same package.
- **Manifest markers** — Q6 reframe: stack lock implies same scheme as t115 (13 markers per ClaudeAdv evidence). Reduced set (Q6=b/d) **OVERRULED** unless future explicit User approval. Simplified template inherits same marker conventions.

**Что MUST update (НЕ stack change, version refresh):**

Все package versions нужно обновить к latest stable, **включая Serverpod**:
- `flutter_riverpod` + `riverpod_annotation` + `riverpod_generator` — latest stable
- `drift` + `drift_dev` + `drift_flutter` — latest stable
- `sync_core` — latest published version (0.3.0+)
- **Serverpod** — latest stable (`serverpod`, `serverpod_client`, `serverpod_flutter`, `serverpod_test_tools`)
- `freezed` + `freezed_annotation` + `json_serializable` + `json_annotation` + `build_runner` — latest stable
- `uuid` — latest stable
- Все остальные dev/runtime dependencies — latest stable

**Verify через Dart MCP** перед commit (per global CLAUDE.md "never guess library versions").

**Что simplified философия меняет (single permitted change category):**

Simplified template отличается от t115 **только в architecture ceremony**:
- ❌ NO usecases generation (CRUD = noise per ADR-0005 Section 3.2)
- ❌ NO business notifiers с custom logic generation
- ❌ NO validation rules generation
- ❌ NO repository interfaces по умолчанию (`--with-interfaces` flag default OFF)
- ❌ NO application services generation
- ❌ NO mappers как separate class (extension methods достаточно)
- ❌ NO Either/Result wrappers
- ❌ NO datasource interfaces

**Всё остальное** (Riverpod patterns + Drift conventions + directory layout + sync_core integration + manifest markers + DI style + Serverpod RPC pattern + build_runner workflow) **inherited from t115**.

**Updated convergence post-User_2 override:**

| Q | TeamLead initial | Claude_1 | ClaudeAdv | User_2 override | FINAL |
|---|---|---|---|---|---|
| Q1 | c | c | c | (no override) | **c sequenced 3 TASKs** |
| Q2 | a | a | a | (no override) | **a `G:/Templates/flutter/simplified/`** |
| Q3 | a | a | a (с realistic scope) | (no override; ClaudeAdv estimate revision accepted) | **a refactor + 2-2.5w TASK-B1 estimate** |
| Q4 | a | b | b | **a (stack lock)** | **a `@riverpod` annotations** |
| Q5 | a | a | conditional | (no override; stack-lock implies same Drift conventions) | **a Drift conventions same as t115** |
| Q6 | b | d | d | **a (stack lock — same 13 markers as t115)** | **a same marker scheme as t115** |
| Q7 | b | b | conditional | (no override; TDD-first OK для well-spec'd parts) | **b TDD-first** |
| Q8 | b | b | conditional | (no override; stack lock implies markers preserved → RelationPatcher applicable) | **a YES RelationPatcher** (revised from initial b due to stack lock — markers preserved) |
| Q9 | a | a | defer post Q4 | (Q4 resolved upfront → Q9 unlocks; stack lock implies same DI as t115) | **b Simplified inherits t115 DI pattern** (revised from a) |
| Q10 | b | b | b | (no override) | **b 3 thematic + 1 Adversarial per TASK** |
| Open Q #3 | preserve Clean | preserve | conflicts noted | **preserve (stack lock)** | **preserve Clean directory layout** |

**Estimate accepted from ClaudeAdv:** Phase B realistic 5-7 weeks calendar (4-5 executor + 1-2 user decision gates). Hard ceiling 7 weeks (revised from 4.5).

**Process additions accepted:**
- TASK-B1 acceptance: explicit zero-diff smoke test t115 generation на t164 (existing test project) — verify refactor не сломал
- TASK-B1 setup: PowerShell sandbox writability check для `G:/Templates/flutter/simplified/` (`mkdir test`, verify, cleanup)
- Per-TASK closure-report Phase B section update (incremental, не at-end)
- Multi-agent review file pattern (per-TASK с 3 thematic + 1 Adversarial = 4 reviewer invocations × 3 TASKs)
- `<weight-build TASK>` placeholder replacement procedure documented в Phase D acceptance (grep+replace в всех живых docs)

**Что меняется vs reviewers' recommendations:**

- Q4=a stays (stack lock overrides Q4=b)
- Q6=a stays (stack lock — same markers, no reduced set)
- Q8/Q9 reframed (stack lock implies markers preserved → RelationPatcher applicable; simplified inherits t115 DI)
- All other reviewer observations applied (sandbox check, zero-diff smoke, closure-report incremental, estimate revision)

**Готов finalize Discussion #11.** Convergence: 3 agents (TeamLead + Claude_1 + ClaudeAdv) + User stack-lock override = consolidated 12-point Decision.

---

## Decision

Финализирована 2026-05-03 после convergence 3 agents (TeamLead Claude + Claude_1 + ClaudeAdv) + **User_2 stack-lock override**.

**Phase B organization (12-point Decision):**

1. **Q1=c** sequenced 3 TASKs: B1 (codegen core multi-template infrastructure) → B2 (simplified template content) → B3 (tests + Open Questions resolution). Atomic per-TASK boundaries cleaner для implementation work.

2. **Q2=a** simplified template location = `G:/Templates/flutter/simplified/` parallel к existing t115. **PowerShell sandbox writability check obligatory** в TASK-B1 setup (mkdir test, verify, cleanup).

3. **Q3=a** refactor existing generators для template-aware switches. **Realistic scope per ClaudeAdv evidence** (hardcoded literals в `relation_patcher.ts:18-19,36`, `orchestrator_patcher.ts:42-48`, `app_database_generator.ts:21`): TASK-B1 estimate **2-2.5 weeks** (не 1-1.5).

4. **Q4=a `@riverpod` annotations** (codegen-based) — **stack lock User decision overrides** Claude_1 + ClaudeAdv Q4=b prototype side-by-side recommendation. Same Riverpod variant как t115 baseline. ADR-0005 Section 7.1 RESOLVED via stack lock (TBD removed).

5. **Q5=a** Drift conventions same as t115 baseline (table per entity, DAO method naming, FK references inline) — stack lock implies inheritance.

6. **Q6=a** Same marker scheme as t115 (13 markers per ClaudeAdv evidence-based correction, не 7 как initially документировано) — stack lock implies inheritance. Reduced marker set (Q6=b/d) **OVERRULED** by stack lock principle.

7. **Q7=b** TDD-first для simplified-suite tests. Nuance per ClaudeAdv: TDD applicable для well-spec'd parts (under stack lock = всё well-spec'd т.к. inherits t115 patterns); circular dependency concern moot since Riverpod variant + Drift + markers все resolved upfront.

8. **Q8=a YES RelationPatcher applicable в simplified** — revised from initial b due to stack lock (markers preserved → patcher applicable). `relation_patcher.test.ts` files re-classified `keep-universal` (apply both templates).

9. **Q9=b Simplified inherits t115 DI pattern** (`ConfigurationLocalApply(ConfigurationDao(dbService))` chain) — revised from initial a due to stack lock. `orchestrator_patcher.test.ts` re-classified `keep-universal`.

10. **Q10=b** 3 thematic reviewers (architecture / generator-core / test) + 1 Adversarial overlay per TASK. 4 reviewer invocations × 3 TASKs = 12 reviewer invocations total Phase B.

11. **Open Q #3 (test-inventory directory layout)** — preserve Clean directory layout (`lib/features/<feature>/data/datasources/local/tables/`) under stack lock. `app_database_generator.test.ts` 11 cases stay `keep-universal` (verdict no longer conditional).

12. **⚠ CRITICAL Stack-lock principle** — стэк t115 baseline (Riverpod через `@riverpod` annotations + Drift + Clean directory layout + sync_core 0.3.0 + Serverpod) НЕ меняется без явного User approval. **Все package versions update к latest stable** (включая Serverpod). Simplified философия меняет ТОЛЬКО architecture ceremony (NO usecases / business notifiers / validation / repository interfaces по умолчанию / app services / mappers separate class / Either-Result / datasource interfaces). Future Phase B-D decisions inherit this constraint; reviewers should flag stack changes как scope violations unless User explicitly approved.

**Process additions accepted (Claude_1 + ClaudeAdv observations):**

- TASK-B1 acceptance: explicit zero-diff smoke test t115 generation на t164 (existing test project) — verify refactor не сломал
- TASK-B1 setup: PowerShell sandbox writability check для `G:/Templates/flutter/simplified/`
- Per-TASK closure-report Phase B section update (incremental)
- `<weight-build TASK>` placeholder replacement procedure documented в Phase D acceptance

**Estimate accepted (ClaudeAdv revision):** Phase B realistic **5-7 weeks calendar** (4-5 executor + 1-2 user decision gates). Hard ceiling 7 weeks (revised from initial 4.5).

**Что меняется vs reviewers' recommendations:**
- Q4=a stays (stack lock overrides Q4=b)
- Q6=a stays (stack lock — same 13 markers)
- Q8/Q9 reframed (stack lock implies markers + DI preserved)
- All other reviewer observations applied (sandbox check, zero-diff smoke, closure-report incremental, estimate revision)

## Summary

**Контекст:** Initiative Phase A ✅ closed (PR #16, master `2438660`). Phase B — simplified template implementation (codegen core + simplified template content + tests + Open Questions resolution).

**Decision:** Phase B = sequenced 3 TASKs (B1 → B2 → B3), 5-7 weeks calendar, **под stack lock от t115 baseline**. ADR-0005 Section 7.1/7.2/7.3 TBD placeholders RESOLVED via stack lock decision. Open Questions #1/#2/#3 resolved as YES RelationPatcher / inherits t115 DI / preserve Clean directory layout. Per-TASK 4-reviewer multi-agent pattern (3 thematic + 1 Adversarial). Package versions update к latest stable (включая Serverpod) — НЕ stack changes, version refresh только.

**Что меняется vs Discussion #10 framing:**
- Discussion #10 Q7=e REJECT ("decisions emerge из B-D prototyping") explicitly OVERRULED by User_2 stack-lock decision — User имеет authority pre-decide stack inheritance, prototype нужен только если User не имеет existing baseline preference (он имеет — t115).
- Phase B estimate: 3.5-4.5 → 5-7 weeks (ClaudeAdv evidence-based correction).

**Risks documented:**
- Q3 refactor scope creep (mitigated via tight scope + zero-diff smoke + ClaudeAdv estimate revision)
- TDD circular dependency (moot under stack lock — patterns well-specified)
- PowerShell sandbox writability `G:/Templates/flutter/simplified/` (mitigated via TASK-B1 setup check)
- t115 regression (mitigated via CI gate + zero-diff smoke acceptance)
- Phase B scope creep к D (mitigated via Q3=a hard scope + per-TASK boundaries)

## Approved

✅ User approved 2026-05-03 (User_2 stack-lock override section + ok а acknowledgment).
