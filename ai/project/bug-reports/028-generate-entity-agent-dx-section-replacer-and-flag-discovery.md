# 028 — generate-entity DX для агентов: `[SectionReplacer] base` warning + угадывание флагов (workspace-preset)

**Date:** 2026-06-26
**Reporter:** weight teamlead-агент (по итогам прогона `generate-entity` для сущности `DeviceOwner`, weight TASK-045)
**Severity:** Bug (warning) + Feature-request (DX)

## Контекст

Прогнал `generate-entity` через CLI для новой сущности `DeviceOwner` в weight (своя фича, `--ceremony minimal --with-server`). **Выхлоп корректный**: 22 файла вертикального среза + server endpoint, пропатчены `sync_orchestrator_provider` + `database.dart` (Drift schemaVersion bump), `flutter analyze` 0 errors, `flutter test` baseline, миграция верная (`CREATE TABLE` + аддитивный ALTER). По качеству генерации претензий нет. Ниже — DX-замечания агента.

Команда (verified для weight):

```bash
node out/adapters/cli/index.js generate-entity \
  --yaml .../weight_server/lib/src/models/device_owner/device_owner.spy.yaml \
  --feature-path .../weight_flutter/lib/features/device_owner \
  --workspace g:/Projects/Flutter/serverpod/weight \
  --ceremony minimal --with-server --human
```

## Issue 1 (BUG) — `[SectionReplacer] Generator function not found for name: base` ×3

При `generate-entity` в **stderr** трижды печатается:

```
[SectionReplacer] Generator function not found for name: base
```

(в PowerShell обёрнуто как `NativeCommandError`, что выглядит как сбой). При этом в конце — `SUCCESS: generate-entity`, все 22 файла созданы, analyze зелёный → **выхлоп правильный**.

**Вопрос/симптом:** `base` — это реально незаполненная marker-секция (тихая потеря части генерации) или безобидный leftover (секция, для которой нет generator-функции, но она и не нужна)? Сейчас агент не может отличить «всё ок» от «часть не сгенерилась» по этому варнингу — приходится верить только финальному analyze.

**Просьба:** либо убрать варнинг (если `base` не нужна в этом ceremony), либо downgrade в info с пояснением, либо fail-fast если секция реально обязательна. Сейчас он пугает (особенно через PowerShell-обёртку).

## Issue 2 (FEATURE-REQUEST, главное) — флаги для проекта приходится УГАДЫВАТЬ

Самое большое трение для агента — определить **правильные флаги** для конкретного workspace. Доки weight противоречат:
- старый `generator-guide.md`: `--template t115`, без ceremony;
- weight TASK-019: `--template simplified --with-interfaces`;
- актуально (verified): `--ceremony minimal`, без `--with-interfaces`, t115.

Правильный layout я определил **эмпирически** — заглянул в `features/weighing/`, увидел отсутствие usecases/`i_*`-интерфейсов → `--ceremony minimal`. `--help` («minimal = weight layout») помог, но не очевидно, что weight это **требует**, а не опция.

**Предложение:** **workspace-level preset** — напр. `.codegen.json` / `codegen.config.json` в корне целевого проекта, пинящий дефолты: `template`, `ceremony`, `withServer`, `withInterfaces`, базовый `feature-path`-паттерн. Тогда агент зовёт `generate-entity --yaml ... --feature-path ...` без флагов, а корректный layout берётся из конфигурации проекта. Это убрало бы основной источник ошибок агентов и рассинхрон доков.

## Issue 3 (MINOR) — `--with-server` по умолчанию OFF

Дефолт client-only (anti-scope-creep, TASK-029) логичен, но новая сущность по умолчанию **без серверного endpoint** → легко забыть для полноценной (admin/CRUD) сущности. Preset (Issue 2) закрыл бы и это.

## Issue 4 (FEATURE-REQUEST, опц.) — one-shot оркестрация полной цепочки

Вокруг `generate-entity` агент вручную гоняет: `serverpod generate` (до) → entity → `serverpod generate` (после) → `build_runner build` → `serverpod create-migration`. Один `codegen add-entity --full` (или расширение `local-setup`), оркестрирующий всю цепочку с verify, сильно упростил бы агентам и убрал ошибки порядка шагов.

## Issue 5 (MINOR, известно) — camelCase имена файлов

`*Dao.dart` / `cargoType_dao.dart` вместо snake_case → вечный `file_names` info-lint. Дубль [002](002-file-names-camelcase.md), отмечаю что всплыло снова на DeviceOwner.

## Приоритет (мнение агента)

**Issue 2 (preset)** — наибольший выигрыш: убирает угадывание флагов и рассинхрон доков, главную причину агентских ошибок. **Issue 1 (warning)** — дёшево почистить, снимает ложную тревогу. Остальное — nice-to-have.
