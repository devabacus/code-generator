# TASK-025: Bug 4 — Riverpod `ref.mounted` guard в state_providers (закрывает BUG-001)

> Часть пакета 5 фиксов из TASK-019 weight ревью (Сессия 2). Порядок: **этот первый** (4→1→2→3→5).
> Tracking origin: [weight TASK-021 handoff](../../../../../Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md).
> Stack-lock invariant (Discussion #11) applies — меняем только template content (Riverpod annotations preserved).

## Ветка

`feature/TASK-025-bug-4-riverpod-ref-mounted`

## Цель

После каждого `await` в `add<Entity>` / `update<Entity>` / `delete<Entity>` методах сгенерированного `*_state_providers.dart` добавить guard `if (!ref.mounted) return;` ПЕРЕД `state = ...`. Закрыть [BUG-001](../../../bug-reports/001-state-provider-ref-disposed.md) (Open, High) в первоисточнике.

**Корень:** `state = await AsyncValue.guard(() async {... await repository.createX(x); ...});` — если виджет диспозит notifier пока await висит (диалог закрылся, страница свернулась) → `state = ...` бросает «Cannot use Ref of `<X>Provider` after disposed». Доменная операция уже прошла (репозиторий записал в Drift), `*_stream_provider` дальше обновит UI через `watchX`, поэтому функционально не блокирует — но console noise + edge cases на error handling. **Bug 4 = silent BUG-001 в первоисточнике шаблона.**

## Не-цели

- НЕ trogать stream-providers (`Stream<List<X>> xStream(Ref ref)`) — там `ref.watch`, не `ref.read`, race не возникает.
- НЕ trogать read-only методы (`getX`, `getXById`, `watchX`) — там нет sequential `state = ...` после await.
- НЕ trogать t115 template — frozen per Discussion #11 / clean-slate amendment (deprecated path).
- НЕ менять Riverpod stack / annotations — stack-lock invariant.
- НЕ рефакторить state-providers под новые паттерны (Notifier base class, AsyncNotifier semantics, etc.).

## Scope

**Разрешено редактировать:**

- `G:/Templates/flutter/simplified/simplified_flutter/lib/features/tasks/presentation/providers/category/category_state_providers.dart`
- `G:/Templates/flutter/simplified/simplified_flutter/lib/features/tasks/presentation/providers/task/task_state_providers.dart`
- `G:/Templates/flutter/simplified/simplified_flutter/lib/features/tasks/presentation/providers/tag/tag_state_providers.dart`
- `G:/Templates/flutter/simplified/simplified_flutter/lib/features/tasks/presentation/providers/task_tag_map/task_tag_map_state_providers.dart`
- `G:/Templates/flutter/simplified/simplified_flutter/lib/features/configuration/presentation/providers/configuration/configuration_state_providers.dart` (если содержит add/update/delete с await)
- `src/test/generators/` — golden-snapshot test
- `ai/bug-reports/001-state-provider-ref-disposed.md` — update status to **Resolved** + cite этот фикс

**Запрещено:**

- t115 шаблон `G:/Templates/flutter/t115/` — frozen
- `src/features/generation/**` — этот фикс template-only, ничего в коде генератора менять не нужно
- Generated `.g.dart` файлы — Riverpod codegen генерирует их сам, мы не trogаем
- Любые другие фичи / папки

## Критерии приёмки

- [ ] В каждом `*_state_providers.dart` (5 файлов в simplified) для каждого метода `addX` / `updateX` / `deleteX`:
  - перед `state = ...` стоит `if (!ref.mounted) return;`
  - порядок: `final result = await AsyncValue.guard(...); if (!ref.mounted) return; state = result;`
- [ ] Junction (task_tag_map) — тоже patched (там есть add/delete минимум).
- [ ] `npm run compile` clean, `npm run lint` clean.
- [ ] Golden test в `src/test/generators/state_providers_ref_mounted_test.ts`:
  - прогнать `generate-entity` на mock-сущность в MockFileSystem
  - assert: каждый `state = ...` в add/update/delete предварён `if (!ref.mounted) return;`
- [ ] mocha workaround (`node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"`) — все passing (baseline + новый).
- [ ] `codegen verify --name t180 --human` — PASS, цитировать `errors=N, warnings=M` в `report.md`. На t180 прогнать `generate-entity` для multi-word сущности и `grep "if (!ref.mounted) return;"` в её state_providers — счёт совпадает с числом mutation методов.
- [ ] BUG-001 в [ai/bug-reports/001-state-provider-ref-disposed.md](../../../bug-reports/001-state-provider-ref-disposed.md) — header сменён на `## Status: Resolved (TASK-025)`, добавлена ссылка на этот фикс.
- [ ] `report.md` с реальным CLI-выводом всех шагов.

## План работы

**Статусы:** `[ ]` не начат · `[~]` в работе · `[x]` готово · `[!]` блокер

1. [ ] Прочитать `CLAUDE.md`, `AGENTS.md`, `ai/docs/agent_memory.md`, [BUG-001](../../../bug-reports/001-state-provider-ref-disposed.md), [handoff TASK-021 weight](../../../../../Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md) → Bug 4 секция.
2. [ ] Прочитать все 4-5 файлов `*_state_providers.dart` в simplified — зафиксировать current shape (3 mutation метода в Category/Task/Tag; для task_tag_map проверить состав).
3. [ ] Для каждого `*_state_providers.dart`: в каждом add/update/delete заменить
   ```dart
   state = await AsyncValue.guard(() async {...});
   ```
   на
   ```dart
   final result = await AsyncValue.guard(() async {...});
   if (!ref.mounted) return;
   state = result;
   ```
4. [ ] Создать `src/test/generators/state_providers_ref_mounted_test.ts`:
   - mock simplified template (MockFileSystem)
   - прогнать `GenerationService.generate(config, mockEntityModel)`
   - assert: для каждого add/update/delete в результирующем `*_state_providers.dart` есть `if (!ref.mounted) return;` непосредственно перед `state = result;`
5. [ ] `npm run compile` clean.
6. [ ] mocha workaround — 163+1 passing.
7. [ ] `npm run lint` clean.
8. [ ] **STOP-gate:** перед verify — show diff user'у.
9. [ ] `codegen create-project --name t180 --human` → `codegen generate-entity --yaml ...some_multiword.yaml... --feature-path ... --workspace G:/Projects/Flutter/serverpod/t180 --template simplified --human` → `codegen verify --name t180 --human`. Цитировать `errors=N, warnings=M`.
10. [ ] Grep на t180: `grep -r "if (!ref.mounted) return;" .../presentation/providers/` — должно быть равно числу add/update/delete методов.
11. [ ] Update [BUG-001](../../../bug-reports/001-state-provider-ref-disposed.md) → Resolved.
12. [ ] **Multi-agent review (2 ревьюера, Standard + Adversarial)** до commit'а.
13. [ ] `report.md` с CLI-выводом.

## STOP-gates

**Формат executor'а:**
1. `- [~] <op> — [HH:MM] ⏸ жду подтверждения`
2. `⚠ STOP: <op> (причина), ждать ok`
3. После `ok` — `[x] <op> — [HH:MM] user ok`

Список STOP-gates:

- [ ] **Перед verify** (шаг 9) — show diff (4-5 файлов простой patch) user'у.
- [ ] **Перед update BUG-001 → Resolved** (шаг 11) — verify должен PASS на t180.
- [ ] **Перед commit** (шаг 12) — multi-agent review результат показан user'у.

**Destructive ops:** ожидаемо отсутствуют. Если в ходе работы потребуется `npm install` нового пакета, `rm -rf` test-проекта, правка t115 шаблона — STOP, эскалировать.

## План тестирования

### Unit (обязательно)

- `src/test/generators/state_providers_ref_mounted_test.ts` — golden assert наличия guard в сгенерированных файлах (через MockFileSystem).

### Verify (обязательно, DoD-гейт)

```bash
node out/adapters/cli/index.js create-project --name t180 --human
node out/adapters/cli/index.js generate-entity --yaml <test_multiword.spy.yaml> --feature-path G:/Projects/Flutter/serverpod/t180/t180_flutter/lib/features/<feature> --workspace G:/Projects/Flutter/serverpod/t180 --template simplified --human
node out/adapters/cli/index.js verify --name t180 --human
```

Ожидание: `verify` PASS, `errors=0`. Цитировать в `report.md`.

### Runtime (не требуется)

Изменение чисто template-only, без runtime-логики server/migrations. Smoke в реальном Flutter app не нужен (Riverpod `ref.mounted` = стандартный паттерн, документирован в Riverpod 2.x).

## Релевантный контекст

Файлы для прочтения перед началом:

- [CLAUDE.md](../../../../CLAUDE.md) — invariants, DoD
- [AGENTS.md](../../../../AGENTS.md) — global rules
- [ai/docs/agent_memory.md](../../../docs/agent_memory.md) — gotchas, stack-lock principle
- [ai/bug-reports/001-state-provider-ref-disposed.md](../../../bug-reports/001-state-provider-ref-disposed.md) — original BUG report
- [weight TASK-021 handoff](../../../../../Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md) → Bug 4 секция
- 4 файла `G:/Templates/flutter/simplified/.../presentation/providers/<entity>/<entity>_state_providers.dart`

## Заметки по реализации

- Этот фикс — самый простой из 5. Чисто template patch без логики генератора.
- Junction'и (task_tag_map) тоже должны быть исправлены — там add/delete тоже есть.
- Patterns в Riverpod 2.x:
  ```dart
  // BEFORE
  state = await AsyncValue.guard(() async { ... });
  // AFTER
  final result = await AsyncValue.guard(() async { ... });
  if (!ref.mounted) return;
  state = result;
  ```
- Если у Configuration `*_state_providers.dart` есть mutation методы — patch тоже. Если их там нет (Configuration singleton, может быть только read) — пропустить с пометкой в журнале.

## Результаты

- 4-5 modified `*_state_providers.dart` в simplified template
- 1 new test file `src/test/generators/state_providers_ref_mounted_test.ts`
- 1 modified `ai/bug-reports/001-state-provider-ref-disposed.md` (status → Resolved)
- 1 new test project `t180/`
- `report.md` с CLI-выводом

## Журнал исполнения

*Только executor. Teamlead не редактирует.*
