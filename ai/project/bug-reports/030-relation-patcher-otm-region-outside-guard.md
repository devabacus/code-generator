# BUG-030: правка внутри `:oneToManyMethods` в merge-файлах теряется молча (patcher пишет в обход preflight)

**Статус:** OPEN (с 2026-07-25) — обнаружено в ходе [TASK-042](../tasks/) (adversarial review), заведено как остаток guard'а BUG-029.
**Критичность:** Medium — silent потеря пользовательского кода, но в узкой зоне (3 файла на сущность со связями) и в блоке, который по контракту принадлежит генератору.
**Связано:** [BUG-029](029-base-section-overwrite-loses-custom-code.md) (родительский класс дефекта), [BUG-013](013-template-markers-gap-repository-impl-usecases.md), [BUG-007](007-relation-patcher-misses-template-without-markers.md).

## Симптом

Пользователь правит код **внутри** блока

```dart
// === generated_start:oneToManyMethods ===
  ... его правка здесь ...
// === generated_end:oneToManyMethods ===
```

в merge-файле сущности со связями, запускает `generate-entity` — правка исчезает.
**Ни conflict, ни предупреждения, ни non-zero exit.** Guard TASK-042 (двухфазный
preflight + ledger), закрывший BUG-029, этот случай пропускает.

## Механизм

Два независимых условия складываются:

1. **`MACHINE_OWNED_REGIONS = ['base']`**
   ([preflight.ts](../../../src/features/generation/generators/preflight.ts)) — для
   `ownership: merge` ledger хеширует и сравнивает **только** регион `base`. Регион
   `oneToManyMethods` не хешируется, потому что фаза apply его не пишет.
2. **`RelationPatcher` пишет в обход plan/apply**
   ([generation_service.ts](../../../src/features/generation/generators/generation_service.ts) —
   вызов `relationPatcher.patch()` **после** цикла apply). Он перезаписывает тело
   `:oneToManyMethods` напрямую, а `_recordBaseline` снимает хеш **с диска уже после
   патчера** — то есть baseline фиксирует результат патчера, а не то, что было у
   пользователя.

Для `ownership: generated` дыры нет: там хешируется **весь файл**, поэтому правка внутри
`:oneToManyMethods` даёт обычный conflict `user-modified`.

## Зона поражения (проверено по t115, 2026-07-25)

`:oneToManyMethods` есть в 7 entity-шаблонах. Дыра — только там, где он соседствует с
`:base` (то есть файл классифицируется как `merge`):

| Шаблон | Есть `:base`? | ownership | Правка внутри `:oneToManyMethods` |
| --- | --- | --- | --- |
| `<entity>_dao.dart` | да | merge | ❌ теряется молча |
| `<entity>_local_data_source.dart` | да | merge | ❌ теряется молча |
| `<entity>_repository.dart` | да | merge | ❌ теряется молча |
| `<entity>_local_datasource_service.dart` | нет | generated | ✅ conflict (хеш файла целиком) |
| `<entity>_repository_impl.dart` | нет | generated | ✅ conflict |
| `<entity>_usecases.dart` | нет | generated | ✅ conflict |
| `<entity>_usecase_providers.dart` | нет | generated | ✅ conflict |

Затрагивает только сущности со связями (`RelationAnalyzer.manyToOneFields(...).length > 0`),
у остальных патчер не запускается.

## Воспроизведение

1. `codegen generate-entity` для сущности с `relation(parent=...)` — в
   `<entity>_dao.dart` появляется блок `:oneToManyMethods`.
2. Дописать/изменить что-нибудь **внутри** блока (например добавить свой join-метод).
3. Повторить `generate-entity` без каких-либо других изменений.
4. Правка исчезла; exit 0, конфликтов не заявлено.

## Ожидаемое поведение

Одно из двух (решение — за владельцем):

- **A. Завести `RelationPatcher` под plan/apply** — тогда `oneToManyMethods` становится
  обычным machine-owned регионом (`MACHINE_OWNED_REGIONS = ['base', 'oneToManyMethods']`),
  и правка внутри него даёт штатный conflict `region-modified`. Требует, чтобы патчер
  перестал считать свои destination'ы отдельным маппингом шаблонов — это рефакторинг,
  а не однострочник.
- **B. Оставить как есть, но объявить контракт** — задокументировать `:oneToManyMethods`
  как «территория генератора, правки не выживают» и рекомендовать точку расширения за
  пределами блока. Дешевле, но противоречит принципу TASK-042 «ни один режим отказа не
  остаётся тихим».

Просто добавить `oneToManyMethods` в `MACHINE_OWNED_REGIONS` **нельзя**: фаза apply не
рендерит его тело (оно приходит из патчера), и классификация упрётся в baseline, который
некому проверить.

## Затронуто

- `src/features/generation/generators/relation_patcher.ts`
- `src/features/generation/generators/generation_service.ts` (порядок apply → патчеры → baseline)
- `src/features/generation/generators/preflight.ts` (`MACHINE_OWNED_REGIONS`)

## Соседние дыры того же происхождения (для полноты картины)

Писатели вне plan/apply, зафиксированные в report TASK-042: `orchestrator_patcher`
(`sync_orchestrator_provider.dart`) и `app_database_generator` (`database.dart`) — их
файлы в plan `generate-entity` не входят вовсе, поэтому preflight их не видит; плюс
записи ledger для файлов, которые правит `create-project` уже после снятия baseline
(`pubspec.yaml`). Это не одно и то же с настоящим багом: там правится файл целиком
известным патчером, здесь — молча теряется пользовательский код внутри marker-блока.
