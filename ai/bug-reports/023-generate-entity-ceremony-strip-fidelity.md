# BUG-023: generate-entity не уважает урезанную ceremony существующего проекта (usecases + datasource-интерфейсы пишутся безусловно)

**Статус:** RESOLVED (Design 1, 2026-06-05) — см. [Решение](#решение-design-1-ceremony-профиль) ниже. ⚠ Scope: minimal вырезает usecases, НО ds-интерфейсы оставляет by design (см. [Known limitations](#known-limitations--follow-ups)).
**Обнаружено:** 2026-06-05 (weight TASK-030 реген-пилот `CorrectionButton`)
**Источник:** weight teamlead — пилот добавления поля `compensation` в существующую sync-сущность через `generate-entity`
**Критичность:** Medium — НЕ блокирует weight (есть ручной workaround BUG-003 marker-section field-add), но делает неполным обещание «генератор готов для регена 13 существующих sync-сущностей weight»

## Симптом

При `generate-entity` на **существующую** сущность, у которой ceremony-слои были **вручную урезаны** после первичной генерации (паттерн weight: repository-интерфейс оставлен, datasource-интерфейсы и usecases удалены, datasource — конкретный класс), генератор **re-добавляет** удалённые слои:

- `domain/usecases/<entity>_usecases.dart` (+ `domain/providers/<entity>/<entity>_usecase_providers.dart`)
- `data/datasources/local/interfaces/<entity>_local_datasource_service.dart`
- `data/datasources/remote/interfaces/<entity>_remote_datasource_service.dart`

…и переключает `repository_impl` + `data_providers` с конкретного datasource на интерфейс (`CorrectionButtonLocalDataSource` → `ICorrectionButtonLocalDataSource`), расходясь с HEAD.

**Ни один флаг не воспроизводит урезанный гибрид weight:**

| Запуск | repository-интерфейс | datasource-интерфейсы | usecases | Совпадает с weight HEAD? |
|--------|:---:|:---:|:---:|:---:|
| weight HEAD (эталон, урезано вручную) | ✅ есть | ❌ нет | ❌ нет | — |
| `generate-entity` (default) | ❌ конкретный | ✅ **добавляет** | ✅ **добавляет** | ❌ |
| `generate-entity --with-interfaces` | ✅ есть | ✅ **добавляет** | ✅ **добавляет** | ❌ |

`--with-interfaces` управляет только **repository**-интерфейсом; datasource-интерфейсы и usecases он НЕ отделяет — они эмитятся в обоих режимах.

## Repro (из weight TASK-030)

```bash
# correction_button — существующая sync-сущность weight, ceremony урезана вручную
# (// flags: withInterfaces + datasource-интерфейсы стрипнуты, см. repository_impl.dart)
node out/adapters/cli/index.js generate-entity \
  --yaml .../weight_server/lib/src/models/weighing/correction_button.spy.yaml \
  --feature-path .../weight_flutter/lib/features/weighing \
  --workspace .../weight \
  --with-interfaces --human
# → Modified (25) включает СОЗДАНИЕ:
#   data/datasources/local/interfaces/correction_button_local_datasource_service.dart
#   data/datasources/remote/interfaces/correction_button_remote_datasource_service.dart
#   domain/usecases/correction_button_usecases.dart
#   domain/providers/correction_button/correction_button_usecase_providers.dart
# которых НЕТ ни у одной соседней сущности feature/weighing → orphan creep + расхождение архитектуры.
```

Итог в weight: пилот пивотнул на ручной marker-section field-add (BUG-003), а 4 orphan-файла пришлось удалять вручную.

## Root cause (гипотеза)

`generate-entity` копирует **все** template-файлы `manifest: entity` из `feature/` шаблона t115 в target, **без проверки фактического layout target-проекта**. Аналогично тому, как до TASK-029 (BUG-5) `generate-entity` молча scope-creep'ил в `server/` — пока не добавили фильтр `shouldScanDir(manifest, dir, withServer)` + флаг `--with-server`. Здесь не хватает симметричного механизма для ceremony-слоёв.

## Предлагаемое решение (на выбор генератор-тимлида)

1. **Ceremony-профиль/флаг** (по аналогии с `--with-server` фильтром, TASK-029): например `--ceremony minimal|full` или раздельные `--no-usecases` / `--concrete-datasource`. Фильтр исключает `domain/usecases/`, `domain/providers/<e>/<e>_usecase_providers`, `data/datasources/{local,remote}/interfaces/` из scan_dirs при `minimal`. weight = `minimal` + `--with-interfaces` (repo-интерфейс отдельно).
2. **Auto-detect существующего layout:** перед эмитом ceremony-файла проверить, есть ли он у соседних сущностей в target feature (или есть ли уже урезанный `// flags:` маркер) → не создавать слой, которого проект не держит. Менее предсказуемо, но без новых флагов.

Вариант 1 предпочтительнее (явный, как `--with-server`).

## Связанные

- [BUG-003](003-new-relation-not-patched-in-existing-feature.md) — regen на existing feature перезаписывает custom code (для add-field есть ручной marker workaround, им и закрыли weight TASK-030).
- TASK-029 / [with_server_filter.test.ts](../../src/test/generators/with_server_filter.test.ts) — эталон фильтра scope (`--with-server`), на который должен опираться фикс.

## Что НЕ относится к этому багу

- ✅ Фикс **LWW skip-stale guard** (TASK-028/031) — в пилоте **подтверждён рабочим**: custom guard в `correction_button_local_apply.dart` пережил реген.
- Дрейф dart-форматтера на 48 generated-файлах при `serverpod generate` — это Dart SDK / weight-репо гигиена, **не** code-generator.

## Repro-тест

[src/test/generators/ceremony_strip_fidelity.test.ts](../../src/test/generators/ceremony_strip_fidelity.test.ts) — переписан в **post-fix** тест (Design 1): pure `matchesCeremonyFlag` + integration через `GenerationService` + `MockFileSystem`. Проверяет: full эмитит usecases; minimal их НЕ эмитит; ds-интерфейс сохраняется (Design 1); presentation в minimal берётся из `.minc`-варианта (repository-direct), sentinel `.minc` срезан.

---

## Решение (Design 1: ceremony-профиль)

**Выбран Вариант 1** (explicit флаг, как `--with-server` TASK-029). User decision 2026-06-05: **Design 1** — бить по реальному «шуму» (usecases per Discussion #7), не дублировать sync-критичный `local_data_source` (270 строк, risk drift).

**Новый флаг `--ceremony <full|minimal>`** (default `full`), ортогонален `--with-interfaces`.

**Что делает `minimal`:**
- **Вырезает** `domain/usecases/<e>_usecases.dart` + `domain/providers/<e>/<e>_usecase_providers.dart`.
- **Переключает** presentation (`<e>_state_providers.dart`, `<e>_get_by_id_provider.dart`) на прямой вызов repository через `.minc`-варианты шаблона (`ref.mounted` guards BUG-001/TASK-032 сохранены).

**Что `minimal` НЕ трогает (by design):** datasource-интерфейсы, `repository_impl`, `data_providers` — общие для обоих режимов. Discussion #7 относит к «noise» только usecases; ds-интерфейсы там не упомянуты. Дублировать `local_data_source` (sync-критичный `:base`-merge файл) ради вырезания local-интерфейса = недопустимый risk drift.

**Механизм:** маркеры `// flags: fullCeremony` / `// flags: minimalCeremony` + `MarkerAnalyzer.matchesCeremonyFlag` (унифицировано с `--with-interfaces`). Sentinel `.minc` в имени файла срезается в `_getDestinationPath`. Default `full` сохраняет исторический t115 output (модуло добавленные comment-строки `// flags:`).

**Изменённые файлы:**
- `src/features/generation/generators/marker_analyzer.ts` — тип `CeremonyProfile` + `matchesCeremonyFlag`.
- `src/features/generation/config/generation_config.ts` — поле `ceremony` (default `'full'`).
- `src/features/generation/generators/generation_service.ts` — фильтр после `matchesInterfaceFlag` + `.minc` в sentinel-regex.
- `src/adapters/cli/commands/generate_entity.ts` — опция `--ceremony`.
- t115 template (`features/tasks/`): тег `flags: fullCeremony` на 4 файлах (category usecases, usecase_providers, state_providers, get_by_id_provider) + 2 новых `.minc`-варианта (state_providers, get_by_id_provider).
- `src/test/generators/ceremony_strip_fidelity.test.ts` — post-fix тест.

### Verification (DoD)

- **Unit:** 285 passing (271 baseline + 14 ceremony: 5 `matchesCeremonyFlag` + 2 config default + 7 integration). compile clean, lint 0 errors / 18 pre-existing warnings.
- **Full regression** — `create-project t202` (default full) → `verify t202`: **errors=0**, warnings=1, infos=44. Default output не изменился.
- **Minimal path** — fresh entity `Note` → `generate-entity --ceremony minimal --with-server` → `verify t202`: **errors=0**, warnings=1, infos=44. Сгенерировано 22 файла, **БЕЗ** `note_usecases`/`note_usecase_providers`, без `.minc`-протечки, presentation = repository-direct.

### Multi-agent review

- **Standard:** APPROVE-WITH-CHANGES (CRITICAL/HIGH = 0). Required change = documentation (M1, ниже). Verified: filter placement, sentinel strip, no dangling refs, `ref.mounted` parity, backward compat.
- **Adversarial:** no CRITICAL/HIGH deal-breakers. Findings = scope-doc (= M1) + junction no-op (= L2).

## Known limitations / follow-ups

⚠ **Эти пункты НЕ закрыты Design 1 — weight teamlead должен знать перед регеном:**

1. **ds-интерфейсы остаются (M1, оба reviewer'а).** `minimal` убирает **2 из 4** orphan'ов исходного repro (usecases + usecase_providers), но **НЕ** убирает `<e>_local_datasource_service.dart` + `<e>_remote_datasource_service.dart`. t115 `minimal` ≠ weight HEAD (там datasource = конкретный класс). При регене weight получит 2 ds-интерфейса — удаляются разово, это не orphan-creep уровня usecases. Это **сознательный trade-off Design 1** (User approved 2026-06-05).
2. **Junction (manyToMany) `--ceremony minimal` = no-op (L2, adversarial Finding 2).** Junction-файлы (`task_tag_map_usecases` и т.п.) не помечены ceremony-флагом → при `--ceremony minimal` на junction usecases всё равно эмитятся (компилируется, но «minimal» не применяется). Follow-up если weight регенит junctions под minimal.
3. **Ceremony-теги только для `category`-шаблона (L1).** Sibling templates (`task`/`tag`/`task_tag_map`) не помечены. Безопасно для `generate-entity` (single-entity фильтруется по `templEntity=category`) и `create-project` (не эмитит tasks feature). Но `--templ-entity task --ceremony minimal` НЕ вырезал бы task usecases. Расширить при необходимости.

**Cosmetic (не баги):** comment-строки `// flags: fullCeremony` попадают в generated output (как и существующие `// manifest:`); Dart их игнорирует.
