# Отчёт TASK-047 — полный цикл новой сущности на weight (`--with-server` + verify)

## Резюме

**Вердикт: новые сущности в weight добавлять можно сегодня, без оговорок по компиляции.**

Разведка 2026-07-28 показала половину: сущность генерируется без конфликтов (exit 0), но
прогон шёл без `--with-server` и компиляция не проверялась. Вторая половина закрыта:
с `--with-server` цикл проходит целиком, `flutter analyze` даёт **errors=0**, и числа
**совпадают с baseline до генерации байт-в-байт** — сущность не добавила ни одной ошибки,
ни предупреждения, ни info.

## Что сделано

Прогон в worktree-копии `G:/Projects/Flutter/serverpod-probe/weight` (detached, HEAD `1d5f7c0`).
Оригинал `G:/Projects/Flutter/serverpod/weight` не тронут — проверено `git status` до и после.

Копия приведена к чистому состоянию перед стартом: сняты артефакты прошлой разведки
(`.codegen/`, `features/probe/`, `models/probe/`, правки `database.dart` и
`sync_orchestrator_provider.dart`). YAML'ы прошлой сессии сохранены и переиспользованы —
они уже прошли валидацию BUG-004.

Сущность: `ProbeItem` (7 полей, без relations), feature `probe`, ceremony `full` (default).

## Числа

### Baseline — ДО генерации

```text
node out/adapters/cli/index.js verify --name weight --projects-path "G:/Projects/Flutter/serverpod-probe" --human

PASS: verify weight
  ✓ flutterAnalyze — 19262ms (errors=0, warnings=1, infos=46)
  ✓ pubGet — 6125ms
  ✓ serverpodGenerate — 26097ms
  ✓ buildRunner — 76532ms
Total: 128019ms
```

Baseline чистый — значит любая ошибка после генерации была бы наша.

### Генерация с `--with-server`

```text
node out/adapters/cli/index.js generate-entity \
  --yaml ".../weight_server/lib/src/models/probe/probe_item.spy.yaml" \
  --feature-path ".../weight_flutter/lib/features/probe" \
  --workspace "G:/Projects/Flutter/serverpod-probe/weight" \
  --projects-path "G:/Projects/Flutter/serverpod-probe" \
  --with-server --human

SUCCESS: generate-entity
Created (25): 23 flutter + weight_server/lib/src/endpoints/probe_item_endpoint.dart + .codegen/ledger.json
Modified (2): sync_orchestrator_provider.dart, database.dart
Ledger: записано 24, seed 0
Duration: 156ms
EXIT=0 — ни одного конфликта
```

Серверная часть на месте: `--with-server` дал `probe_item_endpoint.dart` в `weight_server/`
(в разведке без флага его не было).

### `verify` — ПОСЛЕ генерации

```text
PASS: verify weight
  ✓ flutterAnalyze — 15551ms (errors=0, warnings=1, infos=46)
  ✓ pubGet — 5005ms
  ✓ serverpodGenerate — 20260ms
  ✓ buildRunner — 44849ms
Total: 85666ms
```

**errors=0, warnings=1, infos=46 — идентично baseline.** Дельта от новой сущности — ноль.

### Общие файлы: пользовательский код не пострадал

```text
git diff --numstat
19  0   weight_flutter/lib/core/sync/sync_orchestrator_provider.dart
6   1   weight_flutter/lib/core/data/datasources/local/database.dart
```

Единственная удалённая строка во всём диффе — `int get schemaVersion => 25;` (заменена на 26).
Больше ни одного удаления. Ровно то, что требовал критерий приёмки.

### Повторный прогон молчит

```text
SUCCESS: generate-entity
Modified (27)
Duration: 70ms
EXIT=0 — ни одного конфликта
```

Ledger отработал: `existing == ledger` → молчаливая перезапись, конфликта нет.
Патчеры идемпотентны — после второго прогона диффы те же (19/0 и 6/1),
`schemaVersion` остался **26** (не подскочил до 27), вставки не задвоились.

## Побочные наблюдения (не дефекты, но зафиксировать стоит)

