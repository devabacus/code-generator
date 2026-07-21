# TASK-009: Валидация YAML-сущности перед генерацией (BUG-004)

## Ветка

`feature--fix-codegen-regen-bugs`

## Цель

Добавить pre-flight валидацию `*.spy.yaml` перед запуском codegen. Если в YAML отсутствует один из обязательных полей 6-field pattern (`userId`, `customerId`, `isDeleted`) ИЛИ нет парного `<entity>_sync_event.spy.yaml` — codegen завершается с понятной ошибкой и **не создаёт** ни одного файла.

## Не-цели

- НЕ реализовывать опции `--mode minimal` / `--no-sync` / `generationMode` в YAML (long-term, отдельная задача).
- НЕ менять шаблоны t115.
- НЕ трогать relation_patcher (TASK-008).

## Scope

Разрешено:

- `src/features/generation/parsers/server_yaml_parser.ts` — добавить `validate()` или отдельный модуль `entity_yaml_validator.ts`
- `src/features/generation/parsers/entity_yaml_validator.ts` — новый файл (предпочтительно отдельный модуль)
- `src/adapters/cli/commands/generate_entity.ts` — вызвать validator, ранний exit с message
- `src/adapters/vscode/commands/create_data_files_by_replacement.ts` — то же самое + showErrorMessage
- `src/test/parsers/entity_yaml_validator.test.ts` — новый тест
- `ai/bug-reports/004-...md` — пометить Resolved

Запрещено:

- менять структуру `ServerpodModel`
- править logger / utils / другие компоненты
- удалять что-либо из core/features

## Критерии приёмки

- [ ] YAML без `userId` → CLI завершается с exit code 1 и ясным сообщением, ни один файл не создан
- [ ] YAML без `customerId` → то же
- [ ] YAML без `isDeleted` → то же
- [ ] YAML без парного `<entity>_sync_event.spy.yaml` в той же директории → то же  
  (Этот чек применяется только при использовании `--yaml <path>`; для `--stdin` парный файл не проверяется — задокументировать)
- [ ] M2M (junction-таблица, `class: ...Map`) **пропускает** валидацию (sync-event для junction не нужен)
- [ ] Сообщение об ошибке содержит:
  - имя класса
  - список missing fields
  - ссылку на BUG-004 (или короткое объяснение паттерна)
- [ ] Стандартная Weighing/Contractor/Vehicle YAML — НЕ ломается (валидация проходит)
- [ ] `npm test` проходит

## Заметки по реализации

### Структура валидатора

```ts
// src/features/generation/parsers/entity_yaml_validator.ts

export interface ValidationError {
    code: 'MISSING_FIELD' | 'MISSING_SYNC_EVENT';
    message: string;
}

export class EntityYamlValidator {
    static validate(model: ServerpodModel): ValidationError[] { ... }
    static validateSyncEvent(yamlPath: string, model: ServerpodModel): ValidationError[] { ... }
}
```

### Required fields

```
userId, customerId, isDeleted
```

(`createdAt`, `lastModified` тоже в шаблоне, но менее критичны — оставим только эти 3 как hard-required чтобы не флапать на legacy YAML, но залогируем warning если отсутствуют)

### Sync-event check

`fs.existsSync(path.join(path.dirname(yamlPath), <snakeName>_sync_event.spy.yaml))`

где `snakeName` = `model.tableName` (snake_case из YAML).

### Wire-up в CLI

```ts
// generate_entity.ts after parse:
const errors = EntityYamlValidator.validate(model);
if (opts.yaml) {
    errors.push(...EntityYamlValidator.validateSyncEvent(opts.yaml, model));
}
if (errors.length > 0) {
    logger.error(`Entity ${model.className} failed validation:`);
    errors.forEach(e => logger.error(`  - ${e.message}`));
    logger.error(`See ai/bug-reports/004-... for the 6-field pattern requirement.`);
    logger.emitResult('generate-entity', false, startTime);
    process.exit(1);
}
```

### Wire-up в VS Code

В `create_data_files_by_replacement.ts` использовать `vscode.window.showErrorMessage` со списком ошибок.

## Релевантный контекст

Файлы для прочтения перед началом:

- `src/features/generation/parsers/server_yaml_parser.ts` — структура парсинга
- `src/features/generation/parsers/formatters/types.ts` — `ServerpodModel`, `ServerpodField`
- `src/adapters/cli/commands/generate_entity.ts` — вход CLI
- `src/adapters/vscode/commands/create_data_files_by_replacement.ts` — вход VS Code
- `ai/bug-reports/004-non-standard-entity-breaks-endpoint.md` — описание бага

## План тестирования

Unit-тесты (`entity_yaml_validator.test.ts`):

1. **valid Weighing entity (все 6 полей + relations) → []**
2. **AppSetting без userId/customerId/isDeleted → 3 errors**
3. **Junction map (TaskTagMap) → [] (пропускает)**
4. **`validateSyncEvent`: парный файл существует → []**
5. **`validateSyncEvent`: парного файла нет → 1 error**

Integration-тест:

6. CLI: запуск на `app_setting.spy.yaml` (как из bug-report) → exit code 1, никаких созданных файлов в feature-path.
7. CLI: запуск на стандартном `weighing.spy.yaml` → проходит как раньше.

## Результаты

- `src/features/generation/parsers/entity_yaml_validator.ts` — новый
- `src/test/parsers/entity_yaml_validator.test.ts` — новый
- `src/adapters/cli/commands/generate_entity.ts` — изменён (validation + early exit)
- `src/adapters/vscode/commands/create_data_files_by_replacement.ts` — изменён
- `ai/bug-reports/004-...md` — статус Resolved
- `report.md` — отчёт
