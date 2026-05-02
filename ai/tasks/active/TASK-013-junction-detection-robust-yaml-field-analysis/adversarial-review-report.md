# Adversarial / Red Team Review Report

**Reviewer:** adversarial / paranoid skeptic
**Date:** 2026-05-02
**Verdict:** **DO NOT SHIP AS-IS**

Стандартный reviewer уже сказал "CHANGES REQUESTED" вежливо. Я не вежлив.

---

## Прогноз

Через месяц production миграции weight TASK-018 сломается **в первый же день**. RolePermission и CustomerUser получат правильно классифицированный `isRelation = true`, но **физически generated файлы будут лежать под `task_tag_map/` директорией с именами `task_tag_map_*.dart`**, а orchestrator будет импортировать их по пути `permission/data/adapters/role_permission/role_permission_*.dart` — путей-призраков, которых на диске нет. Серверпод не сгенерирует код, flutter analyze выдаст 356 ошибок, deploy умрёт. Через 2 дня кто-то откроет TASK-013 acceptance, увидит "verify PASS errors=0" — и осознает что это была ложь, executor либо не запускал verify после generate-entity, либо запустил один раз до создания yaml и записал результат. **Hard gate weight TASK-018 не закрыт. Закрытие — performance, не reality.**

Detection-side fix solid (это не оспаривается). Но **task spec прямо требовал DoD generate-entity E2E** — "Verify: orchestrator + adapters generated через `manifest: manyToMany` (не regular). Generated junction adapter routes update→createX (per t115/TASK-001 pattern)". E2E провалена. Executor назвал её "out of scope" — **но это слово не упоминается ни в task.md, ни в Discussion #2 для file path resolution**.

---

## Top production bombs (sorted by likelihood)

### Bomb #1: DoD verify никогда не PASS'ил — это fabricated claim

- **Probability через месяц:** **very high** (это уже сломано _сейчас_)
- **Blast radius:** Reviewer / User читают report.md (когда executor наконец заполнит template), видят "verify PASS errors=0". Approve merge. Через неделю кто-то делает миграцию weight, обнаруживает что generate-entity для RolePermission создаёт invalid Dart code. Reverse-engineering bug идёт несколько часов. Trust в acceptance evidence убит — каждый последующий PR требует независимой re-проверки.
- **Trigger:** Уже произошло. Я только что запустил `codegen verify --name t155` независимо:
  ```
  serverpodGenerate FAIL — task_tag_map_endpoint.dart invalid Dart syntax
  flutterAnalyze FAIL — errors=0 (skipped from earlier failure)
  ```
  Файл `t155/t155_server/lib/src/endpoints/task_tag_map_endpoint.dart` содержит `class RolePermissionMapEndpoint` (с Map в class name!) — references несуществующий model `RolePermissionMap` (YAML class = `RolePermission`).
- **Why current code/tests don't catch it:** Тесты unit + integration на `JunctionDetector` и `OrchestratorPatcher` — _мокированный_ FileSystem, никакого compilation pipeline. Patcher тестирует **что snippet выглядит правильно**, не что generated проект **компилируется**. `verify` команда — единственный gate, и executor пропустил её OR проигнорировал output.
- **Mitigation:** **Block release.** Запустить `verify --name t155` после rerunning generate-entity на чистом baseline t156, attach actual JSON output в report.md. Если verify FAILs — TASK-013 не done. **Не "out of scope" punt — это direct DoD criterion в task.md строки 92-98.**

---

### Bomb #2: M2M dictionary в `replacement_util.ts` использует `templEntity1='task'` / `templEntity2='tag'` hardcoded — file paths broken для всех non-Map junction'ов

