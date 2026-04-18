# BUG-001: Ref disposed в сгенерированном state_providers при async операциях

**Статус:** Open
**Обнаружено:** 2026-04-18
**Источник:** проект weight (Flutter), логи `.logs/flutter-android.log`
**Затронутые сущности:** `CorrectionButton`, `WeighingCorrection` (предположительно все новые сгенерированные entity-notifier'ы)

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
