# Отчёт: TASK-008 — relation_patcher идемпотентный + симметричный

**Дата:** 2026-04-25
**Ветка:** `feature--fix-codegen-regen-bugs`

## Итог

`RelationPatcher` теперь обновляет все 8 шаблонных слоёв одинаково и устойчив к повторным запускам.

## Что изменено

### `src/features/generation/generators/relation_patcher.ts`

1. **Извлечение body из шаблона.** Раньше захватывался весь блок с маркерами (`matched[0]`); теперь — только содержимое между маркерами через capture-group (`blockRegex` с `([\s\S]*?)`). Это позволяет аккумулировать тела методов, обернув всё **одной** парой маркеров в самом конце.
2. **`fullBlock`** — единый блок `startMarker + processedBodies + endMarker` для всего файла, независимо от числа relations.
3. **Замена существующего блока через callback.** При наличии `startMarker` в destination: `replace(blockRegexAll, callback)`, где callback возвращает `fullBlock` для **первого** matched-блока и пустую строку для последующих. Это:
   - идемпотентно (при том же YAML дважды → тот же контент);
   - additive (при добавлении relation в YAML → новый метод появляется внутри того же марк-блока);
   - устойчиво к legacy-дубликатам (4 marker-пары после старого patcher'а схлопываются в 1).
4. **Чистка пустых строк.** После удаления дубликатов `\n{3,}` → `\n\n`.

### `src/test/generators/relation_patcher.test.ts` — новый

Тесты на MockFileSystem:

1. `inserts relation block into destination without :oneToManyMethods marker` — первая генерация (insert before last `}`)
2. `replaces existing :oneToManyMethods block on regen (idempotent)` — повторный gen с тем же YAML → identical content
3. `adds new relation method on regen with extra relation (BUG-003 regression)` — основной кейс: relation добавлен в YAML → метод появляется
4. `skips when destination file does not exist` — patcher не создаёт файлы
5. `consolidates legacy duplicate :oneToManyMethods marker pairs into a single block` — recovery от corrupt-state
6. `no-op when model has no manyToOne relations beyond customerId` — пропуск когда relations нет

`npm test` → **34 passing**.

## Проверка на реальном проекте (t139)

YAML: `gadget.spy.yaml` с одним relation `brandId`.

```
codegen generate-entity --yaml gadget.spy.yaml --feature-path .../gadget --workspace ...
```

→ feature сгенерирована, dao/local_data_source/repository/repository_impl/endpoint имеют **1** marker-пару с `getGadgetsByBrandId`.

Добавлен второй relation `ownerId` в YAML, regen:

→ всё в той же 1 marker-паре, но теперь оба метода (`getGadgetsByBrandId` + `getGadgetsByOwnerId`) во **всех 5 слоях**. Раньше (BUG-003) — только в 4 из 5 (endpoint/remote/usecase/interface), а dao/local/repository/repository_impl были забыты.

Третий regen (idempotency-чек): `diff` до и после показывает **no changes**.

Recovery-чек на corrupt-state: widget_dao с 4 marker-парами → после regen 1 marker-пара с обоими методами.

## Не затронуто (за scope)

- `_processFile` overwrite поведение `:base` секций — это отдельный кейс из BUG-003 part 2 (custom code blown away). Фиксить эту часть требует пересмотра marker-схемы и не входит в BUG-003 fix per se.
- UI-фабрики (виджеты, формы, helpers) — codegen их не трогает by design, отражено в bug-report как "не баг".
