# TASK-008: Починить relation_patcher (BUG-003) — идемпотентность и симметрия слоёв

## Ветка

`feature--fix-codegen-regen-bugs`

## Цель

Сделать `RelationPatcher.patch()` идемпотентным и симметричным:
1. Если в destination-файле уже есть маркер `// === generated_start:oneToManyMethods === ... === generated_end:oneToManyMethods ===`, то контент между маркерами **полностью переписывается** свежим блоком, собранным из всех текущих relations модели (а не игнорируется как сейчас).
2. Если маркера нет — поведение прежнее (вставка перед последним `}` либо в конец файла).
3. Все 8 шаблонных слоёв (endpoint, remote_data_source, usecases, local_datasource_service, local_data_source, dao, repository, repository_impl) обрабатываются одинаково: новый relation → новый метод во всех 8 файлах.

## Не-цели

- НЕ сужать `:base` секции до per-method маркеров (отдельная задача, см. BUG-003 update 2026-04-22).
- НЕ менять поведение overwrite в `_processFile` (полная замена `:base` блоков остаётся, эта задача только про патчер relations).
- НЕ добавлять тесты для UI-фабрик (виджеты не патчатся — задокументировано).

## Scope

Разрешено:

- `src/features/generation/generators/relation_patcher.ts` — вся логика
- `src/test/generators/relation_patcher.test.ts` — новый тест-файл
- `ai/docs/architecture.md` — добавить заметку про идемпотентность patcher'а (если нужно)
- `ai/bug-reports/003-new-relation-not-patched-in-existing-feature.md` — пометить Resolved

Запрещено:

- `replacing_file_processor.ts` — поведение `:base`-merge не трогаем
- сам шаблон t115 — маркеры в шаблонах не меняем

## Критерии приёмки

- [ ] При regen с одним и тем же YAML результирующее содержимое `:oneToManyMethods` блока **детерминированно** (не дублируется и не растёт)
- [ ] При regen с YAML, в который добавлен новый `relation(parent=X)`, новый метод появляется во всех 8 файлах
- [ ] При первом gen на пустую папку всё работает как раньше (вставка перед последним `}`)
- [ ] Unit-тесты на MockFileSystem покрывают: первый gen, regen без изменений, regen с добавлением relation
- [ ] `npm test` проходит

## Заметки по реализации

Проблема в `relation_patcher.ts:97-100`:

```ts
// Skip if already patched (avoid duplicate methods)
if (destinationContent.includes(startMarker)) {
    continue;
}
```

Это раннее `continue` блокирует обновление файлов с уже существующим маркером. Заменить на:

```ts
if (destinationContent.includes(startMarker)) {
    // REPLACE существующий блок, а не пропускать
    const block = `${startMarker}\n${allProcessedBlocks.trim()}\n${endMarker}`;
    const newContent = destinationContent.replace(regex, block);
    await this.fileSystem.createFile(destinationPath, newContent);
    continue;
}
// ELSE: insert before last } (текущая ветка `isBlockInClass`)
```

Это делает patch идемпотентным (повторный запуск с тем же YAML даёт тот же файл) и additive (новый relation → новый метод появляется).

Важно: `allProcessedBlocks` уже накапливает блоки для **всех** `relationFields`, поэтому при перезаписи между маркерами не теряются старые relations.

## Релевантный контекст

Файлы для прочтения перед началом:

- `src/features/generation/generators/relation_patcher.ts` — основная логика
- `src/features/generation/parsers/relation-analyzer.ts` — `manyToOneFields` (фильтрует `customerId`)
- `src/features/generation/replacement/dictionary_presets.ts` — словари `ENTITY` и mainEntity/relatedEntity rules
- `src/test/mocks/mock_file_system.ts` — мок ФС для тестов
- `ai/bug-reports/003-new-relation-not-patched-in-existing-feature.md` — описание бага и анализ

## План тестирования

Unit-тесты (`relation_patcher.test.ts`):

1. **patch вставляет один relation в файл с `:oneToManyMethods` маркером**
   - Подготовить мок-FS с template (task_dao.dart с одним relation на category) и destination (weighing_dao.dart без relation методов, но с маркером)
   - Запустить `patch()`
   - Проверить что между маркерами появился метод `getWeighingsByContractorId`
2. **patch идемпотентен**
   - Дважды вызвать `patch()` с тем же YAML
   - Контент destination идентичен после первого и второго вызова
3. **patch добавляет новый relation на regen**
   - Сгенерить файл с одним relation (`contractorId`)
   - Добавить второй relation (`vehicleId`) в model и вызвать `patch()`
   - Проверить что в файле теперь оба метода (`getWeighingsByContractorId`, `getWeighingsByVehicleId`)
4. **patch без маркера в template — пропускает файл** (текущее поведение)

Integration-тест через CLI (после unit'ов):

5. Создать тестовый проект через `codegen create-project`
6. Сгенерить entity Weighing с одним relation
7. Добавить второй relation в YAML, regen
8. `dart analyze` в `weight_flutter` должен пройти без `non_abstract_class_inherits_abstract_member` / `undefined_method`

## Результаты

- `src/features/generation/generators/relation_patcher.ts` — изменён
- `src/test/generators/relation_patcher.test.ts` — новый
- `ai/bug-reports/003-...md` — статус Resolved
- `report.md` в этой папке — отчёт с тестовыми сценариями