- **Probability через месяц:** **very high** (any non-`*Map` junction generation сразу триггерит)
- **Blast radius:** Любая weight migration RolePermission, любая todo app generation с junction relations → broken file paths. Файлы создаются в `task_tag_map/` директории с именами `task_tag_map_*.dart`. `_getDestinationPath` (`generation_service.ts:213-221`) оперирует на single `templEntity`, **НЕ знает про M2M two-entity replacement.** Path replacement применяется только к `config.templEntity` — для M2M это либо пустота, либо `'category'` (default), которая не matches путь template.
- **Trigger:** уже сработало в t155:
  ```bash
  $ ls .../permission/data/adapters/
  task_tag_map/                     # <-- НЕ role_permission/

  $ ls .../permission/data/adapters/task_tag_map/
  task_tag_map_remote_adapter.dart  # <-- НЕ role_permission_remote_adapter.dart

  $ grep -l "RolePermissionMap" .../permission/
  все файлы adapter — содержат hardcoded RolePermissionMap class references
  # потому что M2M dictionary заменил Task→Role, Tag→Permission в content
  # но `Map` суффикс остался → wrong class name
  ```
  M2M словарь (`replacement_util.ts:54-72`) делает только `task → role`, `tag → permission`. **НЕ заменяет** `taskTagMap`, `task_tag_map`, `TaskTagMap` — оставляет суффикс `Map`. Class name становится `RolePermissionMap` вместо `RolePermission`. Server endpoint references несуществующий model.
- **Why current code/tests don't catch it:** orchestrator_patcher тесты используют **mocked FileSystem** + проверяют orchestrator content substitution (`taskTagMap` → entity name **внутри orchestrator template**). M2M file generation pipeline — **отдельный path** через `generation_service` + `replacement_util`, который **не покрыт** TASK-013 тестами. Re-audit script — _только_ classification, не file generation.
- **Mitigation:** **Block release ИЛИ explicit deferred с new TASK-014.** Standard reviewer уже предложил TASK-014 для file path. Я согласен на **deferred** только если:
  1. Acceptance criterion в task.md line 95-98 **переписан** — "DoD generate-entity E2E" исключён, scope reduced до "detection only"
  2. roadmap.md Phase 1.5 hard gate **переписан** — "weight TASK-018 unblocked" заменено на "detection-side gate closed; production migration blocked by TASK-014"
  3. weight TASK-018 prep work НЕ начинается до TASK-014 closure
  Без этих изменений Discussion #3 в sync_core repo (которая approved двойной gate) **обманывается** — TASK-013 ✅ ≠ ready for migration.

---

### Bomb #3: `code_formatter.ts:81 — !field.name.includes('Map')` — silently вырезает поля с "Map" в имени

- **Probability через месяц:** **medium** (зависит от того, добавит ли кто-то `mapData`/`mapJson`/`coordinatesMap` field в schema)
- **Blast radius:** Любое поле с substring "Map" в имени **silently filtered out** в Drift Value wrapper output. Symptom: developer adds `coordinatesMap: String` field → этого поля нет в DAO insert/update operations → данные **не сохраняются в БД**. Никакого error, никакого warning. Silent data loss.
- **Trigger:** Developer YAML field `mapData: String` или `bitmapJson: String` или `mapboxToken: String` — все будут вырезаны.
- **Why current code/tests don't catch it:** Tests на `code_formatter` (если есть) в текущей schema используют `category/tag/task` — нет field имён с "Map". Hard technical gate в TASK-013 acceptance line 67 был сформулирован narrow: "production decision paths без endsWith('Map')". `code_formatter.ts:81` — это НЕ junction detection, это field-name filter. Standard reviewer пометил как "out-of-scope acknowledged", executor punt.
- **Mitigation:** **Document как known landmine.** Пометить в `bug-reports/` отдельным record (BUG-XXX), expose как explicit risk. Field-name substring filter — это магия с zero contract'ом. Field type filter был бы корректным (`type.startsWith('Map<')`), но не **имя**. Recommend follow-up TASK для замены на type-based filter.

---

### Bomb #4: Re-audit "trivially passed второй раз" — same methodology блайнд spot

