# Отчёт TASK-035 — cleanup redundant Map-эвристики (latent false-positive)

## Резюме

Follow-up к BUG-027/TASK-034. После того как BUG-027 добавил type-based дискриминатор `field.type.startsWith('List<')` в `fieldsFilter` и `shouldSkipServerpodField`, прежние name-эвристики по подстроке `Map` стали избыточны и несли latent false-positive: scalar-поле с camelCase-сегментом `Map` (`siteMapUrl`, `heatMapConfig`, `roadMapId`) **молча** дропалось из flutter entity/model/drift (silent data loss). Junction back-relations (`List<XMap>`) теперь ловятся по типу, поэтому name-эвристика больше ничего полезного не делала.

## Изменения

[src/features/generation/parsers/formatters/code_formatter.ts](../../../../src/features/generation/parsers/formatters/code_formatter.ts):

- `fieldsFilter()` — удалён clause `!field.name.includes('Map')` (substring-match → false-positive landmine). Junction back-relation покрыт `!field.type.startsWith('List<')`.
- `shouldSkipServerpodField()` — удалён `'Map'` из `staticFields`. Был **exact-match** (`field.name === 'Map'`) → inert (ловил только поле, буквально названное `Map`; junction back-relations стрипаются по типу `List<`, не через него). Подтверждено тестом: drift-кейс `siteMapUrl` проходил ещё до удаления — exact-match его не трогал.

## Тесты

- Добавлено тестов: 4 (suite `TASK-035` в [code_formatter_fields_filter.test.ts](../../../../src/test/generators/code_formatter_fields_filter.test.ts), через реальный парсер). Покрытие: предусловие (`siteMapUrl` содержит substring `Map`), survival в `fieldsFilter` + strip junction back-relation, survival в drift-колонке + absent junction, survival в freezed-конструкторе.
- Все проходят: **Да** — 303 passing (299 + 4), 0 failing.
- Запуск:
  ```bash
  npm run compile && node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
  ```

## Definition of Done

- **verify t205 PASS errors=0**, warnings=1 (`unused_local_variable` в `developer_tools_page.dart` — pre-existing baseline, не связан), infos=67.
- Сценарий: library-feature на t205 — `author` (с `siteMapUrl: String` + `authorBookMaps: List<AuthorBookMap>?, relation`), `book`, junction `author_book_map`. Все `--with-server`.
- Эмпирика: `siteMapUrl` присутствует в `author_entity.dart` (freezedConstructor) И `author_table.dart` (drift column); `authorBookMaps` отсутствует в обоих. Junction-генерация цела (verify errors=0).
- lint 0 errors, 18 pre-existing warnings; compile clean.

## Риски / Заметки

- Низкий риск: удалены избыточные/inert проверки, type-based дискриминатор (BUG-027) покрывает junction back-relations. Junction-генерация эмпирически подтверждена на t205.
- Остаётся открытый non-blocking follow-up из ревью BUG-027 (НЕ входит сюда): pre-flight reject/warn для `List<scalar>` на synced-entity (loud вместо silent-strip). Inert сегодня. Можно отдельной задачей при необходимости.

## Статус

Ready for review. Коммит/PR — по явному указанию User.
