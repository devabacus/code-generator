# Статус проекта

**Обновлено:** 2026-07-29 (**master `90a0056`**, **459 tests**). BUG-029 закрыт для regen-пути
(TASK-042 guard + TASK-043 per-file preserve), контур впервые проверен на **реальном** проекте
weight. См. секцию «Сессия 2026-07-28/29» ниже.

---

## Сессия 2026-07-28/29 (BUG-029 закрыт + первая разведка на weight)

**Master:** `90a0056`. **459 passing**, 0 failing. Compile clean, lint 0 errors / 18
pre-existing warnings. CI зелёный.

**Merged PR:**

- **PR #52** — docs: онбординг-доки под `c7227e9`.
- **PR #53 — TASK-042** — BUG-029 preflight + ledger. Двухфазный `plan → apply` (при
  конфликте хотя бы в одном файле не записывается ни один), ledger `.codegen/ledger.json`
  (schema v1, SHA-256 без нормализации, для merge-файлов — хеши регионов), самовосстановление
  при рассинхроне, CLI `--overwrite-existing` + non-zero exit с diff, VS Code preview.
  Ревью: Standard APPROVE WITH MINOR, **Adversarial REQUEST CHANGES** — блокер (ложный
  `user-modified` с диффом «содержимое совпадает») закрыт в раунде 2.
- **PR #54** — chore: контракты TASK-043…046.
- **PR #55 — TASK-043** — per-file preserve: `--overwrite-existing` принимает список путей,
  backup в `.codegen/backup/<timestamp>/`, сохранённые файлы не трогает никто (включая
  патчеры). Ревью снова дало блокер: **`preserve` не был preserve** — `relation_patcher`
  дописывал сохранённый файл молча и без backup. Закрыт гардом `PreservedFiles` в трёх
  патчерах (scope расширен владельцем). Плюс фикс платформозависимости гарда, пойманный
  красным CI на ubuntu.
- **PR #56** — docs: разведка weight (**открыт, ждёт merge**).

**Вне репо:** t115 мигрирован на `# codegen:junction: [task, tag]`, запушен (`41eeba6`).

### Разведка на weight (главное)

Полные числа — [weight-migration-probe-2026-07-28.md](weight-migration-probe-2026-07-28.md).

- под codegen **15 сущностей из 43**; на каждой **19 конфликтов** (`legacy-mismatch`, ledger
  отсутствует; `configuration` 23, `device_owner` 20) → **271 файл**; **83% full-replace**.
  ⚠ Первая редакция давала «38 / ≈570» — завышено вдвое, см. поправку TASK-048 ниже;
- расхождения **системные** (шаблон ушёл вперёд), а не пользовательские; `--ceremony minimal`
  картину не меняет;
- **риск локализован**: пересечение «ручные правки» × «зона перезаписи» на 4 сущностях —
  **6 файлов, все в `weighing`**; у `subscription`, `terminal_device`, `configuration` —
  пусто;
- **per-file preserve из TASK-043 не масштабируется** на сотни файлов — не хватает обратного
  флага `--preserve`. Регенерация weight = миграция, а не запуск команды;
- **BUG-030 не стреляет** на текущем weight → приоритет понижен.

### TASK-047 — вердикт по новым сущностям (2026-07-29, закрыт)

Остаток разведки закрыт: прогон с `--with-server` + компиляция.
**Новые сущности в weight добавлять можно сегодня.** `flutter analyze` → **errors=0,
warnings=1, infos=46 — идентично baseline до генерации**, дельта нулевая. Генерация exit 0
без конфликтов, `serverpod generate` + `build_runner` exit 0, общие файлы получили только
вставки (оркестратор 19/0, `database.dart` 6/1 — единственное удаление это строка
`schemaVersion => 25`), повторный прогон молчит и идемпотентен.

Попутно: доля merge-файлов на свежей сущности — **3 из 24 (12.5%)**, ниже прежней оценки 16%
(входное число для TASK-049); `database.dart` и оркестратор в ledger не попадают (TASK-046
подтверждён на реальном проекте); `serverpod generate` переписывает ~60 файлов в
`weight_server/lib/src/generated/` из-за дрейфа версии Serverpod — придёт с первым же
прогоном при миграции. Runtime (миграция БД, сервер, sync) **не проверялся**.

### TASK-050 / BUG-032 — regen сущности с enum-полем ломал сборку t115 (2026-07-30, закрыт)

Генератор эмитил `tryParseEnum(...)`, а определение хелпера поставлял **только** шаблон
`simplified` — в t115 его не было вовсе (TASK-027 доехал наполовину). Любая сущность с
enum-полем в t115-проекте не компилировалась; на копии weight регенерация ОДНОГО файла дала
`errors=0 → 5`, `3× undefined_method`.

Фикс — паритет с simplified, emit-сторона не тронута: `enum_parse.dart`
(`manifest: startProject`) + импорт с `// ignore: unused_import` в три `*_entity_extension.dart`.

