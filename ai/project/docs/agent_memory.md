# Память агентов

Операционные факты для AI-агентов.
**Агенты ОБЯЗАНЫ читать этот файл при каждой сессии.**

**Последнее обновление:** 2026-06-05 (**BUG-027 + TASK-035 merged — master `80346ac`**, 303 tests; **первая runtime end-to-end валидация t205**; VS Code extension собран+установлен). BUG-027 root cause в первичном bug-report был неверен (bare `relation` → `isRelation=false`) — см. gotcha. TASK-035: удалены избыточные `Map`-эвристики. Новые gotchas: runtime smoke runbook + Serverpod phantom FK; extension install/update + UI `vsce` hardcode; UI createDataFiles = source-only. Новое: `--ceremony full|minimal` (BUG-023 Design 1). **Full pipeline re-checked на t204** (create-project + full + FK many-to-one + minimal + junction → verify errors=0). Audit-guards: BUG-024 (reserved Drift column-имена) + BUG-025 (orchestrator no-op fail-fast). **Open backlog:** BUG-027 (one-to-many back-relation→InvalidType, fix готов 1 строка) + BUG-026→TASK-015 + BUG-005 + BUG-015. См. новые gotchas ниже. Готовность к weight regen: HIGH. Lessons: `--feature-path` full absolute path (TASK-031); `--with-server` opt-in (TASK-029); junction same-feature works (t201); one-to-many = child-FK-only, parent без flutter back-relation (BUG-027).

---

## TL;DR проект (handoff context для нового teamlead)

**Что это.** VS Code расширение + CLI `codegen` для генерации Serverpod/Flutter монорепо из шаблона t115 + микросервисов (Python/Node/Go).