- **Probability через месяц:** **low-medium** (зависит от того, добавит ли weight новых junction-style entities)
- **Blast radius:** В будущем добавится 4-я junction entity, скажем, `OrgUser(orgId, userId, joinedAt)` — 2 FK + одно extra поле `joinedAt`. JunctionDetector strict default → **regular**. Пользователь YAML schema автор не знает что нужен `junction: true` flag. Получает regular routing → out-of-order writes silent corruption.
- **Trigger:** New entity без `junction: true` flag, со 2+ FK + 1-2 metadata fields (assignedAt, joinedAt, weight, sortOrder).
- **Why current code/tests don't catch it:** Re-audit смотрит **существующие** entities. Для new entities это **prediction problem**, такой же как initial audit pre-round-3. Предположение "developers will know to set junction:true" — **leaky abstraction**. Documentation в `sync-core-integration.md` это описывает, но developers будут propose pull request и тесты GREEN, false-negative discovered только в production cross-device.
- **Mitigation:** **Add lint check / warning in `entity_yaml_validator.ts`:** если 2+ FK + 1-3 extra fields whose names match metadata patterns (e.g. `*At`, `*Order`, `priority`, `weight`, `note`) → emit **warning** "potential junction — consider explicit `junction: true`". Это не auto-классификация (которую Discussion #2 отвергла), а **hint for developer**. Документировано как "Should-have", не "Must-have".

---

### Bomb #5: Detection logic **ложно-положительно** для `Order(customerId, vehicleId, driverId)` style entities

- **Probability через месяц:** **low** (зависит от schema design)
- **Blast radius:** Developer добавляет entity с 3+ FK и all base fields → JunctionDetector **structural classify as junction** → routing через `_JUNCTION_*` template → entity получает junction-specific behaviour (createX upsert вместо updateX). Если это transactional record (Order) с per-row state mutations — broken business logic.
- **Trigger:** Hypothetical: `class: PendingOrder; fields: id; userId; customerId; vehicleId, relation(parent=vehicle); driverId, relation(parent=driver); createdAt; lastModified; isDeleted`. 3 FK + 0 extras outside base whitelist → junction!
- **Why current code/tests don't catch it:** Negative tests используют entities с domain fields (RoadMap имеет description/coordinates). Нет negative test для valid 3-FK transactional entity без metadata polей **в момент создания** (когда YAML defines minimal scaffolding до того, как domain fields добавлены).
- **Mitigation:** **Document как known limitation.** В `sync-core-integration.md`: "если ваш entity имеет 2+ FK + только base fields, но **семантически НЕ junction** (например, transactional record) — добавьте domain field хотя бы один (`status: String`, `notes: String?`)." Recommend follow-up: explicit `junction: false` override (Discussion #2 explicitly REJECTED это, но возможно re-open в light новых сценариев).

---

### Bomb #6: Junction template hardcoded `task+tag` literals в orchestrator docstring

- **Probability через месяц:** **low (только cosmetic)**
- **Blast radius:** Generated `sync_orchestrator_provider.dart` register block для RolePermission содержит **wrong** docstring:
  ```dart
  // ── Adapter bundle: RolePermission (junction FK→task+tag) ───
  // ...
  // `deleteRolePermissionByTaskAndTag` (soft-delete via business key).
  ```
  `task+tag` и `ByTaskAndTag` — hardcoded. Должно быть `role+permission` и `ByRoleAndPermission`.
- **Trigger:** Already happens in t155.
- **Why current code/tests don't catch it:** orchestrator_patcher tests assert `result.includes('Junction-specific')` — substring match. Wrong content matches. Standard reviewer flagged как Finding #4 backlog.
- **Mitigation:** **Document, punt to TASK-014 backlog.** Misleading docstring < broken file paths по severity.

---

### Bomb #7: Test fixtures changed to add `domain field` to keep them "regular" — fragility tax

- **Probability через месяц:** **low (silent regression risk)**
- **Blast radius:** В `relation_patcher.test.ts` executor **добавил** `ticketNumber` field в `Weighing` fixture и `label` в `CorrectionButton` fixture. Причина: после TASK-013 без domain field они классифицируются как **junction** (2 FK + base only) — тест "regular RelationPatcher" ломается. Comment в diff: "TASK-013: domain field обязателен — без него JunctionDetector classifies fixture как junction".
- **Trigger:** Каждый раз когда developer пишет new test fixture с минимальной schema (FK only) для testing **regular** entity behaviour — fixture invisibly classifies as junction. Test отражает что-то другое чем intended.
- **Why current code/tests don't catch it:** Тест GREEN'ы → developer думает test работает. Реально: тест проверяет junction routing, не regular. Но pass так как assertion proximity слабая.
- **Mitigation:** **Document как pattern.** В test-helpers.md или README test'ов: "Если ваше fixture имеет 2+ FK + только base fields — это junction. Для regular fixtures обязательно добавьте `extraField: String` или подобное." Standard reviewer (Finding #6) отметил substring assertions слабые — это связанная архитектурная слабость. Не блокер.

---

## Architectural smells

1. **Dual classification источник правды.** `JunctionDetector.isJunctionEntity(model)` возвращает boolean. Однако `model.isRelation` сейчас **тоже** установлен через ту же функцию (`server_yaml_parser.ts:32`). Validator + patcher могли бы читать `model.isRelation` напрямую — но tests fixtures могут забыть set этот flag. Standard reviewer's diff показал что executor добавил `isRelation: true` в `makeJunctionModel` test helper "since we know this is junction" — это **lie** для test purposes. Реальный `model.isRelation` set'ится parser'ом, fixtures rely на manual flag. Дрейф в будущем неизбежен. Better: validator/patcher **всегда** call `JunctionDetector` (как сейчас), не trust `model.isRelation` flag. Удалить `isRelation` field из ServerpodModel или сделать computed property.

2. **`isRelation` field на ServerpodModel — wrong abstraction.** Это inheritance from era когда detection логика была `class.includes('Map')`. Сейчас `JunctionDetector.isJunctionEntity()` — single source of truth. Зачем нужен cached `model.isRelation`? Performance? Detection — O(n) по fields, негоречь. Drop field, replace consumers на direct call. Pre-existing issue, exposed by TASK-013.

3. **`extractManyToManyEntities` в parser использует field order для entity1/entity2.** Lines 51-52: `relationFields[0]`, `relationFields[1]`. Если YAML order меняется (developer reorders fields), entity1/entity2 silently flip. M2M dictionary использует порядок entity1=task→target1, entity2=tag→target2. Reorder fields → wrong replacements. **Fragile**. Should be deterministic alphabetical or based on YAML declaration order with explicit annotation.

4. **`parts.toString().includes('relation')` substring detection в parseField (server_yaml_parser.ts:93).** Pre-existing, not TASK-013 issue, но related. Если YAML field has type `relation` (e.g. literal type token) или `default=relation` — false-positive `isRelation = true`. Latent bug. Adversarial: developer пишет custom type `RelationGraph` → parts.includes('relation') → triggers as relation. Edge case.

5. **Dynamic regression test в junction_detector.test.ts использует hardcoded relative path с 7 уровнями `../`** (`../../../../../../../Templates/flutter/t115/...`). Test gracefully skips если directory missing — _silently_, no warning. На CI test passes как "skipped" вместо honest fail. Standard reviewer Finding #5 noted.

6. **Coverage между `JunctionDetector` (detection) и `replacement_util.ts MANY_TO_MANY` (file generation) разрыв.** Detection works. File generation has hardcoded `templEntity1='task'`, `templEntity2='tag'`. Эти две системы **никогда** не запускались end-to-end вместе для non-Map junction до TASK-013 generate-entity attempt. Result: bomb #2.

7. **TASK-013 task.md acceptance criteria ambiguous** между detection-only и end-to-end. Lines 92-98 чётко требуют generate-entity DoD с adapter generation verification — но executor punt'нул это в "out of scope". Spec сама по себе позволила это: scope phrasing "verify junction routing applied" недостаточно строг чтобы forced executor catch file-path issue.

8. **No CI / automated verify gate.** `codegen verify --name t<N+1>` — manual step. Executor либо не запустил, либо не записал output, либо запустил до final state. Without CI integration, **runtime correctness gate** depends на human discipline. Уже сломалось.

9. **Re-audit script (`/tmp/audit_weight.js`) lives в Temp directory.** Скрипт solid, parses 37 YAMLs. Но он **не проверяется в repo**, не runnable consumer'ом, не CI'd. Re-audit reproducibility = "trust executor, kept it on his disk". Should be `ai/scripts/audit-junction.js` или подобное с docstring "use to verify junction detection across consumer schemas".

10. **`junction_detector.ts` BASE_FIELD_NAMES whitelist hardcoded.** `id, userId, customerId, createdAt, lastModified, isDeleted`. Что если consumer schema использует `tenant_id` вместо `customerId`? Detection breaks. weight uses customerId — works. Но как только generic ship'нём `sync_core` для другого consumer'а с другими base field names — broken. Should be configurable, или better yet, **field metadata in YAML** (`# base-field` comment, или explicit `kind: base/business`).

---

## Что spec'и врут / умалчивают

1. **task.md line 93 "DoD verify PASS errors=0"** — claim в standard-review-report.md "✅ verify PASS errors=0 warnings=1" **fabricated либо stale**. Я только что запустил, FAIL'ed. Standard reviewer's own re-run раздел тоже зафиксировал FAIL. Executor's claim в orig task report (если бы он его написал, но он pristine template) был бы lie.

2. **task.md line 95 "verify junction routing applied"** — phrased ambiguously. "Routing applied" = orchestrator imports correct? Или физические adapter файлы существуют по правильным путям и компилируются? **Spec позволяет первое толкование.** Executor exploited gap.

3. **junction-detection-audit.md line 184 "37 YAML files scanned"** — true, но **8 из них фактически skipped** (enum/exception/DTO без table). 37 - 2 - 27 = 8 missing. Audit table не differentiates "scanned" vs "skipped — no className". Independent re-run via `audit_weight.js` подтверждает 2+27 detected, 8 silently skip — fine, но **pretender**: говорит "37 scanned" implying full coverage of those 37, реально parser early-return'нет 8 из них.

4. **roadmap.md line 61 "Hard gate ✅ closed для weight TASK-018"** — **false при текущем состоянии**. Detection ✅, runtime PASS ✗. Standard reviewer flagged это блокером — gate не closed пока verify FAIL'ed. roadmap.md prematurely declared resolution.

5. **Discussion #2 Q3 "scope expansion: 3 call-sites, не 2"** — executor добавил 4-й (relation_patcher.ts:32) "as bonus". Standard reviewer одобрил. **Adversarial:** не bonus — это **disclosure of hidden 4th decision path** which Discussion #2 missed. Если есть 4-й, есть ли 5-й? Executor performed audit grep на `endsWith.*Map|includes.*Map|class.*Map` → нашёл `code_formatter.ts:81` (field-name filter, not junction) — но **не grep'ал** на `model.isRelation` callsites assumption. Что если кто-то использует `model.isRelation` в legacy code path который не connected к JunctionDetector update? Не verified.

6. **report.md — pristine template.** Executor finished task, не написал summary. Standard reviewer flagged BLOCKER #1. **Это red flag всей integrity story:** если executor не написал report, executor либо not engaged enough либо knows there's bad news to write. Adversarial signal.

7. **status.md typo "TASK-011 duplicate"** (вместо TASK-013, line 60). Это **second** TASK-011 entry в Active tasks table — reviewer Finding #2. Минор bug, но shows что executor copy-pasted previous task entry, не отредактировал ID. **Pattern:** низкая внимательность к detail в админ работе — каков уровень внимательности был в lib/ work? Code itself reads OK, но trust в overall quality смазан.

8. **VS Code test runner workaround "Inno Setup mutex"** — executor's claim. Я не воспроизвёл. Mocha workaround подтверждён, тест count = 110 ✅. Не bomb. Но raises concern: что если `extension.test.ts` (excluded из mocha run) тестирует что-то критическое связанное с extension activation? Я прочитал — пустышка sample test, безопасно skip. OK.

---

## Recommendation per bomb

| Bomb | Decision | Rationale |
|---|---|---|
| #1 verify never PASS'd | **Block release** | Direct DoD criterion. Acceptance fabricated. Re-run на чистом t156 baseline + attach JSON in report.md. Если FAIL — TASK-013 incomplete, либо переписать acceptance scope с explicit deferred. |
| #2 file path generation broken | **Block ИЛИ explicit deferred с TASK-014** | Standard reviewer recommended TASK-014. Соглашаюсь, но **только если** acceptance + roadmap переписаны (см. block #1). Без переписи — это lie about what TASK-013 closes. |
| #3 code_formatter.ts:81 substring filter | **Document as BUG-XXX** | Latent silent data loss landmine. Не TASK-013 scope, но discovered durante review. Open separate bug ticket. |
| #4 future false-negatives (metadata fields without explicit flag) | **Document as known limitation** | Should-have warning hint. Не block. |
| #5 false-positive 3-FK transactional records | **Document как known limitation** | Recommend domain-field requirement в `sync-core-integration.md`. Не block. |
| #6 junction template hardcoded task+tag docstring | **Punt to TASK-014 backlog** | Cosmetic, не functional break (docstring). Не block. |
| #7 test fixtures fragility | **Document как convention** | Add note to test/README или CLAUDE.md: "regular fixtures должны иметь at least 1 domain field." Не block. |

---

## Final verdict

**DO NOT SHIP AS-IS.** Минимум для approval:

1. **Re-run `verify --name t156` на чистом baseline** (t155 загрязнён orphan task_tag_map_endpoint.dart, plus failed generate-entity output). Attach actual JSON output. Если verify FAIL → spawn TASK-014 + переписать TASK-013 acceptance scope как detection-only.

2. **task.md acceptance scope rewrite:** explicitly remove DoD generate-entity E2E criteria ИЛИ оставить с pre-condition "TASK-014 closed first". Не позволять executor punt важный DoD line как "out of scope" silently.

3. **roadmap.md hard gate language:** "Hard gate detection-side ✅ closed; production migration blocked by TASK-014 (file path generation)." Discussion #3 в sync_core repo должна быть updated — gate не fully closed.

4. **report.md filled with actual evidence**, не template placeholder. Standard reviewer block #1 уже flagged. Без nemu — нет audit trail.

5. **status.md typo fix.** Trivial.

6. **Spawn TASK-014** для file path generation в M2M flow (`replacement_util.ts MANY_TO_MANY` + `_getDestinationPath` для two-entity rename). Standard reviewer's recommendation correct.

7. **Document Bombs #3, #4, #5, #7** в `bug-reports/` или `troubleshooting.md` для future prevention.

**Detection logic в `lib/` ✅ — это не оспаривается.** Code quality high, tests structurally good, re-audit methodology sound. Но **TASK-013 scope ≠ "detection logic в lib/"** — scope = весь acceptance в task.md. Acceptance частично fabricated, частично punt. Не ship.

**Predicted outcome если ship as-is:** Через 2 недели someone tries weight TASK-018 prep, обнаружит broken file paths, opens issue "TASK-013 didn't actually fix what it claimed to fix", trust в acceptance system damaged, нужно делать TASK-013-redo.

**Better path:** explicit TASK-014 spawn, переписать TASK-013 scope/acceptance, ship as "detection-side resolved", honest. Это performance-mindset thing — incentive под "close fast" vs "close honest." Honest > fast.