1. **`[SectionReplacer] Generator function not found for name: base` ×3** в первом прогоне.
   Не дефект: `:base` — не секционный генератор, а при **создании** файла идёт полный render.
   Поведение описано комментарием в
   [generation_service.ts:428-434](../../../../../src/features/generation/generators/generation_service.ts)
   и покрыто тестом «merge-ветка не гоняет шаблон через SectionReplacer». Во втором прогоне
   (target существует → merge-ветка) шума нет. Кандидат на косметику: внести `base`
   в `SECTION_REPLACER_SKIP_MARKERS`.

2. **Доля merge-файлов на свежей сущности — 3 из 24 (12.5%).** В ledger'е ровно 3 записи
   с `ownership: merge`, остальные 21 — full-replace. Это **ниже** прежней оценки 16%
   (6 из 38) из разведки. Замер полезен для [TASK-049](../../active/TASK-049-миграция-шаблонов-на-merge-дисциплину--base-регионы-в-full-replace-файлы/task.md)
   как отправная точка «до».

3. **`database.dart` и `sync_orchestrator_provider.dart` в ledger не попали** — 24 записи,
   обоих файлов нет. Это ровно [TASK-046](../../active/TASK-046-ledger--протухающие-записи-для-писателей-вне-plan--патчеры--bootstrap/task.md)
   (писатели вне plan), наблюдение подтверждено на реальном проекте.

4. **`serverpod generate` на weight переписывает ~60 файлов в `weight_server/lib/src/generated/`**
   (4866 вставок / 4391 удалений) — дрейф версии Serverpod относительно того, чем weight
   генерировался раньше. Произошло на **baseline**-прогоне, до появления сущности; к
   `generate-entity` отношения не имеет, analyze после этого чистый. Но при реальной миграции
   weight этот дифф придёт вместе с первым же `serverpod generate` — учитывать в TASK-048/049.

## Ограничение прогона (честно)

Копия сделана на HEAD `1d5f7c0` и **отстаёт от текущего weight на 21 коммит** (`df84e21`).
Проверено: дельта целиком в рукописных слоях — `device_settings`, `configuration/presentation`,
`settings_definitions`, тесты, `shared/api_spec`. Ни одного `.spy.yaml`, `database.dart`,
`sync_orchestrator_provider.dart`, `*_dao/_table/_model/_adapter`. Для вопроса «генерируется
и компилируется ли новая сущность» копия репрезентативна; на всякий случай — вердикт снят
на состоянии `1d5f7c0`, не на сегодняшнем HEAD.

**Не проверялось:** runtime (миграция БД не применялась, сервер не поднимался, sync не гонялся).
`verify` покрывает compile + analyze, но не поведение. Для sync-регистрации новой сущности
это существенно — 19 вставок в оркестратор компилируются, но что они работают, этот прогон
не доказывает.

## Критерии приёмки

- [x] Сущность сгенерирована с `--with-server` — файлы и на клиенте, и в `weight_server/`
- [x] `serverpod generate --experimental-features=all` → exit 0
- [x] `build_runner build --delete-conflicting-outputs` → exit 0
- [x] `flutter analyze` → **errors=0**, warnings=1, infos=46 (идентично baseline)
- [x] Общие файлы не потеряли пользовательский код — только вставки + смена `schemaVersion`
- [x] Повторный прогон молчит, патчеры идемпотентны
- [x] Результат дописан в `weight-migration-probe-2026-07-28.md` — «Часть 3», факты 9-13
- [x] Явный вердикт в отчёте

## Риски / Заметки

- Копия weight оставлена **с** сгенерированной сущностью `probe_item` — как доказательство
  результата. TASK-048 требует чистого старта: перед ней прогнать
  `git checkout -- .` + `git clean -fd .codegen weight_flutter/lib/features/probe weight_server/lib/src/models/probe`.
- Вердикт касается **новых** сущностей. Регенерация **существующих** — отдельный вопрос,
  там 38 конфликтов на сущность (TASK-048/049).

## Статус

Готово, все критерии закрыты. Результат дописан в
[weight-migration-probe-2026-07-28.md](../../../docs/weight-migration-probe-2026-07-28.md) —
«Часть 3: полный цикл новой сущности», факты 9-13.