**Стек проекта (⚠ CRITICAL — locked per Discussion #11 User decision 2026-05-03):**
- Codegen src/ — TypeScript, ~3000-4000 LOC, 163 unit tests
- Шаблон t115 — отдельный git репо (`devabacus/t115`), **deprecated path** (frozen, removal 6-12 месяцев)
- sync_core 0.3.0 — отдельный pub package (`devabacus/sync_core`), outbox-first multi-entity sync
- Сгенерированные test projects: `G:/Projects/Flutter/serverpod/t<N>/`
- **Stack lock:** Riverpod через `@riverpod` annotations + Drift conventions + Clean directory layout + sync_core 0.3.0 + Serverpod = locked package set; package versions update к latest stable (включая Serverpod) — НЕ stack changes

**Текущая фаза:** Phase 1.5 + Phase A ✅ CLOSED (2026-05-03); Phase B Discussion #11 ✅ archived; **ready for TASK-B1 creation**. См. [status.md](status.md) и [roadmap.md](roadmap.md).

**Architectural pivots (consolidated 2026-05-03):**
- **Discussion #7** Multi-template plurality (informal) → formalized в **ADR-0005**
- **Discussion #9 + clean-slate amendment** — weight v1 НЕ в production, fresh build, no dual-running concerns, no cutover, t115 deprecated path, default template = simplified
- **Discussion #11 + ⚠ CRITICAL stack-lock User decision** — стэк t115 baseline locked, package versions update к latest stable. Section 7.1/7.2/7.3 TBD placeholders RESOLVED via stack lock. Open Q #1/#2/#3 resolved as YES RelationPatcher / inherits t115 DI / preserve Clean directory layout.

---

## Архитектура codegen (минимум)

```
adapters/cli  ─┐
               ├─→  features/generation  →  templates t115  →  target project
adapters/vscode┘    + core services
```

- **`src/core/*` НЕ импортирует `vscode`.** Если нужно — lazy `require('vscode')` с fallback.
- **`src/adapters/cli/*`** — commander-based, 11 команд. Entry: `out/adapters/cli/index.js`. JSON в stdout (default), human-readable с `--human`.
- **`src/adapters/vscode/*`** — 11 команд, регистрируются в `extension.ts`.
- **`src/features/generation/*`** — entity-генерация: парсер YAML → модель → словарные замены + section-генераторы → файлы.

Подробно: [architecture.md](architecture.md).

---

## Шаблон t115 — критические инварианты

### Manifest маркеры

```dart
// manifest: startProject     → копируется при create-project
// manifest: entity           → шаблон для entity-генерации
// === generated_start:base ===  ...  // === generated_end:base ===   → merge-блок
// === generated_start:oneToManyMethods ===  ...  → relation-блок (один на файл)
// === generated_start:driftTableColumns ===  ...
```

**Файл без `// manifest:` маркера → MarkerAnalyzer ставит `ignore` → НЕ копируется.** Частый источник багов.

### Markers consumers (`:oneToManyMethods` — 7 layers, verified Discussion #6)

1. `domain/repositories/<entity>_repository.dart` (interface)
2. `data/repositories/<entity>_repository_impl.dart`
3. `data/datasources/local/interfaces/<entity>_local_datasource_service.dart`
4. `data/datasources/local/datasources/<entity>_local_data_source.dart`
5. `data/datasources/local/daos/<entity>/<entity>_dao.dart`
6. `domain/usecases/<entity>_usecases.dart`
7. `domain/providers/<entity>/<entity>_usecase_providers.dart`

DAO column refs идут через `relation_patcher` (НЕ hardcoded inheritance).

### Обязательные поля entity YAML (TASK-009/BUG-004)

`userId: int`, `customerId: UuidValue, relation(parent=customer, ...)`, `isDeleted: bool, default=false`, `createdAt: DateTime`, `lastModified: DateTime`.

Парный `<table>_sync_event.spy.yaml` обязателен. Junction (`*Map` или 2+ FK + base only — `JunctionDetector.isJunctionEntity()`) — пропускают валидацию.

### Sync_core 0.3.0 паттерн в шаблоне (TASK-011)

- `lib/core/sync/` — 5 source файлов (manifest: startProject)
- Per-entity adapters — 5 файлов в `lib/features/<feature>/data/adapters/<entity>/`: remote_adapter, pull_adapter, event_adapter, payload_codec, local_apply
- Configuration baseline (singleton сущность)
- Mutation-first Repository: `_db.transaction { dao.insert + orchestrator.enqueue }` атомарно

Orchestrator wire-up патчится через `OrchestratorPatcher` (3 marker блока: `:syncImports`, `:syncEntityTypes`, `:syncRegistrations`).

---

## Главные инварианты генератора

### 1. relation_patcher (TASK-008/BUG-003 + TASK-017)

- **Один marker-блок `:oneToManyMethods` на файл.** Все relation-методы внутри.
- **Идемпотентный.** Повторный gen с тем же YAML → identical content.
- **Approach A substitution sequence (TASK-017):**
  1. Step 1: ENTITY rules для mainEntity (Task → targetClass)
  2. Step 2: **field-Id preservation FIRST** (lowerCamel `templateRelatedEntity`Id → `targetIdName` + Pascal variant) — preserves field name в method/parameter/column refs
  3. Step 3: ENTITY rules для relatedEntity (Category → targetParent — переписывает оставшиеся `Category`/`category` literals для table refs)
- **NOT god service:** DAO + Repository (sync boundary) + sync adapters остаются отдельными layers
- **FK alias supported** (TASK-016): `relation(parent=X)` directive parsed, snake→camel via `snakeToLowerCamelCase` helper. Defensive fallback `name.endsWith('Id') ? name.slice(0, -2) : name`.

### 2. Файловые имена — snake_case (TASK / BUG-002)

Multi-word entity (`CorrectionButton`) → файлы `correction_button_dao.dart`, папки `correction_button/`. Class names — camelCase: `CorrectionButtonDao`. Path context wraps `relatedModel` в `toSnakeCase()` (relation_generation.ts:19).

### 3. AppDatabaseGenerator (BUG-005 + BUG-008 fix, TASK-011 Phase D5)

Scan `<flutterLib>/features/*/data/datasources/local/tables/*_table.dart` + жёстко прописанный `core/sync/sync_queue_table.dart` (sync_core integration). Migration **append-only** (BUG-006 fix).

### 4. Что НЕ генерируется автоматически

- **UI-фабрики, формы, widget-тесты, helpers** — codegen их не патчит.
- **Кастом sync hooks** в `sync_orchestrator_provider.dart` (Hook 5+) — patcher трогает только 3 marker блока.

---

## Жёсткие правила (выжимка)

### Definition of Done (для изменений в генераторе или шаблоне t115)

```bash
node out/adapters/cli/index.js verify --name <test_project> --human
```

**Должен PASS errors=0.** Цитировать `errors=N, warnings=M` в ответе. Запрещены формулировки "вроде работает", "должно скомпилироваться".

Если verify FAIL → починить генератор → создать `t<N+1>` (политика "новый t<N+1> на каждый фикс"). **НЕ патчить руками** target проект.

### Multi-agent code review pattern (validated через 3 deal-breaker catches: PR #6 / #8 / Discussion #6)

**Обязателен** для major TASK (parser fix, substitution rewrite, template architecture changes). Standard + Adversarial fresh subagents через Agent tool. Применяется до commit'а.

### Pre-implementation Discussion (validated через Discussion #5/#6/#7/#8)

**Обязателен** для high blast radius changes (parser, substitution, template, architectural pivots). Эскалация через `discuss.py new`, agents respond через prompts file. Saves hours of rework.

### Git

- НЕ коммить без явного "коммить" от пользователя
- Conventional Commits, на русском, БЕЗ `Co-Authored-By`
- Feature branches → PR → squash merge through `task.py`
- Никаких merge без явного одобрения User

### MCP инструменты

- **Dart MCP** (`mcp__dart__*`) — N/A, проект TypeScript. STOP-gate если используется.
- **Bash CLI** для всех проверок: `npm run compile`, `npm test` (mocha workaround per task), `npm run lint`, `node out/adapters/cli/index.js verify`

### Окружение Windows

- Bash в Claude Code — Git Bash. Команды `flutter`/`serverpod`/`idf.py` через PowerShell wrapper.
- В цепочках команд PowerShell — `;` вместо `&&`.

### Test-проекты — incremental numbering, агент НЕ удаляет (HARD RULE)

Sandbox блокирует `rm -rf` в `G:/Projects/Flutter/serverpod/t<N>/` — это намеренно, не bug. **НЕ workaround через PowerShell wrappers / cmd / node child_process.**

При failed `t<N>` → использовать `t<N+1>`. User удалит когда сочтёт нужным.

### Tasks/discussions — ТОЛЬКО через python скрипты (HARD RULE)

```bash
python ai/core/scripts/new_task.py "название"           # создать TASK
python ai/core/scripts/task.py start <branch>           # feature branch
python ai/core/scripts/task.py pr                       # push + PR
python ai/core/scripts/task.py merge [-y]               # merge after CI
python ai/core/discussions/scripts/discuss.py new       # discussion
python ai/core/discussions/scripts/discuss.py close <N> # archive
```

**Запрещено** создавать `ai/project/tasks/active/TASK-XXX-*/task.md` или `ai/project/discussions/active/N-*.md` через `Write` tool вручную.

**HOTFIX-001 closed:** `new_task.py` сканирует `active/ + done/ + blocked/` — auto-ID больше не конфликтует с merged tasks.

---

## Architectural pivot decision (Discussion #7, 2026-05-03)

**Decision:** Multi-template plurality. t115 → legacy/advanced. New "Simplified Template Initiative" — standalone parallel track. weight stays на t115 для TASK-018 production migration.

**Critical insight:** Не Clean плоха, а её automatic generation для каждого CRUD method. Generated CRUD usecases = architectural noise. Generator должен генерировать infrastructure boilerplate, business layer = manual.

**Generate vs не-generate divider:**
- **Generate:** Drift table, DAO, Repository impl, sync_core adapters (5 files), Riverpod data providers, mappings (`toEntity`, `toModel`)
- **Do NOT generate:** Usecases (CRUD = noise), application services, notifiers с business logic, validation rules
- **Optional via CLI flag:** Repository interface (`--with-interfaces`, default OFF)

**Mixed-template rule:** single template per feature internally, multi только на bounded context boundary.

**Sync_core integration check** mandatory в design phase Initiative.

См. [Discussion #7 archive](../discussions/archive/7-clean-architecture-overhead-стоит-ли-упр/) для full reasoning.

---

## Approved sequence (Discussion #9, 2026-05-03 — supersedes #8)

**Pivot:** weight v2 fresh build на simplified template. **TASK-018 cancelled (superseded).** weight v1 = critical-only production baseline.

**Priority rule:** Phase A-D gate blockers > Initiative Phase E-G > non-triggered backlog. STOP-gate protocol для concrete production blockers. Hard ceiling action = scope cut, не extend.

**Next steps:**
1. ✅ TASK-019 closure done (Phase 1.5 ceremony)
2. ✅ HOTFIX-001 closed — `new_task.py` scan active/ + done/ + blocked/
3. ✅ TASK-CI-001 closed via TASK-020 — minimal single-job CI ([.github/workflows/test.yml](../../../.github/workflows/test.yml)): compile + lint + 163 unit tests. 3-suite split (universal + t115 regression + simplified) deferred to Phase A test inventory audit deliverable.
4. ✅ **Initiative Phase A (TASK-021 merged PR #16, master `2438660`)** — Discussion #10 archived (4-agent convergence, 13-point Decision). [ADR-0005 promoted + accepted](decisions/adr-0005-multi-template-plurality.md): multi-template plurality + simplified architecture + generate-vs-not-generate divider + Phase C amendment clause + TBD placeholders RESOLVED via stack lock. 3 audits ✅. Sub-A5 4 reviewers → 49 findings (5 CRITICAL/DEAL-BREAKER + 14 HIGH applied). **Clean-slate amendment 2026-05-03:** weight v1 НЕ в production → dual-running concerns N/A; t115 deprecated path; estimate ~3-4 months. **⚠ CRITICAL Stack-lock decision 2026-05-03 (Discussion #11):** стэк t115 baseline (Riverpod `@riverpod` annotations + Drift + Clean directory layout + sync_core 0.3.0 + Serverpod) НЕ меняется без явного User approval; package versions update к latest stable (включая Serverpod); simplified философия = ТОЛЬКО architecture ceremony reduction. Open Q #1/#2/#3 resolved as YES RelationPatcher / inherits t115 DI / preserve Clean directory layout.

5. 🟡 **Initiative Phase B (Discussion #11 in progress)** — TeamLead initial position + Claude_1 + ClaudeAdv responded; User_2 stack-lock override applied. Awaiting finalize Decision + TASK-B1 creation. Phase B sequenced 3 TASKs (B1 core infra → B2 simplified content → B3 tests + Open Qs), estimate 5-7 weeks calendar (revised from 3.5-4.5 per ClaudeAdv evidence).
5. Initiative Phase B-D (generate-vs-not-generate divider + synthetic t<200> reference + `--template` CLI flag)
6. **Phase A-D gate close** (5-deliverable checklist + `closure-report.md` TeamLead + User counter-sign)
7. **`<weight-build TASK>`** (only after Phase A-D gate closed; новый cross-repo TASK; NB: TASK-020 уже занят CI gate, weight v2 получит next available ID через `new_task.py`)
8. Initiative Phase E-G (acceptance + documentation reconciliation + closure)
9. Cutover prep basic в `<weight-build TASK>` closure (full execution = separate later TASK)

**Estimate:** 5-6 months calendar realistic, 6 hard ceiling.

**Decision matrix v1 maintenance:**
- Data loss/security/sync corruption → fix v1 immediately
- UI bugs/performance regression → defer (cosmetic для frozen app)
- New features → reject (v2 backlog)

**Backend strategy (Phase A first decision):** Recommend Option 1 (same backend) default. Option 2 (forked) только если schema redesign. Option 3 (fresh) — overkill.

См. [Discussion #9 archive](../discussions/archive/9-weight-v2-fresh-build-на-simplified-temp/) + [roadmap.md](roadmap.md).

---

## Gotchas / Подводные камни (essential only)

### `generate-entity --ceremony full|minimal` (BUG-023)

⚠ Флаг `--ceremony` (default `full`), ортогонален `--with-interfaces`. `minimal` вырезает `usecases` + `usecase_providers` (Discussion #7: noise = только usecases) и переключает presentation (`state_providers`, `get_by_id_provider`) на прямой вызов repository через `.minc`-варианты шаблона. **ds-интерфейсы / repository_impl / data_providers НЕ трогаются** (by design — дублировать sync-критичный local_data_source = risk drift). Механизм: маркеры `flags: fullCeremony`/`minimalCeremony` + `MarkerAnalyzer.matchesCeremonyFlag`; sentinel `.minc` срезается в `_getDestinationPath`. **Known limitations:** minimal оставляет ds-интерфейсы (≠ weight HEAD на 2 файла); no-op для junction + sibling-шаблонов (помечен только `category`). Default `full` = исторический output без изменений.

### Reserved Drift column-имена в полях — fail-fast (BUG-024)

⚠ **Поле с именем Drift column-builder** (`text`/`integer`/`dateTime`/`boolean`/`real`; + forward-defense `int64`/`blob`/`customType`/`intEnum`/`textEnum`) генерирует `TextColumn get text => text()()` (self-referential) → drift_dev падает, **build_runner exit 0**, stale `database.g.dart` → каскад analyze-ошибок (silent broken build). `EntityYamlValidator` теперь reject'ит pre-flight (`RESERVED_DRIFT_COLUMN_NAMES`, error `RESERVED_FIELD_NAME`). Lesson: build_runner НЕ пробрасывает non-zero на drift errors — verify ловит только финальным `flutter analyze`. Родственно BUG-018 (reserved Serverpod class names) / BUG-010 (`Map` в имени).

### Orchestrator marker fail-fast (BUG-025)

⚠ `OrchestratorPatcher` раньше молча no-op'ил, если `sync_orchestrator_provider.dart` существует, но marker-блоки (`syncImports`/`syncEntityTypes`/`syncRegistrations`) отсутствуют → сущность не регистрировалась в sync (**verify-blind**: компилируется, но offline-sync не работает). Теперь `_assertMarkersPresent` бросает с именами отсутствующих маркеров. File-absent остаётся мягким skip (не-bootstrap'нутый проект). Класс «verify-blind»: verify ловит только то, что доходит до `.g.dart`; valid-but-wrong Dart (sync no-op, `:base` loss) проходит мимо.

### Junction FK-пара: `customerId` неоднозначен (BUG-026 → TASK-015)

⚠ `extractManyToManyEntities` / orchestrator берут первые 2 relation-поля по порядку объявления. `customerId: relation(parent=customer)` структурно **неотличим**: в `TaskTagMap` = tenant-scope (надо игнорировать), в `CustomerUser` = настоящий junction-родитель (надо включать). Blanket-exclude ломает CustomerUser → **не фиксится фильтром** (TASK-015 = explicit `junction: [parent, parent]`). **Mitigation (соблюдать!):** объявляй junction-родительские FK ПЕРЕД ownership `customerId` (шаблон t115 `task_tag_map` так и делает). Баг проявляется только при нарушении конвенции.

### One-to-many back-relation на parent → InvalidType (BUG-027, ✅ CLOSED TASK-034)

⚠ Parent entity с `<children>: List<RegularChild>?, relation` (one-to-many back-relation на **regular** entity) → поле протекало в flutter `*_entity.dart`/`*_model.dart` **без импорта** → `json_serializable InvalidType` → build_runner FAIL. **Плюс** — drift-таблица эмитила silent-wrong `TextColumn get <children> => text()` (компилируется, поэтому junction-кейс «проходил» verify).

**⚠ Root cause в первичном bug-report был НЕВЕРЕН** (предполагал `relationType='oneToMany'`). Фактически: `relation` записан **без скобок**, а парсер ([server_yaml_parser.ts:125](../../../src/features/generation/parsers/server_yaml_parser.ts)) определяет relation через `/\brelation\s*\(/` (требует `relation(`). Для bare `relation` → **`isRelation=false`, `relationType=undefined`** → проверки `relationType==='oneToMany'` бесполезны. **Дискриминатор = тип `List<...>`, НЕ relationType.** Урок: не доверяй фикстуре, проверяй на реальном парсере (именно ручная фикстура увела анализ в неверный root cause).

**Fix (TASK-034):** `field.type.startsWith('List<')` в ДВУХ точках [code_formatter.ts](../../../src/features/generation/parsers/formatters/code_formatter.ts) — `fieldsFilter` (entity/model/mappings) + `shouldSkipServerpodField` (drift column). 6 tests через реальный парсер, verify t205 errors=0.

**Mitigation/correct modeling (всё ещё рекомендовано):** one-to-many = child FK only (`childId: relation(parent=X)` + `X?, scope=serverOnly`); parent НЕ держит flutter back-relation list (паттерн t115 `task`→`category`). Теперь back-relation на parent безопасен (стрипается), но не несёт flutter-семантики. Junction back-relation (`<j>Maps: List<JMap>`) — также стрипается. **Follow-ups:** ✅ cleanup redundant `Map`-эвристики — **сделан (TASK-035)**: substring `!name.includes('Map')` в `fieldsFilter` молча дропал scalar с camelCase-сегментом `Map` (`siteMapUrl`/`heatMapConfig`/`roadMapId`); удалён, junction back-relations покрыты `startsWith('List<')`. Открыт: pre-flight reject для `List<scalar>` на synced-entity (loud вместо silent-strip, inert сегодня). См. [BUG-027](../bug-reports/027-one-to-many-back-relation-regular-entity-leaks-into-flutter-entity.md).

### Windows + sandbox

- CLI `child_process.exec` использует `shell: 'powershell.exe'` на Windows ([core/utils/exec.ts](../../../src/core/utils/exec.ts)). Иначе .bat файлы не находятся.
- PowerShell tool иногда broken (Exit 1 на `"hello"`) — использовать **Bash tool с pwsh wrapper**.
- Sandbox блокирует `rm -rf` test-проектов — это политика, не bug.

### VS Code self-update background

`CodeSetup-stable...exe` background обновление блокирует vscode-test runner. **Workaround:** mocha напрямую (НЕ vscode-test):

```bash
node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
```

`--ignore "out/test/extension.test.js"` обязателен — этот тест требует vscode runtime, доступный только vscode-test runner'у. Baseline 2026-05-03: **163 passing**.

⚠ Использовать **explicit `node node_modules/mocha/bin/mocha.js`**, НЕ `npx mocha` — mocha = transitive dep через `@vscode/test-cli`. `npx` fallback'нул бы на latest из реестра при `npm prune --production` или patch bump cli, breaking workflow silently. Эта же команда работает в CI ([.github/workflows/test.yml](../../../.github/workflows/test.yml), TASK-CI-001 / TASK-020). Соответствует prior-art TASK-013/016.

⚠ **Test filename convention: `<name>.test.ts`** (dot prefix), НЕ `<name>_test.ts` (underscore). Mocha glob `out/test/**/*.test.js` матчит **только** dot-prefix. Файлы с `_test.js` суффиксом **silently skipped** — не попадают ни в локальный test suite, ни в CI. **Discovered 2026-05-25 (TASK-026):** TASK-025 ввёл `state_providers_ref_mounted_test.ts` с underscore — 9 тестов dead до TASK-026 rename. Multi-agent Standard + Adversarial оба пропустили (читали file content, не filename pattern). **Lesson:** при создании test file **всегда** называть `<name>.test.ts` + проверять `mocha ... | grep "passing"` count = baseline + N (где N = число новых тестов). Если N не появилось — filename convention violation.

### Server port blocking

`errno = 10048, address = ::, port = 8082` — зомби `dart.exe` процесс. Resolve через Bash + pwsh (НЕ PowerShell tool):
```bash
pwsh -NoProfile -Command "Get-NetTCPConnection -LocalPort 8082 -State Listen | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }"
```

### Postgres password mismatch

`DatabaseQueryException: password authentication failed` — Docker volume rotation. Fix: `docker compose down -v && docker compose up -d`.

### Runtime smoke (serverpod) — runbook + первая end-to-end валидация (2026-06-05)

⚠ **`verify` НЕ покрывает runtime** (только compile + analyze). Для реального прогона сервера:

1. `node out/adapters/cli/index.js local-setup --workspace G:/Projects/Flutter/serverpod/t<N> --human` — docker `down -v` + `up -d` (postgres+redis) + `create-migration --force` + `serverpod generate` + flutter `build_runner`. **БЕЗ `--run-server`** (он блокирует — сервер живёт вечно). ~26с.
2. Сервер отдельно в фоне (run_in_background): `dart bin/main.dart --apply-migrations` в `t<N>_server` через pwsh wrapper → лог в файл.
3. Probe: порты 8080(API)/8081(insights)/8082(web); `Invoke-WebRequest http://localhost:8080/` → **200 OK** `body=OK <ts>`; `docker compose exec -T postgres psql -U postgres -d t<N> -c "\dt"` для схемы.

**Первая end-to-end runtime-валидация генератора (t205, 2026-06-05):** local-setup + serve → миграции применены (DB init 49 queries, seeding ролей/юзеров), HTTP 200, все сгенерённые таблицы в Postgres. Доказывает: generate→migrate→serve работает не только compile-clean.

⚠ **Серверный артефакт (НЕ баг генератора): Serverpod phantom implicit FK.** Unnamed back-relation `<x>: List<Y>?, relation` на parent **без** `relation(name=...)` заставляет Serverpod создать ЛИШНюю implicit FK на ребёнке (`project_task._projectProjecttasksProjectId`, `author_book_map._authorAuthorbookmapsAuthorId`) вдобавок к явной `projectId`/`authorId`. Миграция применяется, сервер работает — но колонка-фантом. Усиливает рекомендацию [BUG-027]: one-to-many = **child FK only**, parent без back-relation. Кандидат на generator-follow-up (омитить parent back-relation из server YAML или генерить `relation(name=...)`). PSQL колонки = camelCase (`siteMapUrl`, не snake) — grep по snake не сматчит.

### VS Code extension — install / update workflow + gotchas

⚠ **Расширение работает из `out/*.js`** (`main: ./out/adapters/vscode/extension.js`), publisher `mrfrolk`, активация `onStartupFinished`. Установлено как `mrfrolk.code-generator@0.0.1`.

**Сборка + установка (CLI, надёжно):**
```bash
npm run compile
npx @vscode/vsce package --allow-missing-repository   # → code-generator-0.0.1.vsix
code --install-extension code-generator-0.0.1.vsix --force
```
Затем в VS Code: `Ctrl+Shift+P` → "Developer: Reload Window" (без релоада команды не появятся).

⚠ **Установленный .vsix НЕ обновляется при правке `src/`** — нужна пересборка + переустановка + reload. F5 (Extension Development Host, launch.json "Run Extension") — альтернатива для dev, но Dev Host тоже не hot-reload'ит `out/`: после `npm run compile` нужен `Ctrl+R` в окне Dev Host.

✅ **UI self-rebuild handler — ПОЧИНЕН (TASK-036).** Раньше `reinstallExtension` был захардкожен на голый `vsce package` (`CommandNotFoundException` без global vsce). Теперь: `npm version patch --no-git-tag-version` (видимый инкремент версии — раньше всегда 0.0.1) → имя `.vsix` из `package.json` version ([vsix_name.ts](../../../src/adapters/vscode/utils/vsix_name.ts)) → `npx @vscode/vsce package --allow-missing-repository` (без global-зависимости) → install + reload. `terminalCommands` awaited (execCommand), race нет. vsce также стоит глобально (3.9.2) как fallback.

✅ **`.vsix` ужат (TASK-036):** 571 файл / 1.71 MB → **368 файлов / 699.59 KB** (~59%). `.vscodeignore` теперь исключает `ai/`/`docs-code-generator/`/`.claude/`/`.github/`/`tmp/`/`*.vsix`/`CLAUDE.md`/`AGENTS.md`. Дальше — только bundling (esbuild/webpack), отдельная задача.

⚠ **Версионирование = авто-bump на каждый UI reinstall** (Вариант A, User 2026-06-05): `package.json` version растёт сама → понятно что обновилось. Мелкий tracked-диф, коммитится когда удобно. Публичная публикация (Marketplace) НЕ делается — расширение не самодостаточно (внешние t115-шаблоны, Windows-only powershell, toolchain-deps).

### UI `Create Data Files from YAML` (createDataFiles) = ТОЛЬКО source emit

⚠ UI-команда (`code-generator.createDataFiles`, она же generate-entity флоу) пишет **только `.dart`-исходники** — **НЕ** запускает `serverpod generate` / `build_runner`. Сразу после неё IDE показывает ошибки несгенерённых `*.freezed.dart` / `*.g.dart` / drift `database.g.dart` / serverpod-client частей. **Это не баг.** Чтобы ошибки ушли → прогнать кодоген (`verify` / `local-setup` / вручную serverpod generate + build_runner), затем при необходимости `Ctrl+Shift+P` → "Dart: Restart Analysis Server" чтобы сбросить stale-ошибки в IDE. Флоу: активный редактор `.spy.yaml` → валидация (диалог "Generate anyway") → quickPick scope (Client only / Client+Server, TASK-029) → pickPath feature (full path). Workspace = корень окна.

### Длительные команды

- `create-project --name X` — ~3 минуты. **НЕ перезапускать** для "посмотреть лог", если не упала.
- `serverpod generate` — ~10 сек.
- `flutter pub run build_runner build` — 30-60 сек.

### `generate-entity --with-server` opt-in (TASK-029, breaking change для callers)

⚠ **`generate-entity` по умолчанию НЕ пишет в `<project>_server/`.** Default OFF, opt-in через `--with-server` flag. Применяется к manifest'ам `entity` и `manyToMany` — `server/` scan_dir исключается из `directoriesToScan` когда `withServer=false`. Filter logic в [generation_service.ts `shouldScanDir`/`computeScanDirs`](../../../src/features/generation/generators/generation_service.ts).

**Exempt от filter (server всегда генерится):**
- `startProject` — `create-project` bootstrap (иначе пустой `<project>_server/`)
- `deploy`, `pythonStart`, `goStart`, `nodeStart` — independent от CRUD entity flow

**Почему default OFF:** TASK-019 Bug 5 incident (weight) — vanilla `generate-entity` молча модифицировал 6 endpoint'ов в `weight_server/` + создал snake-дубли (`category_endpoint.dart` + `task_tag_map_endpoint.dart` etc). Пришлось `git checkout HEAD -- weight_server/` руками. Least-surprise: каллер должен explicit'но указать намерение писать на server.

**Caller migration:** любой existing script / agent / VS Code workflow который полагался на server writes должен добавить `--with-server`. CLI:
```bash
node out/adapters/cli/index.js generate-entity --yaml X.spy.yaml --feature-path ... --workspace ... --with-server
```

VS Code: после feature pickPath появляется `quickPick` с выбором scope (Client only / Client + Server). Esc = abort, default selection = client-only.

⚠ **При spawn новых проектов через `create-project` — server baseline всё ещё генерится автоматически** (startProject exempt). Filter применяется ТОЛЬКО к последующим `generate-entity` вызовам.

### `generate-entity --feature-path` требует FULL ABSOLUTE path (CLI, TASK-031 lesson)

⚠ **CLI `--feature-path` ожидает полный абсолютный путь к feature dir**, НЕ relative feature name. Передаётся напрямую как `config.targetFeaturePath` ([generate_entity.ts:128](../../../src/adapters/cli/commands/generate_entity.ts)) → file writes резолвятся относительно него. Relative значение (`projects`) → `path.join(CWD, 'projects/...')` = файлы пишутся в **CWD** (например codegen repo root), молча, без ошибки.

**Правильно:**
```bash
node out/adapters/cli/index.js generate-entity \
  --yaml <X>.spy.yaml \
  --feature-path "G:/Projects/Flutter/serverpod/<proj>/<proj>_flutter/lib/features/<feature>" \
  --workspace "G:/Projects/Flutter/serverpod/<proj>" --template t115
```

**Неправильно:** `--feature-path projects` (relative) → файлы в CWD, target feature dir не создаётся.

VS Code adapter проблемы не имеет — передаёт full path из `pickPath(config.featuresPath)` ([create_data_files_by_replacement.ts:80-83](../../../src/adapters/vscode/commands/create_data_files_by_replacement.ts)).

**TASK-031 lesson 2026-05-28:** изначально mislabeled этот usage error как "t115 generate-entity bug" + предложил TASK-033. Bisect (4 commits до pre-Phase B) показал воспроизводимость везде → не регрессия. Root cause = relative path. **Verify CLI usage перед заявлением "generator bug".** Optional UX fix (low-pri): CLI мог бы reject/resolve relative `--feature-path`.

### Junction (M2M) generation — prove-out t201 (2026-05-28)

⚠ **Junction-генерация на t115 РАБОТАЕТ** (вопреки stale backlog BUG-016/020). Прогон t201:
- **Canonical** `task_tag_map` (task+tag parents) → verify PASS errors=0
- **Custom-named** `author_book_map` (author+book parents, library feature, имена ≠ task/tag) → verify PASS errors=0, substitution чистая (0 stray task/tag в коде, DAO правильно authorId/bookId)

**Mechanism:** CLI передаёт `targetEntity1`/`targetEntity2`/`targetJunctionClassName` из parsed YAML FK relations → target-side substitution `task_tag_map` → `<custom>_map` корректна независимо от template-side `task`/`tag` defaults.

**Junction generate-entity flow (t115):**
1. Parent entities должны существовать первыми (junction FK targets) — generate в dependency order
2. Junction YAML: 2 FK `relation(parent=X)` + unique index. Parser → `manifest: manyToMany`
3. Parent YAML нужен back-relation `<junction>s: List<Junction>?, relation`
4. **`--with-server` обязателен** иначе client ссылается на несгенерённый endpoint → 11 compile errors
5. **full absolute `--feature-path`** (см. gotcha выше)

**Stale backlog (re-classified):** BUG-016 (junction substitution) → appears RESOLVED; BUG-020 (hardcoded task/tag) → likely MOOT (оба templates сохранили task_tag_map fixture). **BUG-015 (cross-feature junction — parents в РАЗНЫХ features) — НЕ тестировался**, остаётся открытым edge. Cosmetic: generated junction dao содержит Russian "задачи" в debug-print (comment leftover, не код).

### Reserved Serverpod class names

`Order` collisions с `package:serverpod/src/database/concepts/order.dart`. BUG-018 backlog. Use `Invoice`/etc. вместо.

### Template pubspec pub deps drift

Pinned versions в `G:/Templates/flutter/simplified/*/pubspec.yaml` могут конфликтовать с transitive deps updates от pub registry **и от flutter SDK pins** (matcher, test_api). Симптом: `flutter pub get` FAIL "version solving failed" + secondary "sdk >=1.8.0 <3.0.0" advisory (pub solver hint, не отдельный root cause).

**Root cause pattern:** **strict** pin на key package (например `custom_lint: 0.8.0` без caret) блокирует cascade resolution к newer compatible versions. Свежие transitive deps (`test >=1.28 → analyzer >=8` через flutter SDK matcher pin + `serverpod_client → web_socket_channel ^3.0.3`) требуют analyzer 8, который недоступен из-за strict pin.

**⚠ Diagnostic lesson (TASK-030):** **сравни sibling templates до диагноза.** TASK-030 first-pass диагноз показал "analyzer ^7 lockstep — bump impossible without cascade всего generated code". **Это была ошибка.** Sibling `simplified_admin/pubspec.yaml` имел IDENTICAL constraints (включая `json_serializable: 6.11.2` strict + `freezed: ^3.0.6` + `serverpod_flutter 3.4.8`) **кроме одного**: `custom_lint: ^0.8.0` (caret). Admin's `pubspec.lock` empirically доказал что caret resolves к `analyzer 8.4.0 + custom_lint 0.8.1 + freezed 3.2.3 + build_runner 2.15.0 + json_serializable 6.11.2` — все coexist. Adversarial reviewer поймал эту diagnostic error.

**Fix patterns (по убыванию preference):**
- **Caret bump strict pin** (`X.Y.Z` → `^X.Y.Z`) — minimal disruptive, single character change, forward-compatible. **Applied в TASK-030** для `custom_lint`. Verify через sibling-template lockfile evidence.
- `dependency_overrides:` для pin transitive deps к compatible versions — fallback если caret bump conflicts с другими strict pins. Risk: override flutter SDK hint pins (matcher/test_api) — widget runtime tests НЕ покрыты verify chain'ом.
- Major version bump entire lockstep (analyzer 7→8 cascade explicitly) — last resort, **обычно не нужен** если caret bump работает (admin proves cascade auto-resolves).

**Documentation rot warning:** comments типа "analyzer ^7 lockstep — bump к analyzer 8 ломает X" могут rotted at scale больше года. **Verify empirically** через sibling lockfile до доверия комментарию. TASK-030 нашёл 3 rotted claims в `simplified_flutter/pubspec.yaml` (build_runner / json_serializable / freezed) — все обновлены.

**Prevention:** Периодический audit `cd G:/Templates/flutter/simplified/simplified_flutter && flutter pub outdated` критичен. Cross-check siblings (`simplified_admin/`, `simplified_server/`) если они resolve успешно. См. [BUG-021](../bug-reports/021-pub-deps-drift-template-pubspec.md) для canonical fix pattern + diagnostic lessons.

См. также [TASK-030 report.md](../tasks/active/TASK-030-chore---fix-simplified-template-custom-lint-pin--pubget-drift/report.md).

---

## Файловые ориентиры (для нового teamlead)

```
ai/project/prompts/{teamlead,executor}.prompt.md     # роли (проектные)
ai/core/prompts/finalize.prompt.md                   # finalize промпт (core)
ai/core/scripts/{new_task.py, task.py}               # task management CLI (core)
ai/core/discussions/scripts/discuss.py               # discussions CLI (core)
ai/core/tasks/_template/                              # шаблон задачи (core)
ai/project/tasks/{active,done,blocked}               # задачи проекта
ai/project/bug-reports/                              # известные баги (001-027)
ai/project/discussions/archive/                      # архивированные discussions (1-12)
ai/project/docs/{INDEX,roadmap,status,architecture,agent_memory}.md  # документация процесса

src/features/generation/parsers/server_yaml_parser.ts          # YAML → модель
src/features/generation/parsers/junction_detector.ts           # junction detection (TASK-013)
src/features/generation/parsers/entity_yaml_validator.ts       # 6-field + sync-event валидация
src/features/generation/parsers/relation-analyzer.ts           # detection one/many-to-one
src/features/generation/generators/relation_patcher.ts         # :oneToManyMethods патчинг (TASK-008/017)
src/features/generation/generators/orchestrator_patcher.ts     # sync_orchestrator_provider patching
src/features/generation/generators/app_database_generator.ts   # database.dart Drift сборка
src/features/generation/replacement/replacement_util.ts        # словари (ENTITY/M2M/COMMON)
src/utils/text_work/text_util.ts                              # cap, toSnakeCase, snakeToLowerCamelCase
src/adapters/cli/commands/create_project.ts                    # full project bootstrap
src/adapters/cli/commands/generate_entity.ts                   # entity feature gen
src/adapters/cli/commands/verify.ts                            # DoD-гейт
```

---

## Предпочтения User

- **Язык:** русский для коммуникаций, технические термины на английском
- **Git:** коммиты ТОЛЬКО когда User явно сказал "коммить". На русском, Conventional Commits, БЕЗ `Co-Authored-By`
- **Без костылей:** если нет правильного решения — сказать честно, предложить варианты
- **Decoupling:** vscode-зависимости ТОЛЬКО в `src/adapters/vscode/`
- **Multi-agent review** для major TASK обязателен
- **Pre-implementation Discussion** для high blast radius changes обязателен
- **Test-проекты** агент НЕ удаляет (sandbox policy)
