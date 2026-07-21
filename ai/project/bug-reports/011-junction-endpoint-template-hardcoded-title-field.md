# BUG-011: junction endpoint template hardcoded `t.title` field reference

**Статус:** ✅ Resolved (template fix 2026-05-02 в TASK-012, lines 174+222 → `t.lastModified`)
**Обнаружено:** 2026-05-02 (TASK-012 executor шаг 8 verify FAIL на realistic todo app)
**Источник:** TASK-012 executor, generate-entity для ProjectMember junction
**Критичность:** High (silent landmine — генерация компилируется только если junction parents имеют поле `title: String`)

## Симптом

`codegen create-project --name todo` + `generate-entity` для junction (например ProjectMember с FK на Project + Member) → `serverpod generate` FAIL на endpoint compilation.

Generated `<junction>_endpoint.dart` содержит:
```dart
return await Project.db.find(... orderBy: (t) => t.title);
return await Member.db.find(... orderBy: (t) => t.title);
```

Если Project/Member НЕ имеют поля `title` (а имеют `name`/`displayName`/etc.) → invalid Dart → caskade compile errors → verify FAIL.

## Корневая причина

Шаблон `G:/Templates/flutter/t115/t115_server/lib/src/endpoints/task_tag_map_endpoint.dart` lines 174 + 222 содержали hardcoded:
```dart
orderBy: (t) => t.title,
```

`MANY_TO_MANY` replacement dictionary (TASK-014) корректно заменяет class names (`Tag` → `<entity1>`, `Task` → `<entity2>`) и file paths, **но не покрывает field references** внутри method bodies. `t.title` остаётся literally.

В t115 шаблоне field `title: String` есть у Tag и Task — поэтому шаблон валидный. Когда target entities имеют другие field names — landmine выскакивает.

## Почему TASK-014 acceptance не поймал

t157 ProjectMember junction acceptance E2E:
- `t157_server/lib/src/models/projects/project.spy.yaml` имел `title: String`
- `t157_server/lib/src/models/projects/member.spy.yaml` имел `title: String`

Случайно совпадало с template field assumption — `serverpod generate` проходил, flutter analyze тоже clean (errors=0).

TASK-014 acceptance не отдельно gating'овал `serverpod generate` на **realistic** field names (отличных от template defaults). Это retrospective gap в TASK-014 DoD.

## Fix (применён 2026-05-02 в TASK-012)

`G:/Templates/flutter/t115/t115_server/lib/src/endpoints/task_tag_map_endpoint.dart` lines 174 + 222:

```diff
-      orderBy: (t) => t.title,
+      orderBy: (t) => t.lastModified,
```

Pattern consistent с line 239 в том же файле (`orderBy: (r) => r.lastModified` для junction-level query). Все entities имеют `lastModified: DateTime` (один из 6 базовых полей per `entity_yaml_validator.ts`).

Trade-off: server-side junction parent listing сортируется по recency, не alphabetically. Для junction endpoints (internal cross-reference queries) это допустимо — UI sort обычно client-side.

## Limitation (не покрыто этим fix)

Если шаблон в будущем добавит другие hardcoded field references (`t.<fieldName>`) — landmine повторится. Generator-side fix:

**Опция (backlog):** Расширить `MANY_TO_MANY` replacement_util чтобы автоматически substitute `t.title` → `t.<inferredFirstStringField>` per target entity. Требует:
- Detection первого `String` field после base полей в target entity YAML
- Fallback на `lastModified` если нет non-base String field
- Тесты для multiple field-name patterns

Tracker: [TASK-016 candidate] generator-side dynamic field substitution для MANY_TO_MANY templates. Defer until production показывает что landmine pattern повторяется.

## Acceptance после fix

TASK-012 после template fix продолжается с шага 7 (re-generate ProjectMember endpoint) → шаг 8 verify должен PASS errors=0.
