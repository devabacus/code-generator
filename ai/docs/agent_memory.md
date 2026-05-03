# Память агентов

Операционные факты для AI-агентов.
**Агенты ОБЯЗАНЫ читать этот файл при каждой сессии.**

**Последнее обновление:** 2026-05-03 (Phase 1.5 closure + Discussion #8 finalization + TASK-CI-001 minimal CI gate)

---

## TL;DR проект (handoff context для нового teamlead)

**Что это.** VS Code расширение + CLI `codegen` для генерации Serverpod/Flutter монорепо из шаблона t115 + микросервисов (Python/Node/Go).

**Стек проекта:**
- Codegen src/ — TypeScript, ~3000-4000 LOC, 163 unit tests
- Шаблон t115 — отдельный git репо (`devabacus/t115`), не tracked codegen репо
- sync_core 0.3.0 — отдельный pub package (`devabacus/sync_core`), outbox-first multi-entity sync
- Сгенерированные test projects: `G:/Projects/Flutter/serverpod/t<N>/`

**Текущая фаза:** Phase 1.5 ✅ CLOSED (2026-05-03). См. [status.md](status.md) и [roadmap.md](roadmap.md).

**Architectural pivot принят (Discussion #7):** Multi-template plurality. t115 → legacy/advanced. New "Simplified Template Initiative" — standalone parallel track.

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
python ai/scripts/new_task.py "название"           # создать TASK
python ai/scripts/task.py start <branch>           # feature branch
python ai/scripts/task.py pr                       # push + PR
python ai/scripts/task.py merge [-y]               # merge after CI
python ai/discussions/scripts/discuss.py new       # discussion
python ai/discussions/scripts/discuss.py close <N> # archive
```

**Запрещено** создавать `ai/tasks/active/TASK-XXX-*/task.md` или `ai/discussions/active/N-*.md` через `Write` tool вручную.

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
3. ✅ TASK-CI-001 closed via TASK-020 — minimal single-job CI ([.github/workflows/test.yml](../../.github/workflows/test.yml)): compile + lint + 163 unit tests. 3-suite split (universal + t115 regression + simplified) deferred to Phase A test inventory audit deliverable.
4. 🟢 **Initiative Phase A (TASK-021 ready for merge)** — Discussion #10 archived (4-agent convergence, 13-point Decision). [ADR-0005 promoted + accepted](../docs/decisions/adr-0005-multi-template-plurality.md): multi-template plurality + simplified architecture + generate-vs-not-generate divider + Phase C amendment clause + TBD placeholders Q7=e REJECT. 3 audits ✅. Sub-A5 4 reviewers → 49 findings (5 CRITICAL/DEAL-BREAKER + 14 HIGH applied). All Sub-A6 STOP-gates ✅ resolved. **Clean-slate amendment 2026-05-03:** User confirmed weight v1 НЕ в production → dual-running concerns N/A; decision matrix v1 maintenance moot; cutover plan N/A; t115 deprecated path; default template = simplified; estimate 5-6 → ~3-4 months. PR #16 awaiting explicit "мержить".
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

### Windows + sandbox

- CLI `child_process.exec` использует `shell: 'powershell.exe'` на Windows ([core/utils/exec.ts](../../src/core/utils/exec.ts)). Иначе .bat файлы не находятся.
- PowerShell tool иногда broken (Exit 1 на `"hello"`) — использовать **Bash tool с pwsh wrapper**.
- Sandbox блокирует `rm -rf` test-проектов — это политика, не bug.

### VS Code self-update background

`CodeSetup-stable...exe` background обновление блокирует vscode-test runner. **Workaround:** mocha напрямую (НЕ vscode-test):

```bash
node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
```

`--ignore "out/test/extension.test.js"` обязателен — этот тест требует vscode runtime, доступный только vscode-test runner'у. Baseline 2026-05-03: **163 passing**.

⚠ Использовать **explicit `node node_modules/mocha/bin/mocha.js`**, НЕ `npx mocha` — mocha = transitive dep через `@vscode/test-cli`. `npx` fallback'нул бы на latest из реестра при `npm prune --production` или patch bump cli, breaking workflow silently. Эта же команда работает в CI ([.github/workflows/test.yml](../../.github/workflows/test.yml), TASK-CI-001 / TASK-020). Соответствует prior-art TASK-013/016.

### Server port blocking

`errno = 10048, address = ::, port = 8082` — зомби `dart.exe` процесс. Resolve через Bash + pwsh (НЕ PowerShell tool):
```bash
pwsh -NoProfile -Command "Get-NetTCPConnection -LocalPort 8082 -State Listen | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }"
```

### Postgres password mismatch

`DatabaseQueryException: password authentication failed` — Docker volume rotation. Fix: `docker compose down -v && docker compose up -d`.

### Длительные команды

- `create-project --name X` — ~3 минуты. **НЕ перезапускать** для "посмотреть лог", если не упала.
- `serverpod generate` — ~10 сек.
- `flutter pub run build_runner build` — 30-60 сек.

### Reserved Serverpod class names

`Order` collisions с `package:serverpod/src/database/concepts/order.dart`. BUG-018 backlog. Use `Invoice`/etc. вместо.

---

## Файловые ориентиры (для нового teamlead)

```
ai/prompts/{teamlead,executor,finalize}.prompt.md   # роли
ai/scripts/{new_task.py, task.py}                    # task management CLI
ai/discussions/scripts/discuss.py                    # discussions CLI
ai/tasks/{_template,active,done}                     # задачи
ai/bug-reports/                                      # известные баги (001-018)
ai/discussions/archive/                              # архивированные discussions (1-8)
ai/docs/{INDEX,roadmap,status,architecture,agent_memory}.md  # документация процесса

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
