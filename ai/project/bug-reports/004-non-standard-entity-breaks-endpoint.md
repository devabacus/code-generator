# BUG-004: Non-standard entity (без userId/customerId/isDeleted и/или sync-event) ломает endpoint-шаблон

**Статус:** Resolved (2026-04-25, TASK-009, ветка `feature--fix-codegen-regen-bugs`)
**Обнаружено:** 2026-04-22
**Источник:** проект weight (Serverpod 3.1.1), TASK-007, сущность `AppSetting`
**Критичность:** High — блокирует `serverpod generate` (invalid Dart syntax в сгенерированном endpoint'е)

## Resolution

Добавлена pre-flight валидация в `EntityYamlValidator` (`src/features/generation/parsers/entity_yaml_validator.ts`). При отсутствии `userId`/`customerId`/`isDeleted` ИЛИ парного `<entity>_sync_event.spy.yaml` codegen прерывается с понятным сообщением и **не создаёт ни одного файла**. Escape hatch: `--skip-validation` (CLI) или кнопка "Generate anyway" (VS Code).

См. [TASK-009 report](../tasks/active/TASK-009-fix-bug-004-validate-entity/report.md).

> **Не входит в фикс:** опция `--mode minimal` / `generationMode: systemScoped` в YAML для генерации ограниченного набора (Drift table + entity/model + extension, без endpoint/sync) — long-term, отдельная задача (TASK-010 в backlog).

## Симптом

Сгенерированный `appSetting_endpoint.dart` ссылается на поля, **которые отсутствуют в YAML-модели** (`userId`, `customerId`, `isDeleted`) и на класс `AppSettingSyncEvent`, которого тоже нет (ADR-0014 явно запрещает sync-event для AppSetting). `serverpod generate` падает:

```
Endpoint analysis skipped due to invalid Dart syntax.
Please review and correct the syntax errors.
File: weight_server/lib/src/endpoints/appSetting_endpoint.dart
✗ Generating code (7.5s)
```

Дальше весь `serverpod generate` блокируется — client не обновляется, работа застревает.

## Воспроизведение

1. Создать YAML без 6-field pattern:
   ```yaml
   class: AppSetting
   table: app_setting
   fields:
     id: UuidValue?, defaultPersist=random_v7
     key: String
     value: String
     description: String?
     createdAt: DateTime
     lastModified: DateTime
   indexes:
     app_setting_key_idx:
       fields: key
       unique: true
   ```
   НЕТ: `userId`, `customerId`, `isDeleted`, `relation(parent=...)`, парного `_sync_event.spy.yaml`.

2. Запустить `codegen generate-entity --yaml app_setting.spy.yaml --feature-path ... --workspace ...`.

3. Codegen рапортует SUCCESS, создаёт 19 Flutter-файлов + 1 server-endpoint.

4. `serverpod generate --experimental-features=all` падает.

## Что именно сломано

В сгенерированном `appSetting_endpoint.dart` шаблон безусловно использует:

```dart
await AppSetting.db.findFirstRow(
  session,
  where: (c) => c.id.equals(appSetting.id)
      & c.userId.equals(userId)               // ❌ колонки userId нет
      & c.customerId.equals(customerId),      // ❌ колонки customerId нет
);
```

```dart
final serverAppSetting = appSetting.copyWith(
    userId: userId,                           // ❌ поля userId нет
    customerId: customerId,                   // ❌ поля customerId нет
    lastModified: DateTime.now().toUtc(),
    isDeleted: false,                         // ❌ поля isDeleted нет
);
```

```dart
await _notifyChange(session, AppSettingSyncEvent(     // ❌ класс не существует
    type: SyncEventType.update,
    appSetting: updatedAppSetting,
), authContext);
```

Плюс весь Flutter-слой (`appSetting_table.dart` в Drift, `appSetting_model.dart`, `*_extension.dart`, репозитории, provider'ы) также использует те же несуществующие колонки/поля.

## Обходной путь (применён в TASK-007)

AppSetting в `weight_flutter` **не нужен** — по ADR-0014 это superadmin-only, управляется через `weight_admin`. Решение:

1. Удалить всю сгенерированную Flutter-фичу `weight_flutter/lib/features/app_setting/`.
2. Удалить сломанный `weight_server/lib/src/endpoints/appSetting_endpoint.dart`.
3. Убрать `AppSettingTable` + миграцию из Drift `database.dart` (bump schemaVersion обратно).
4. YAML `app_setting.spy.yaml` **оставить** — protocol-класс `AppSetting` уже в `weight_client/` после первого `serverpod generate`, таблица в PostgreSQL создана через Serverpod migration. Это всё что нужно.
5. Endpoint для AppSetting написать **руками** в TASK-009 (superadmin-only: create/update по ключу, get by key, list) — без userId/customerId/isDeleted/sync-event.

## Ожидаемое поведение

Когда YAML отличается от стандартного 6-field pattern, codegen должен **один из трёх**:

1. **Отказаться** генерировать с чётким сообщением: *"Entity AppSetting не содержит required 6-field pattern (userId, customerId, isDeleted) и/или парный sync-event. Non-standard entities поддерживаются только в ручном режиме (bare YAML + сервер endpoint руками). Skipping."*
2. **Сгенерировать ограниченный набор**: только Drift-таблицу + entity/model + mapping extension. БЕЗ endpoint'а, БЕЗ sync-flow, БЕЗ remote_data_source, БЕЗ базового CRUD usecase'ов.
3. **Поддерживать ключ конфига в YAML**, например:
   ```yaml
   class: AppSetting
   table: app_setting
   generationMode: minimal   # или systemScoped, без sync
   fields: ...
   ```
   и шаблон ветвится по этому ключу.

Сейчас codegen просто шлёпает стандартный t115-шаблон поверх любой YAML — это даёт compile-time мусор, который Serverpod ловит, но только после того как весь stack сгенерирован.

## Рекомендация

- **Краткосрочно (immediate):** добавить pre-flight check в `ServerpodYamlParser` / `generate-entity` команду — если в YAML отсутствует одно из `userId | customerId | isDeleted` ИЛИ нет парного `<name>_sync_event.spy.yaml` → **abort + error** с инструкцией: *"Non-standard entity detected. This codegen template assumes 6-field pattern + sync-event. For system entities (global config, lookup tables), generate manually or add 6-field placeholders. See BUG-004."*
- **Средне-срочно:** добавить опцию `--mode minimal` / `--no-sync` / `--no-crud` в CLI + соответствующий mini-шаблон для системных сущностей.
- **Долгосрочно:** вынести тип сущности в YAML (`generationMode: customerScoped | systemScoped | readonly`) и иметь 2-3 шаблона вместо одного.

## Сопутствующее

- Рядом с BUG-003 (regen existing feature перезаписывает custom code) вскрывает ту же архитектурную проблему: **codegen предполагает слишком многое про entity-шаблон**. Оба бага требуют пересмотра маркерной схемы + конфигурации шаблона.
- В проекте `weight` все customer-scoped сущности (Weighing, Contractor, Vehicle, Driver, CargoType, CorrectionButton, TerminalSet, TerminalDevice, Subscription) работают штатно с codegen'ом. AppSetting — единственная system-scoped, и именно она ломается. Значит `--mode minimal` решает 1 из ~10 случаев, но **критический** — иначе блокирует `serverpod generate` всего проекта.

## Затронутый коммит

Ветка `feature/TASK-007-domain-yaml-models` в `G:/Projects/Flutter/serverpod/weight`.
Файлы, которые пришлось удалить после сгенерации:
- `weight_flutter/lib/features/app_setting/` — вся директория (19 файлов)
- `weight_server/lib/src/endpoints/appSetting_endpoint.dart`
- `AppSettingTable` + import + migration в `weight_flutter/lib/core/data/datasources/local/database.dart`
