# Отчёт: TASK-009 — pre-flight валидация entity YAML

**Дата:** 2026-04-25
**Ветка:** `feature--fix-codegen-regen-bugs`

## Итог

`generate-entity` теперь проваливается с понятным сообщением при non-standard YAML (без `userId`/`customerId`/`isDeleted` или без парного `*_sync_event.spy.yaml`), не оставляя никаких файлов в feature-path.

## Что изменено

### `src/features/generation/parsers/entity_yaml_validator.ts` — новый

```ts
export class EntityYamlValidator {
    static validate(model: ServerpodModel): ValidationError[]
    static validateSyncEvent(yamlPath: string, model: ServerpodModel): ValidationError[]
    static formatErrors(errors: ValidationError[]): string
}
```

- `validate` проверяет наличие 3 hard-required полей: `userId`, `customerId`, `isDeleted`.
- `validateSyncEvent` проверяет наличие парного `<table>_sync_event.spy.yaml` в той же директории.
- M2M (junction-таблица, `model.isRelation === true`) пропускают обе проверки.
- `formatErrors` возвращает форматированный текст для вывода.

### `src/adapters/cli/commands/generate_entity.ts` — изменён

После парсинга YAML:

```ts
if (!opts.skipValidation) {
    const errors = [...validate(model)];
    if (opts.yaml) errors.push(...validateSyncEvent(opts.yaml, model));
    if (errors.length > 0) {
        logger.error(formatErrors(errors));
        process.exit(1);
    }
}
```

Добавлен флаг `--skip-validation` для escape hatch.

### `src/adapters/vscode/commands/create_data_files_by_replacement.ts` — изменён

Аналогично, но вместо exit показывается `vscode.window.showErrorMessage` с двумя кнопками: `Generate anyway` / `Cancel`.

### `src/test/parsers/entity_yaml_validator.test.ts` — новый

8 тестов:

- valid 6-field entity → []
- missing userId → 1 error
- missing 3 required fields → 3 errors
- M2M skip → []
- validateSyncEvent: paired present → []
- validateSyncEvent: paired missing → 1 error
- validateSyncEvent: M2M skip → []
- formatErrors readable

`npm test` → 34 passing.

## Проверка на реальном проекте (t139)

YAML `app_setting.spy.yaml` (как из BUG-004):

```
codegen generate-entity --yaml app_setting.spy.yaml --feature-path .../app_setting --workspace ...
```

→ exit code 1, сообщение:

```
ERROR: Non-standard entity detected. Codegen aborted to prevent broken Dart output (see BUG-004).
  - Entity "AppSetting" missing required field "userId". ...
  - Entity "AppSetting" missing required field "customerId". ...
  - Entity "AppSetting" missing required field "isDeleted". ...
  - Entity "AppSetting" missing paired sync-event YAML at app_setting_sync_event.spy.yaml. ...
For system-scoped entities (no userId/customerId), generate manually or extend YAML to include the 6-field pattern.
ERROR: Use --skip-validation to bypass at your own risk.
```

`ls .../features/app_setting` → directory не создана (бы прервался до любой записи).

Стандартный entity (Gadget с 6-field pattern + `gadget_sync_event.spy.yaml`) → проходит валидацию, генерация работает как раньше.

## Не затронуто (за scope)

- `--mode minimal` / `generationMode: systemScoped` в YAML — long-term, отдельная задача.
- Шаблоны t115 — не трогали.
- `relation_patcher` — TASK-008.
