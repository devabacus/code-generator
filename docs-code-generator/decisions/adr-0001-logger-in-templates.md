# ADR-0001: Использование LoggerService вместо print() в шаблонах

**Дата:** 2026-04-17
**Статус:** Предложено
**Scope:** шаблоны Flutter-генератора (DAO, local data source, remote data source)

## Контекст

Сгенерированные Flutter-файлы содержат `print()` в catch-блоках для логирования ошибок:

```dart
try {
  await into(driverTable).insert(companion);
  return id;
} catch (e) {
  print('fail of creating driver: $e');  // ❌ avoid_print
  rethrow;
}
```

Проблема для потребителей генератора (например, `weight_flutter`):

1. **В production `print()` уходит в stdout и пропадает.** Нет видимости ошибок без подключения к устройству.
2. **Сломан structured logging pipeline.** Потребители подключают Talker (in-app UI для field debugging) + file logger (для AI-отладки) + в перспективе Sentry. `print()` мимо всей этой инфраструктуры.
3. **Частичный фикс костылём.** Сейчас применяется `// ignore_for_file: avoid_print` (см. `bugs-and-tasks.md` #10) — подавление warning, но не устранение причины.
4. **Каждая регенерация возвращает `print()`**, даже если потребитель вручную почистил — ручные правки в сгенерированных секциях перезаписываются.

Затронутые шаблоны:
- `*_dao.dart` — 1 `print()` в create-метод (9 DAO × 1 = 9 вхождений).
- `*_local_data_source.dart` — шаблон `configuration_local_data_source.dart` содержит 8 `print()` в reconcile/handleSyncEvent.
- `*_remote_data_source.dart` — раньше 5-7 `print()` на файл, но потребитель уже вручную исправил (см. `weight_flutter` commit `2ca3b94`). При следующей регенерации вернутся — если не менять шаблон.

## Варианты

### A. Оставить `print()` + `// ignore_for_file: avoid_print`

Текущее поведение. Минимум работы в генераторе. Потребителю надо либо мириться, либо патчить руками после каждой регенерации.

### B. Заменить `print()` на `LoggerService` в шаблонах

Сгенерированные классы принимают `LoggerService` в конструктор и используют его в catch-блоках:

```dart
try {
  await into(driverTable).insert(companion);
  return id;
} catch (e, st) {
  _logger.error('fail of creating driver', e, st);
  rethrow;
}
```

Требует:
- Обновить шаблоны DAO, local_data_source, remote_data_source — добавить `LoggerService` в конструкторы.
- Обновить шаблоны data_providers (places, где создаются DAO/datasource) — передать `ref.read(loggerServiceProvider)` при создании.
- Обновить шаблоны repository_impl — если они создают кого-то руками (обычно через provider).

### C. Использовать `debugPrint()` вместо `print()`

Минимальное изменение: в шаблоне `print()` → `debugPrint()`. `debugPrint` — функция Flutter, которая в release-mode noop.

Плюсы: 0 изменений в конструкторах.
Минусы: решает только "линтер-warning", **ошибки в prod всё равно теряются** (то же что и print — не идёт ни в Talker, ни в файл, ни в Sentry).

## Решение

**Выбран вариант B.**

Причины:
- Только B интегрирует сгенерированный код в структурный logging pipeline потребителя.
- У потребителей (`weight_flutter`) `LoggerService` уже инфраструктура, подключение тривиально.
- Sentry-интеграция (ADR-0007 в `weight` проекте) требует чтобы ошибки из catch-блоков попадали в breadcrumbs/events — это возможно только через `LoggerService`, а не `print()`/`debugPrint()`.

## Последствия

### Потребители

- При обновлении генератора: потребители должны предоставить `loggerServiceProvider` (он уже есть в `weight_flutter`).
- Старые места создания DAO/datasource потребуют 1-строчных изменений (добавить `logger` в аргументы) — breaking change для потребителей, которые уже использовали старый генератор.
- Рекомендация: выпустить новую версию генератора с bump major (например `0.2.0`), потребители обновляются с ручным фиксом мест создания.

### Файлы генератора, которые нужно изменить

Точные пути требуют дополнительного исследования — базовая архитектура:

- Шаблоны Flutter-файлов используются через section-маркеры (`// === generated_start:base ===`), генерация идёт через `section_generators.ts` + `code_formatter.ts`.
- Нужно найти и обновить:
  - Шаблон DAO (где генерируется `create<Entity>` метод с try/catch).
  - Шаблон local_data_source (reconcile + handleSyncEvent — 8 вызовов `print` в `configuration`).
  - Шаблон remote_data_source (getXxx, createXxx, updateXxx — все catch-блоки).
  - Шаблон data_providers (place где создаётся instance: добавить `logger: ref.read(loggerServiceProvider)`).
- Удалить `// ignore_for_file: avoid_print` — больше не нужен.

### Обратная совместимость

- Нулевая: шаблоны меняют сигнатуру конструкторов (new required field `LoggerService logger`).
- Потребителю придётся обновить места создания. В `weight_flutter` это 9 провайдеров (по одному на сущность).

### Что пересмотреть позже

- Когда будет обсуждаться переход на Sentry — логирование уже пойдёт через `LoggerService`, и Sentry-интеграция окажется на уровне `LoggerService`-реализации (`SentryLoggerService`), без изменения сгенерированного кода.
- Если появится потребитель без Talker/`LoggerService` — возможно сделать `LoggerService` опциональным параметром с fallback на `debugPrint`.

## Ссылки

- `weight_flutter` commit `2ca3b94` — ручная правка `print()` → `LoggerService` в 9 remote_data_source, которые при регенерации откатятся.
- `weight_flutter` commit `82c7a0b` — правка print() в не-генерируемых файлах (остались только генерируемые).
- `weight_flutter/ai/docs/decisions/adr-0007-flutter-error-tracking.md` — план миграции на Sentry, зависит от этого ADR.
- `bugs-and-tasks.md` #10 — предыдущее промежуточное решение (подавление warning).