**E2E на свежем `t213`:** сущность с enum (обязательный + nullable) → `verify` **errors=0,
warnings=1, infos=44**. Контрольная сущность **без** enum дала **те же числа** — безусловный
импорт стоит **0 предупреждений**. Тестов 459 → **468**.

⚠ **Слепое пятно не закрыто:** в фикстуре t115 enum-полей нет, поэтому штатный `verify`
этот класс дефектов по-прежнему не видит (родня BUG-024/025). Вариант — отдельный тест-YAML
с enum; решение за владельцем.

⚠ **Шаблон t115 изменён, но НЕ запушен** — ждёт слова владельца. В нём же лежит чужой
незакоммиченный хвост от TASK-039 (`task_tag_map_table.dart`, маркер `:driftTableImports`).

### TASK-048 — карта риска по всем 15 сущностям (2026-07-29, закрыт)

**Миграция меньше и безопаснее, чем считалось.** Под угрозой **13 файлов**, все в фиче
`weighing`; **10 из 14** сущностей руками не правились ни разу → перезаписываются пакетно.
Разбирать вручную нужно четыре: `weighing` (6), `driver` (3), `vehicle` (3), `contractor` (1).
Все 13 — full-replace, региона `:base` нет ни у одного.

**⚠ Поправка к числам разведки:** конфликтов не 38 на сущность, а **19** (`configuration` 23,
`device_owner` 20), и не ≈570 файлов всего, а **271**. Части 1-2 считали `✗`-строки, а CLI
печатает отчёт о конфликтах **дважды** —
[BUG-031](../bug-reports/031-generate-entity-duplicates-conflict-report-in-output.md).
Сверка `19+19+23+19 = 80` совпала с `B` части 2 → множества файлов были верны, завышен
только счётчик; выводы про A ∩ B в силе.

Для TASK-049 получен адрес: `:base` несут ровно три типа (`*_dao`, `*_repository`,
`*_local_data_source`), и **ни один из 13 файлов под угрозой к ним не относится** — рвутся
`*_extension`, `*_state_providers`, `*_data_providers`, `repository_impl`,
`remote_data_source`. Их и мигрировать первыми.

`custom_field_value` — особый случай: во flutter ноль файлов, на клиент никогда не
генерировалась → сценарий новой сущности, не миграция.

### Заведено по итогам

