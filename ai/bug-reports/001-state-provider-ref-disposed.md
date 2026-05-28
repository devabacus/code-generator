# BUG-001: Ref disposed в сгенерированном state_providers при async операциях

**Статус:** Resolved для **обоих** templates — simplified (TASK-025, 2026-05-25) + t115 (TASK-032, 2026-05-28). ⚠ Residual: `core/providers/session_manager_provider.dart` unguarded `state = userContext` после await (adversarial F3, оба templates, pre-existing) → follow-up TASK.
**Обнаружено:** 2026-04-18
**Частично закрыто:** 2026-05-25 (TASK-025, simplified template patch + 9 unit tests + e2e t186 verify PASS errors=0)
**Источник:** проект weight (Flutter), логи `.logs/flutter-android.log`
**Затронутые сущности:** `CorrectionButton`, `WeighingCorrection` (предположительно все новые сгенерированные entity-notifier'ы)

## Scope of resolution (важно)

- ✅ **Simplified template** — anti-pattern истреблён (TASK-025). Любая новая сущность сгенерированная через `codegen generate-entity --template simplified` получает guard out-of-box.
- ✅ **t115 template** — anti-pattern истреблён (TASK-032, 2026-05-28). Identical 11-guard pattern в 4 `*_state_providers.dart` (usecase variant). Под ADR-0005 amendment "bug-fix-as-needed" (t115 supported, не strictly frozen). verify t198 PASS errors=0. Template в `devabacus/t115`.
- ⚠ **Residual (оба templates):** `core/providers/session_manager_provider.dart` `_fetchUserContext()` — `state = userContext;` после `await` без `ref.mounted` guard (другой shape, не покрыт grep `state = await AsyncValue.guard`). Pre-existing, не TASK-025/032 introduced. Adversarial F3 finding → отдельный follow-up TASK для core/providers обоих templates.
- ⚠ **weight v1 (на t115)** — production crashes (`CorrectionButton`/`WeighingCorrection`) **НЕ исправлены** этой задачей. Требуют либо:
  - (a) ручной patch уже-сгенерированных файлов в weight repo (manual);
  - (b) regenerate существующих 13 сущностей на simplified в рамках `<weight-build TASK>` (clean-slate, fresh app);
  - (c) отдельной chore-задачи "TASK-XXX patch t115 state_providers" — capacity-driven, не приоритет под clean-slate decision (weight v1 НЕ в production).
- ⚠ **Существующие проекты на simplified** (например t179..t186) — содержат старо-сгенерированные файлы до TASK-025. Любая регенерация сущности (через `generate-entity --template simplified`) принесёт guard; либо ручной patch.

## Resolution (TASK-025, 2026-05-25)

**Фикс — template patch only** (4 файла в `G:/Templates/flutter/simplified/.../presentation/providers/<entity>/<entity>_state_providers.dart`):

```dart
// BEFORE (BUG-001 anti-pattern):
state = await AsyncValue.guard(() async {
  await repository.createCategory(category);
  return repository.getCategories();
});

// AFTER (TASK-025 fix):
final result = await AsyncValue.guard(() async {
  await repository.createCategory(category);
  return repository.getCategories();
});
if (!ref.mounted) return;
state = result;
```

**Изменения (simplified template, 11 mutation методов total):**
- `category/category_state_providers.dart` — 3 mutation (add/update/delete) ✅
- `task/task_state_providers.dart` — 3 mutation ✅
- `tag/tag_state_providers.dart` — 3 mutation ✅
- `task_tag_map/task_tag_map_state_providers.dart` — 2 mutation (addTag/removeTag); `state = const AsyncValue.loading();` pre-await сохранён (синхронно, не race) ✅
- `configuration/configuration_state_providers.dart` — skip (только stream, mutation методов нет)

**Regression tests** ([src/test/generators/state_providers_ref_mounted_test.ts](../../src/test/generators/state_providers_ref_mounted_test.ts)) — 9 тестов в 3 suite'ах:
- 3 inline golden (pre-substitution shape — guards count + state=result count + 0 anti-pattern + ordering)
- 2 post-substitution invariant (ReplacingFileProcessor + ENTITY rules Category→Order / Category→Widget — guards survive substitution)
- 4 live template regression (disk-dependent, skip if template path недоступен на CI)
- Total: 190 mocha passing (baseline 181 + 9 новых).

**End-to-end DoD evidence** (t186, 2026-05-25 post-TASK-030 master `bffe07a`):
- `generate-entity` для CargoType (multi-word entity) → `cargo_type_state_providers.dart` с 3 guards / 3 state=result / 0 anti-pattern (substitution Category→CargoType сохранила guards intact).
- `codegen verify --name t186 --human` → **PASS errors=0 warnings=0 infos=30** (Total 39887ms).

**t115 template НЕ trog'ался** — frozen / deprecated path per Discussion #11 stack-lock decision. Если weight v1 нужно patches на t115 шаблон — отдельная задача (capacity-driven, не часть TASK-025 scope).

См. [TASK-025 report.md](../tasks/done/TASK-025-bug-4---riverpod-ref-mounted-в-state-providers/report.md) (после merge) для full closure evidence + multi-agent review summary.

---

## Original analysis (preserved для context)

## Симптом

При вызове `addXxx` / `updateXxx` / `deleteXxx` из UI после async операции падает Unhandled Exception:

```
Unhandled Exception: Cannot use the Ref of weighingCorrectionsProvider after it has been disposed.
This typically happens if:
- A provider rebuilt, but the previous "build" was still pending and is still performing operations.
  You should therefore either use `ref.onDispose` to cancel pending work, or
  check `ref.mounted` after async gaps or anything that could invalidate the provider.
- You tried to use Ref inside `onDispose` or other life-cycles.

#0  Ref._throwIfInvalidUsage (package:riverpod/src/core/ref.dart:220:7)
#1  AnyNotifier.state= (package:riverpod/src/core/provider/notifier_provider.dart:91:9)
#2  WeighingCorrections.addWeighingCorrection (weighingCorrection_state_providers.dart:17:5)
```

## Причина

Генератор создаёт `Xxx_state_providers.dart` **без проверки `ref.mounted` после async gap'а** перед присваиванием `state = ...`.

### Плохой шаблон (сгенерирован для `CorrectionButton`, `WeighingCorrection`):

```dart
Future<void> addCorrectionButton(CorrectionButtonEntity correctionButton) async {
  state = await AsyncValue.guard(() async {
    await ref.read(createCorrectionButtonUseCaseProvider)!(correctionButton);
    return ref.read(getCorrectionButtonsUseCaseProvider)!();
  });
}
```

Если провайдер диспозится во время `AsyncValue.guard(...)`, присваивание `state = ...` бросает `Ref disposed`.

### Правильный шаблон (сгенерирован для `Contractor`):

```dart
Future<void> addContractor(ContractorEntity contractor) async {
  await ref.read(createContractorUseCaseProvider)!(contractor);
  if (!ref.mounted) return;    // ← защита после async gap'а
  state = await AsyncValue.guard(() => ref.read(getContractorsUseCaseProvider)!());
}
```

Два отличия:
1. `await ref.read(createXxx)` **вне** `AsyncValue.guard` (create — fire-and-forget для ошибки будет разобрано внутри repo)
2. `if (!ref.mounted) return;` **между** create и `state = ...` — страхует от disposed
3. `state` получает только результат `getXxx`, обёрнутый в `AsyncValue.guard`

## Как фиксить генератор

Привести шаблон `Xxx_state_providers.dart` для методов `addXxx` / `updateXxx` / `deleteXxx` к эталону contractor. Использовать один и тот же формат для всех сущностей.

Предположительно шаблон находится в templates кодогенератора — там где описываются мутирующие методы notifier'а (`@riverpod class Xxx extends _$Xxx`).

## Reproduction (проект weight)

1. Сущность `CorrectionButton` (создана в TASK-003 через YAML + `Create Data Files from YAML`).
2. Страница `features/correction/presentation/pages/correction_page.dart` вызывает `ref.read(correctionButtonsProvider.notifier).addCorrectionButton(entity)`.
3. Во время async операции (create на сервере → reconcile → update state) провайдер может быть rebuilt (например auth state flicker, hot-reload, навигация с диспозом).
4. `state = ...` на disposed Ref → crash.

## Workaround, использованный в проекте weight

В `correction_page.dart` писать напрямую через репозиторий, минуя notifier:

```dart
final repo = ref.read(currentUserCorrectionButtonRepositoryProvider);
if (repo != null) await repo.createCorrectionButton(result);
```

Это костыль — работает, но дублирует логику notifier'а в UI и не чинит другие сущности (`WeighingCorrection` до сих пор падает, т.к. там шаг workaround'а не сделан).

## Затронутые файлы в weight (проверенные)

**Плохо сгенерированы (нужна пере-генерация после фикса шаблона):**
- `weight_flutter/lib/features/weighing/presentation/providers/correctionButton/correctionButton_state_providers.dart`
- `weight_flutter/lib/features/correction/presentation/providers/weighingCorrection/weighingCorrection_state_providers.dart`

**Правильно сгенерированы (эталон):**
- `weight_flutter/lib/features/weighing/presentation/providers/contractor/contractor_state_providers.dart`
- Аналогично: `vehicle`, `driver`, `cargoType`, `customField`, `weighing`, `weighingPhoto`

## Вопросы для исследования

- Почему шаблон расходится между сущностями? Может быть разные версии генератора применялись?
- Есть ли conditional в шаблоне (например, при наличии `defaultPersist=random_v7` в YAML идёт другой путь)?
- Общий шаблон для всех notifier'ов или по сущности свой?

## Приоритет

**High** — баг появится в каждой новой сущности пока не починишь генератор. Каждая новая YAML-модель приносит свой crash из коробки.