- **TASK-047** — полный цикл новой сущности на weight (`--with-server` + verify).
- **TASK-048** — карта риска: 11 оставшихся сущностей.
- **TASK-049** — миграция шаблонов на merge-дисциплину (`:base`-регионы); поглощает BUG-007 и BUG-013.
- **BUG-030** — заведён (otm-регион вне guard'а), приоритет низкий.

### Ограничение

Месячный лимит трат исчерпан — субагенты недоступны. TASK-047/048 выполнимы в основном
цикле; TASK-049 лучше начинать после восстановления лимита.

---

## Сессия 2026-07-22 (AI-workflow v2 pilot — шаг 1 раскатки)

**Контекст:** этот репо — пилот раскатки шаблона AI-workflow v2 (`G:\Templates\ai`). Сессия = миграция v1→v2 + первые задачи через v2-процесс.

**Master:** `c7227e9`. Working tree clean. **Tests: 345 passing** (было 322 baseline старта сессии → +8 loud-guard cross-feature +4 junction colocation +21 comment-directive и т.д.), 0 failing. Lint 0 errors / 18 pre-existing warnings. Compile clean.

**Merged PR сессии:**
- **PR #45** — миграция ai/ v1→v2 (граница core/project, profile.yaml зона `generator-core` class I cloud, verification-профиль `ts-generator`). Bug-report 011-dx → 028 (разведён номер).
- **PR #46** — sync шаблона + `ai/project/docs/model-policy.md` (frontier=Fable 5 только главная сессия; standard=Opus 4.8; mechanical=Sonnet 5; independent_reviewer=GPT).
- **PR #47 — TASK-037** — junction `# codegen:junction: [a,b]` explicit-parents директива (экс-BUG-026) + loud-guard дубликата родителей.
- **PR #48 — TASK-038** — triage `docs-code-generator/bugs-and-tasks.md` (14 записей → архивный документ, живых хвостов нет).
- **PR #49 — TASK-039** — BUG-015 cross-feature junction: prove-out на t206 (CONFIRMED, дельта cross vs same), drift-table слой пофикшен (маркер `:driftTableImports`), + **loud-guard** `validateJunctionColocation` (cross-feature junction отклоняется pre-flight). Остаток (5 слоёв) — полный резолвер в backlog (спроса нет — weight проверен).
- **PR #50** — дискуссии #13/#14 (Claude×2 / GPT×2) → **ADR-0006** (носитель junction-метадаты) + **ADR-0007** (BUG-029). Заведены TASK-041, TASK-042.
- **PR #51 — TASK-040** — директива junction переехала из YAML-**ключа** в YAML-**комментарий** (`# codegen:junction:`) — Serverpod больше не падает `property not allowed`. E2E на t207: `serverpod generate` exit 0. Migration-guard на старый ключ. Reviewer APPROVE WITH MINOR, minor #1 (пробел в regex) закрыт inline.

**Ключевые решения (ADR):**
- **ADR-0006** — junction codegen-метадата живёт в YAML-**комментарии**, не в ключе (Serverpod валидирует ключи). Обе формы (`[a,b]` и `true`). Fallback-эвристика ужесточается отдельно (TASK-041).
- **ADR-0007** — BUG-029 переформулирован: не «`:base` перезаписывается», а «65 из 81 шаблона идут через `createFile()` без проверки существования». Решение: preflight (двухфазный plan/apply) + ledger хешей как **неделимая единица** (TASK-042).

---

## Прошлые фазы (история до сессии 2026-07-22)

> Ниже — состояние на 2026-06-05 (до v2-миграции), сохранено как история.

---

## Текущая фаза

**Phase 1.5 + Phase A + Phase B ✅ CLOSED** (2026-05-03 → 2026-05-04). **🎉 Pipeline 5/5 CLOSED** (2026-05-26).

После 9 PRs Phase 1.5 sequence + Phase A/B + pipeline 5/5 (TASK-030/025/026/027/028/029) — codegen acceptance gate clean (verify PASS errors=0 на t186-t194 post-merge). 11 discussions archived. Architectural roadmap settled через Discussion #7-#12.

**Latest pivot (Discussion #9 + clean-slate amendment 2026-05-03):** Weight build на simplified template — **clean slate** (User confirmed weight v1 НЕ в production, нет users → нет dual-running concerns, нет cutover, нет decision matrix v1 maintenance). TASK-018 cancelled. Weight build = fresh app, hard switch deploy. Estimate revised 5-6 → ~3-4 months realistic, hard ceiling 4 months.

**⚠ CRITICAL Stack-lock decision (2026-05-03 — Discussion #11 + ADR-0005 amendment):** Стэк t115 baseline (Riverpod `@riverpod` annotations + Drift conventions + Clean directory layout + sync_core 0.3.0 + Serverpod) НЕ меняется без явного User approval. Версии всех packages update к latest stable (включая Serverpod). Simplified философия = ТОЛЬКО architecture ceremony reduction (NO usecases / business notifiers / validation generation), всё остальное inherited from t115.

### Master state (2026-06-05 — post BUG-026 re-classification PR #38)

- **Branch:** `master b26368a`. Working tree clean.
- **Tests:** **293 passing** на master, 0 failing
  - 271 (предыдущий baseline) + 14 BUG-023 ceremony + 5 BUG-024 + 3 BUG-025 = 293
- **Compile:** clean (`tsc -p ./` EXIT=0, verified 2026-06-05)
- **Lint:** 0 errors, 18 pre-existing warnings
- **CI:** [.github/workflows/test.yml](../../../.github/workflows/test.yml) — minimal gate (compile + lint + mocha)
- **Total PRs merged:** **38** (33 prior + BUG-023 #35 + BUG-024 #36 + BUG-025 #37 + BUG-026 re-class #38)
- **Cross-repo state:**
  - `devabacus/t115` master `fda1759` (BUG-023 ceremony minimal варианты для category)
  - `devabacus/simplified` — local-only git repo (нет remote), pre-existing User dirty state
- **Highest test project:** **t203** (generator re-check sweep: full+minimal+junction). Sandbox блокирует delete (политика). В t203 остался scratch `traps/` (BUG-024 repro).

---

## Активные задачи (на 2026-07-22)

- **TASK-042** (`active`, ветка `feature/TASK-042-preflight-ledger`, **реализовано, на ревью**) — BUG-029 preflight + ledger. В коде: двухфазный `plan → apply` в `GenerationService.generate` (при конфликте хотя бы в одном файле не записывается ни один), ledger `<project>/.codegen/ledger.json` (schema v1, project-relative пути, точный SHA-256, для merge-файлов — хеши регионов), CLI `generate-entity --overwrite-existing` + non-zero exit с diff, VS Code preview/confirm. **Workaround «`git diff` перед regen» больше не актуален** — guard громкий. Не входило в scope и остаётся открытым: миграция 65 шаблонов на merge-дисциплину, ownership-директива, [BUG-030](../bug-reports/030-relation-patcher-otm-region-outside-guard.md).
- **TASK-041** (`active`, `depends_on: TASK-040`) — ужесточение junction fallback до fail-fast. **Ждёт подтверждения владельца, что шаблоны t115/simplified мигрированы** на `# codegen:junction:` (иначе fail-fast ломает `create-project` из коробки). Условие старта зафиксировано в контракте.

**Зона владельца (вне репо кодогенератора):** миграция junction-YAML шаблонов t115/simplified на `# codegen:junction:` + строка в weight `customer_user.spy.yaml`. От неё зависит старт TASK-041.

### Прошлое (до v2): «Нет активных задач» (2026-06-05)

**Новые мелкие follow-ups (capacity-driven, не started; см. [agent_memory.md](agent_memory.md) gotchas):**
- `vs_code_menu.ts:30` UI self-rebuild захардкожен на голый `vsce` → заменить на `npx @vscode/vsce package` (митигация: vsce установлен глобально 2026-06-05).
- `.vscodeignore` не исключает `ai/`/`tmp/`/`.claude/`/docs → `.vsix` раздут (1.71 MB, 571 файл).
- Serverpod phantom implicit FK для unnamed parent back-relation → омитить из server YAML или генерить `relation(name=...)` (наблюдение runtime t205).
- pre-flight reject для `List<scalar>` на synced-entity (loud вместо silent-strip; inert сегодня).

### Закрыто (сессия 2026-06-05)

- **TASK-035** ✅ **merged** (PR #42, master `80346ac`) — follow-up к BUG-027. Удалены избыточные `Map`-эвристики из `code_formatter.ts`: substring `!name.includes('Map')` в `fieldsFilter` (latent false-positive — scalar `siteMapUrl`/`heatMapConfig`/`roadMapId` молча дропались) + inert exact-match `'Map'` в `shouldSkipServerpodField.staticFields`. Junction back-relations покрыты type-check `startsWith('List<')` (BUG-027). verify t205 errors=0 (library junction + author.siteMapUrl survives), 303 tests (299+4), Adversarial APPROVE.
- **TASK-034 / BUG-027** ✅ **merged** (PR #41, master `bfaebb5`) — collection back-relation (`List<X>?, relation`) протекал в flutter entity (loud `InvalidType` build fail) + drift column (silent-wrong `TextColumn`). Type-based фикс `field.type.startsWith('List<')` в `fieldsFilter` + `shouldSkipServerpodField`. **Root cause в первичном bug-report был неверен** (предполагал `relationType='oneToMany'`; реально bare `relation` → `isRelation=false`). verify t205 PASS errors=0, 299 tests, Standard+Adversarial APPROVE.

- **BUG-023** ✅ merged (PR #35, master `02af21f`) — `generate-entity --ceremony full|minimal` (Design 1). `minimal` вырезает usecases + usecase_providers, presentation→repository через `.minc`-варианты (ref.mounted guards сохранены). Default `full` без изменений. Маркеры `flags: fullCeremony`/`minimalCeremony` + `matchesCeremonyFlag`. t115 push `fda1759`. Standard + Adversarial APPROVE.
- **BUG-024** ✅ merged (PR #36, master `9f892a7`) — pre-flight guard на reserved Drift column-имена (`text`/`integer`/`dateTime`/`boolean`/`real` + forward-defense). Поймано на t203 (поле `text` → self-referential getter → drift_dev crash + build_runner exit 0 = silent broken build). `EntityYamlValidator.RESERVED_DRIFT_COLUMN_NAMES`. Adversarial APPROVE.
- **BUG-025** ✅ merged (PR #37, master `af43107`) — orchestrator no-op fail-fast. Если `sync_orchestrator_provider.dart` существует, но marker-блоки отсутствуют → throw (раньше silent no-op = сущность не в sync, verify-blind). Adversarial APPROVE.
- **BUG-026** ⏭ DEFERRED → TASK-015 (PR #38, master `b26368a`, docs-only). Blanket-fix (exclude `customerId`) **отклонён** — ломает CustomerUser junction (там `customerId` = настоящий родитель, структурно неотличим от tenant-scope). Mitigation: конвенция declare-parents-first (t115 соблюдает).

**🧪 Generator re-check (t203, 2026-06-05):** create-project + single-entity full (Memo) + minimal (Label) + custom junction (AuthorBookMap) → verify errors=0 по всем путям.

### Закрыто недавно (сессия 2026-05-28)

- **chore docs/handoff sync** ✅ merged (PR #33, master `ccf69b4`) — C-1 closure variant A + t115 pubspec hygiene + junction prove-out docs + bug-reports re-classification (BUG-015/016/020) + handoff rewrite. t115 push `13657d8`.
- **TASK-033** ✅ merged (PR #32, master `7b4be93`, 2026-05-28) — session_manager ref.mounted guard в **обоих** templates. 8 guards в 4 файлах. + 7 tests (3 inline golden + 4 live). t115 push `71da505`. Standard + Adversarial оба APPROVE.
- **TASK-032** ✅ merged (PR #31, master `6b42bd4`) — t115 ref.mounted guard parity (Bug 4). 4 `*_state_providers.dart` (11 guards). t115 push `1b2b683`. Adversarial F1 (t115 CI-coverage) fixed inline.
- **TASK-031** ✅ merged (PR #30, master `c8ad1b5`) — t115 LWW guard parity + caret bump custom_lint. t115 push `fbffc4c`. Self-correction: "t115 generate-entity bug" был CLI usage error (TASK-033-nominal cancelled).

**🎉 BUG-001 полностью закрыт** — entity state_providers (TASK-025 simplified + TASK-032 t115) + core session_manager (TASK-033 оба templates). Anti-pattern истреблён.

**🧪 Junction prove-out (t201, 2026-05-28):** canonical task_tag_map + custom-named author_book_map verify PASS errors=0. Same-feature junction generation подтверждено. **Cross-feature (BUG-015) — НЕ тестировался.**

### Suggested follow-up TASKs (capacity-driven, не started; ID присваивается скриптом)

- ~~**Configuration legacy paths consolidation** (TASK-028 adversarial R2 C-1)~~ — **CLOSED 2026-05-28 (variant A — leave, User approved).** Investigation: `reconcileServerChanges` / `handleSyncEvent` / `insertOrUpdateFromServer` в `configuration_local_data_source.dart` = **dead code, 0 call sites** (sync идёт через `configuration_local_apply.dart` LocalApply path). C-1 premise "active UPSERT bypass" опровергнут — методы не вызываются. Авторский комментарий: оставлены намеренно "как часть интерфейса". Удаление = blast radius ради marginal cleanup → leave per author intent.
- ~~**t115 pubspec rotted comments symmetry sweep** (TASK-031 Rev 2 H3)~~ — **DONE 2026-05-28 (chore).** build_runner + json_serializable rotted comments в `t115_flutter/pubspec.yaml` обновлены на accurate (t199 evidence: build_runner 2.15.0 + json_serializable 6.11.2 + analyzer 8.4.0, verify PASS). Comment-only (constraints не trognyты — caret floors resolve корректно). drift_dev/freezed comments не было (constraints ^2.26.0/^3.0.4 resolve к 2.31.0/3.2.3 — работают, не трогаем).
- **Post-pipeline weight backlog** (cross-repo, weight репо): регенерировать существующие 13 сущностей weight v1 под новые шаблоны + перенос кастомов. **Readiness → HIGH** (Bug 4 gap закрыт TASK-032 + session_manager TASK-033). Остаётся `:base` overwrite git-diff procedure. **Capacity-driven, требует context shift в weight репо + User explicit start.** ← следующий substantive item.

### Закрыто в pipeline 5/5 (TASK-019 weight handoff package)

> **Cross-repo origin (2026-05-23):** 5 task package пришёл из weight-system [TASK-021 handoff](../../../../../Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md) — фиксы шаблонов после TASK-019 sync_core wire-up review. User decisions Q1-Q6 зафиксированы. Порядок: 4→1→2→3→5. Тестирование = отдельные `t<N+i>` per PR (политика репо). Multi-agent review: 2 baseline / 3 для Bug 3 + Bug 5. Без регена weight (политика TASK-019 + ADR-0016).

| ID | Описание | Status | Merged |
|---|---|---|---|
| TASK-030 | **BLOCKER — template pubGet drift** (caret bump `custom_lint: 0.8.0 → ^0.8.0`). Closes BUG-021. | ✅ done | PR #22 (master `bffe07a` 2026-05-25) |
| TASK-025 | **Bug 4 — Riverpod `ref.mounted` guard в state_providers** (11 guards в 4 simplified files + 9 unit tests). Closes [BUG-001](../bug-reports/001-state-provider-ref-disposed.md) для simplified. Порядок: 1-й. | ✅ done | PR #23 (master `9c9b472` 2026-05-25) |
| TASK-026 | **Bug 1 — entityType const snake_case casing fix** (`replacement_util.ts` ENTITY + 2× M2M snake-rule lookahead, 10 unit tests). **Bonus meta-bug fix:** rename test files `_test.ts` → `.test.ts` (TASK-025 9 dead tests revived). Порядок: 2-й. | ✅ done | PR #24 (master `6c55788` 2026-05-25) |
| TASK-027 | **Bug 2 — enum `byName` → graceful `tryParseEnum` helper** (Option A shared `lib/core/utils/enum_parse.dart` + import injection в category/task/tag entity_extension templates, 9 unit tests). Closes [BUG-022](../bug-reports/022-enum-byname-state-error.md). Порядок: 3-й. | ✅ done | PR #25 (master `0a91e2b` 2026-05-25) |
| TASK-028 | **Bug 3 — LWW skip-stale guard default ON, junction opt-out** (4 simplified `*_local_apply.dart` patched + 15 unit tests). Closes silent data corruption на cross-device pull. **Adversarial caught:** Configuration "singleton" claim misleading → docstring fixed inline. Follow-up TASK-031/032 suggested. Порядок: 4-й. | ✅ done | PR #27 (master `1cb9bf3` 2026-05-25) |
| TASK-029 | **Bug 5 — `generate-entity --with-server` opt-in (default OFF)** (4 core files + VS Code quickPick + 20 tests). Breaking-change CLI — least-surprise после TASK-019 B2 incident. **Adversarial caught:** RelationPatcher тоже bypass filter → inline fix (RelationPatcher теперь filter'ит `server/` scan когда `!withServer`). Порядок: 5-й (последний). | ✅ done | PR #28 (master `5296ce3` 2026-05-26) |

### Закрыто в Phase B (для истории)

| ID | Описание | Status |
|---|---|---|
| TASK-022 | **B1 codegen core multi-template infrastructure** ✅ merged 2026-05-04 (PR #19, master `a3820e4`). | ✅ done |
| TASK-023 | **B2 Session 1 — BUG-019 fix subset** ✅ merged 2026-05-04 (PR #20, master `ff8f9d9`). | ✅ done |
| TASK-024 | **B2 Session 2 — simplified template directory bootstrap** ✅ merged 2026-05-04 (PR #21, master `accb1e2`). `DEFAULT_TEMPLATE` revert simplified → t115; simplified opt-in. | ✅ done |

---

## Открытые backlog (trigger-based per Discussion #9)

| ID | Severity | Description | Action |
|---|---|---|---|
| ~~BUG-001~~ | ~~High UI~~ | ~~Ref disposed в state_providers (Riverpod async)~~ | ✅ **CLOSED 2026-05-28** — TASK-025 (simplified state_providers) + TASK-032 (t115 state_providers) + TASK-033 (session_manager оба). Anti-pattern истреблён в обоих templates. |
| ~~BUG-023~~ | ~~Medium~~ | ~~generate-entity игнорирует урезанную ceremony~~ | ✅ **CLOSED 2026-06-05** (PR #35) — `--ceremony full\|minimal` (Design 1). |
| ~~BUG-024~~ | ~~High~~ | ~~Reserved Drift column-имя поля → silent broken build~~ | ✅ **CLOSED 2026-06-05** (PR #36) — pre-flight guard в EntityYamlValidator. |
| ~~BUG-025~~ | ~~High~~ | ~~Orchestrator no-op при отсутствии маркеров (verify-blind)~~ | ✅ **CLOSED 2026-06-05** (PR #37) — fail-fast guard. |
| BUG-026 | Medium (silent) | Junction FK-extraction не фильтрует `customerId` (wrong pair при нестандартном порядке) | ⏭ **DEFERRED → TASK-015** (2026-06-05). Blanket-fix ломает CustomerUser (customerId неоднозначен). Mitigation: declare-parents-first. |
| ~~BUG-027~~ | ~~Medium~~ | ~~one-to-many back-relation на regular entity → InvalidType build fail~~ | ✅ **CLOSED 2026-06-05** (TASK-034) — type-based фикс `field.type.startsWith('List<')` в `fieldsFilter` + `shouldSkipServerpodField` ([code_formatter.ts](../../../src/features/generation/parsers/formatters/code_formatter.ts)). **Root cause был неверен в bug-report:** bare `relation` (без скобок) → `isRelation=false`, `relationType` не выставлен; дискриминатор = тип `List<...>`, не relationType. Текло в ОБА слоя (entity loud + drift silent-wrong). verify t205 errors=0, 6 tests, Standard+Adversarial APPROVE. |
| BUG-014 | Low | `relation_patcher.ts` regex без word boundary anchoring | Defer until Initiative |
| BUG-015 | High codegen → **CONFIRMED + partial fix → BLOCKED** | Cross-feature junction (parents в **разных** features) generation broken | 🔴 **CONFIRMED (TASK-039, 2026-07-21, t206):** cross-feature junction (`author_book_map`: author в `authors`, book в `books`) FAIL, same-feature control (`product_vendor_map` в `catalog`) PASS — дельта однозначна. Root cause многослойный: шаблон junction'а хардкодит cross-feature импорты второго parent'а как same-feature-relative в **5 подсистемах** + drift-table. **Partial fix:** drift-table слой переведён на маркер `:driftTableImports` (cross-feature резолвится через `findTableInFeatures`) в t115+simplified, +3 теста, `BookTable is not a class!` устранена. **Остаток BLOCKED** (repository/data-providers/domain/usecases/presentation — 8 broken импортов, нет reuse-механизма → архитектурное решение за владельцем, 3 варианта в [bug-report 015](../bug-reports/015-cross-feature-junction.md)). `--workspace` для cross-feature обязан быть **полным путём** проекта, не голым именем. Junction `junction:`-директива несовместима с Serverpod (отдельный край). |
| ~~BUG-016~~ | ~~Medium~~ | ~~Junction MANY_TO_MANY substitution analog TASK-017~~ | ✅ **Appears RESOLVED (verified t201 2026-05-28)** — custom-named junction (author_book_map) substitution чистая errors=0, target names из YAML relations. Вероятно закрыт TASK-014/017. |
| BUG-017 | Low → Medium* | `onDelete=Cascade` для FK alias generates as `setNull` | `<weight-build TASK>`-driven (data integrity). НЕ тестировался в t201 prove-out. |
| BUG-018 | Low | `entity_yaml_validator` should warn on Serverpod reserved names | Defer |
| ~~BUG-019~~ | ~~Medium~~ | ~~Orchestrator snippet hardcoded literals~~ | ✅ Closed 2026-05-04 (TASK-024). |
| ~~BUG-020~~ | ~~Medium → Low~~ | ~~Junction substitution hardcoded `templEntity1`/`templEntity2` defaults (`task`/`tag`)~~ | ⚠ **Likely MOOT (re-classified 2026-05-28)** — premise не материализовался (оба templates сохранили `task_tag_map` fixture → defaults match). t201 custom junction PASS. Target-side substitution из YAML работает. См. [BUG-020](../bug-reports/020-junction-substitution-template-coupling.md). |
| BUG-005 | backlog | `:base` section overwrite при regen теряет custom code | git-diff procedure перед regen. Open architectural. Релевантно weight regen. |
| ~~TASK-CI-001~~ | ~~Medium~~ | ~~Minimal automated gate~~ | ✅ Done via TASK-020 — minimal single-job CI. |

---

## Approved sequence (Discussion #9, 5-6 months realistic, 6 hard ceiling)

**Month 1:**
- ✅ HOTFIX-001 closed — `new_task.py` сканирует active/ + done/ + blocked/
- ✅ TASK-CI-001 closed via TASK-020 — minimal CI gate ([.github/workflows/test.yml](../../../.github/workflows/test.yml)): compile + lint + 163 unit tests on PR/push to master
- Initiative Phase A (architectural design + ADR + sync_core integration audit + backend strategy + test inventory + dual-running risk audit)

**Month 2:**
- Initiative Phase B-D (generate-vs-not-generate divider + synthetic t<200> reference + `--template` CLI flag)
- **Phase A-D gate close** (5-deliverable checklist + closure-report.md TeamLead + User counter-sign)

**Month 3:**
- `<weight-build TASK>` start — fresh build на simplified template (only after Phase A-D gate closed). NB: TASK-020 уже занят CI gate, weight v2 получит next available ID через `new_task.py`.
- Initiative Phase E (acceptance side-by-side comparison)

**Month 4 (post clean-slate revision):**
- Weight build feature parity (UI + business logic manual write per simplified template philosophy)
- Initiative Phase F (documentation reconciliation: CLAUDE.md plurality + ADR-0005 + agent_memory.md split)
- Weight build cross-device runtime smoke
- Initiative Phase G (closure docs + multi-agent review)

**Hard ceiling 4 months (was 6):**
- Action на ceiling = scope cut (drop UI parity для some features), НЕ extend
- Removed under clean-slate: cutover plan, dual-running window planning, v1→v2 transition execution
- BUG-001 capacity-permitting

См. [roadmap.md](roadmap.md) для full 4-track sequence.

---

## Cross-repo state

- **codegen репо** (`devabacus/code-generator`): master `841764e` (post TASK-020 CI gate), 163 tests baseline + CI workflow + TASK-021 (PR #16 awaiting merge approval)
- **t115 template** (`devabacus/t115`): master `148ddf1` — **deprecated path** (frozen, no active maintenance, removal planned 6-12 месяцев если нет consumers, per ADR-0005 clean-slate amendment)
- **sync_core** (`devabacus/sync_core` 0.3.0): in master, validated multi-entity cross-device. Dual-running audit (Sub-A3) reference-only post clean-slate decision
- **weight v1**: ⚠ **NOT в production** (clean-slate decision 2026-05-03 — User confirmed нет real users, нет maintenance burden)
- **weight build** (TBD): fresh app на simplified template (`<weight-build TASK>` — next available ID), starts only after Initiative Phase A-D gate closed

---

## User decision points (post clean-slate amendment 2026-05-03)

| Decision | Required by | Owner | Status |
|---|---|---|---|
| Backend strategy (Option 1 same / 2 forked / 3 fresh) | Phase A start | User | ✅ confirmed Option 1 (Sub-A1 2026-05-03; trivially correct under clean-slate — nobody writing к backend ещё) |
| ~~Decision matrix v1 maintenance approval~~ | ~~Phase A start~~ | ~~User~~ | ⏭ **N/A under clean-slate** (нет v1 в production → нет maintenance criteria для approve) |
| ADR-0005 text counter-sign | Sub-A6 | User | ✅ confirmed 2026-05-03 ("ok а" implicit acknowledgment after PR #16 review + clean-slate amendments) |
| Phase A-D gate sign-off (closure-report.md) | Before `<weight-build TASK>` | User | ⏳ pending end of Phase D |
| ~~Cutover plan review~~ | ~~`<weight-build TASK>` closure~~ | ~~User~~ | ⏭ **N/A under clean-slate** (нет users чтобы migrate; weight build = installable app) |

**All Phase A user decisions ✅ resolved post clean-slate amendment.** Phase A-D gate sign-off remains future User decision (after Phase B/C/D execution).

---

## Architectural pivot context

**Discussion #7** (Multi-template plurality): t115 → legacy/advanced. New "Simplified Template Initiative" — standalone parallel track. **Generate vs не-generate divider:**
- **Generate:** Drift table, DAO, Repository impl, sync_core adapters, Riverpod data providers, mappings
- **Do NOT generate:** Usecases (CRUD = noise), application services, notifiers с business logic, validation
- **Optional via CLI flag:** Repository interface (`--with-interfaces`)

**Discussion #9** (weight v2 fresh build pivot): TASK-018 cancelled. weight v1 stays Clean (critical-only). weight v2 = fresh build на simplified template = real production validation. Backend strategy first Phase A decision.

См. [Discussion #7 archive](../discussions/archive/7-clean-architecture-overhead-стоит-ли-упр/) + [Discussion #8 archive](../discussions/archive/8-roadmap-approval-sequence-phase-15-closu/) (superseded by #9) + [Discussion #9 archive](../discussions/archive/9-weight-v2-fresh-build-на-simplified-temp/).

---

## Closed (Phase 1.5 история)

Sequence per Discussion #4 → #6:
- ✅ PR #6 BUG-013 (template markers fill 4 layers Approach A)
- ✅ PR #7 TASK-012 partial close (reduced scope verify PASS)
- ✅ PR #8 TASK-016 (parser FK alias support + helper + path/class normalization + quote-stripping)
- ✅ PR #9 TASK-017 (DAO substitution rewrite Approach A — full BUG-012 closure)
- ✅ PR #10 TASK-019 (re-acceptance final gate + handoff prep)
- ✅ PR #11 handoff.prompt.md commit

**Closed BUGs Phase 1.5:** BUG-002/003/004/005/006/008/009/011/012/013.

См. [TASK-019 report](../tasks/done/TASK-019-re-acceptance-full-fk-alias-scenario-verify-phase-1-5-final-gate/report.md) для full closure evidence.
| TASK-031 | Bug 3 t115 LWW guard parity | 🟡 In Progress | 2026-05-27 |
| TASK-032 | Bug 4 t115 ref.mounted guard parity | 🟡 In Progress | 2026-05-28 |
| TASK-033 | session manager ref.mounted guard both templates | 🟡 In Progress | 2026-05-28 |
| TASK-034 | BUG-027 fix one-to-many back-relation leak в flutter entity | 🟡 In Progress | 2026-06-05 |
| TASK-035 | cleanup redundant Map-эвристики в fieldsFilter (latent false-positive) | 🟡 In Progress | 2026-06-05 |
| TASK-036 | версионирование расширения + фикс reinstall handler (npx, auto-bump, vscodeignore) | 🟡 In Progress | 2026-06-09 |
| TASK-037 | junction FK extraction не фильтрует customerId (экс-BUG-026) | ✅ Merged (PR #47) | 2026-07-21 |
| TASK-038 | triage docs-code-generator/bugs-and-tasks.md — сверка с актуальным состоянием | ✅ Merged (PR #48) | 2026-07-21 |
| TASK-039 | BUG-015 cross-feature junction prove-out + фикс при провале | ✅ Merged (PR #49) | 2026-07-21 |
| TASK-040 | директива junction не проходит serverpod generate (property not allowed) | ✅ Merged (PR #51) | 2026-07-22 |
| TASK-041 | ужесточение junction fallback до fail-fast при структурной неоднозначности | ⛔ Active/BLOCKED (ждёт миграции шаблонов) | 2026-07-22 |
| TASK-042 | BUG-029 preflight + ledger — fail-closed guard против потери пользовательского кода | 🟡 Active (реализовано, ревью; ветка `feature/TASK-042-preflight-ledger`) | 2026-07-25 |
| TASK-043 | BUG-029 follow-up: per-file preserve вместо all-or-nothing overwrite + backup | 🟡 In Progress | 2026-07-28 |
| TASK-044 | CLI: поле conflicts в stdout-JSON generate-entity | 🟡 In Progress | 2026-07-28 |
| TASK-045 | Ledger: валидация project-relative путей (feature-path внутри workspace) | 🟡 In Progress | 2026-07-28 |
| TASK-046 | Ledger: протухающие записи для писателей вне plan (патчеры, bootstrap) | 🟡 In Progress | 2026-07-28 |
| TASK-047 | Полный цикл новой сущности на weight: with-server + verify | ✅ Done (errors=0, дельта ноль) | 2026-07-29 |
| TASK-048 | Карта риска миграции weight: прогон 11 оставшихся сущностей | ✅ Done (13 файлов под угрозой; поправка ×2 к числам) | 2026-07-29 |
| TASK-049 | Миграция шаблонов на merge-дисциплину: base-регионы в full-replace файлы | ⛔ BLOCKED (посылка опровергнута: :base спасёт 1 файл из 13) | 2026-07-30 |
| TASK-050 | BUG-032: в t115 нет enum_parse — regen сущности с enum ломает сборку | ✅ Done (E2E t213 errors=0, 468 тестов) | 2026-07-30 |
| TASK-050 | BUG-032 t115 без enum_parse — regen сущности с enum-полем ломает сборку | 🟡 In Progress | 2026-07-30 |
