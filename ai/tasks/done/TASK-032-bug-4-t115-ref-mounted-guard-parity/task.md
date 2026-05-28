# TASK-032: Bug 4 t115 ref.mounted guard parity

> **NB про ID:** auto-ID `new_task.py` присвоил **032** (next available). В handoff/docs эта задача nominally называлась "TASK-035". Actual ID = TASK-032. Ранее-suggested "TASK-032 Configuration legacy" + "TASK-034 pubspec comments" — nominal labels, получат реальные ID при создании через скрипт.

## Ветка

feature/TASK-032-bug-4-t115-ref-mounted-guard-parity

## Цель

Применить **identical `ref.mounted` guard pattern** (закрытый в TASK-025 для simplified) к **t115 template** в 4 `*_state_providers.dart` файлах (category/task/tag/task_tag_map). Закрывает Bug 4 (BUG-001: Riverpod `Ref` disposed after async gap — `state = await AsyncValue.guard(...)` присваивает state после возможного dispose notifier'а → "Cannot use ref after widget disposed" crash) для **t115 consumers** (включая weight TASK-018 migration / weight regen backlog).

**Обоснование:** TASK-025 закрыл BUG-001 только для simplified template. t115 (per ADR-0005 amendment "supported + bug-fix-as-needed") имеет identical anti-pattern в 4 state_providers. Это **главный остаточный gap** для weight regen на t115 (выявлен в TASK-031 closure assessment 2026-05-28).

## Не-цели

- **НЕ менять** generator logic (`src/`) — template-only patch + test extension (как TASK-025/031)
- **НЕ trogать** simplified template (уже закрыто TASK-025)
- **НЕ trogать** Configuration state_providers в t115 (stream-only, 0 mutation — verified) или auth state_providers (stream-only, t115_admin + t115_flutter)
- **НЕ менять** stack lock invariants (Riverpod `@riverpod` annotations / Drift / Clean directory / sync_core / 13 markers)
- **НЕ менять** package versions
- **НЕ менять** внутреннюю логику mutation методов (usecase calls остаются) — ТОЛЬКО wrap `state = await guard(...)` → `final result = await guard(...); if (!ref.mounted) return; state = result;`

## Scope

Разрешено:

- Правка 4 файлов в `G:/Templates/flutter/t115/t115_flutter/lib/features/tasks/presentation/providers/`:
  - `category/category_state_providers.dart` (3 mutation: addCategory/updateCategory/deleteCategory)
  - `task/task_state_providers.dart` (3 mutation: addTask/updateTask/deleteTask)
  - `tag/tag_state_providers.dart` (3 mutation: addTag/updateTag/deleteTag)
  - `task_tag_map/task_tag_map_state_providers.dart` (2 mutation: addTag/removeTag или аналог — verify по факту)
- Расширение [src/test/generators/state_providers_ref_mounted.test.ts](../../../../src/test/generators/state_providers_ref_mounted.test.ts) Live regression suite — параллельные t115 paths (без рефакторинга simplified suite)
- report.md

Запрещено:

- Любой другой t115 файл вне 4 указанных `*_state_providers.dart`
- `src/features/generation/` generator logic
- simplified template (TASK-025 territory)
- t115 Configuration / auth state_providers (stream-only)
- Изменение `.g.dart` файлов (codegen output, build_runner regenerates)

## Критерии приёмки

- [ ] 4 t115 `*_state_providers.dart` содержат `if (!ref.mounted) return;` перед `state = result;` для каждого mutation метода. Pattern: `final result = await AsyncValue.guard(...); if (!ref.mounted) return; state = result;`. **11 guards total** (3+3+3+2).
- [ ] Внутренняя логика mutation методов (usecase provider calls) НЕ изменена — только wrap transformation
- [ ] Configuration / auth t115 state_providers НЕ trognyты (stream-only)
- [ ] `tsc -p ./` clean (0 errors)
- [ ] `npm run lint` 0 errors (warnings pre-existing baseline)
- [ ] mocha: **258 + N passing** (baseline 258 post-TASK-031 + t115 live regression cases), 0 failing
- [ ] `codegen verify --name t<N+1> --template t115` PASS errors=0. Цитировать `errors/warnings/infos`
- [ ] `report.md` с реальными числами
- [ ] Multi-agent review pre-commit: Standard + Adversarial (UI race fix — стандартный bar, не data-integrity 3-adversarial)

## Заметки по реализации

### Pattern reference (TASK-025, identical transformation)

```text
// BEFORE (BUG-001 anti-pattern, t115):
Future<void> addCategory(CategoryEntity category) async {
  state = await AsyncValue.guard(() async {
    await ref.read(createCategoryUseCaseProvider)!(category);
    return ref.read(getCategoriesUseCaseProvider)!();
  });
}

// AFTER (TASK-032 fix):
Future<void> addCategory(CategoryEntity category) async {
  final result = await AsyncValue.guard(() async {
    await ref.read(createCategoryUseCaseProvider)!(category);
    return ref.read(getCategoriesUseCaseProvider)!();
  });
  if (!ref.mounted) return;
  state = result;
}
```

⚠ **t115 internal differs from simplified:** t115 использует **usecase providers** (`getCategoriesUseCaseProvider`, `createCategoryUseCaseProvider`) — Clean Architecture layer; simplified использует **repository напрямую** (`currentUserCategoryRepositoryProvider`). Inner body НЕ копировать из simplified — оставить t115 usecase calls intact. Меняется ТОЛЬКО outer wrap (state=await → result+guard).

⚠ **task_tag_map edge case (TASK-025 precedent):** junction state_providers может иметь `state = const AsyncValue.loading();` pre-await — это синхронный assign, **сохранить** (не race-condition). Guard только вокруг `state = await guard(...)`.

### Anti-pattern audit (verified 2026-05-28)

t115 global grep `state = await AsyncValue.guard` в source `.dart`:
- category/task/tag: 3 each
- task_tag_map: 2
- configuration: 0 (stream-only)
- auth (admin + flutter): 0 (stream-only)
- **Total 11 mutations** — identical TASK-025 simplified scope

### Stack lock compliance (Discussion #11)

- ✅ Riverpod `@riverpod` annotations preserved (in-place patch внутри методов)
- ✅ `ref.mounted` = стандартный Riverpod 2.x idiom (документирован), не stack change
- ✅ Clean directory layout / sync_core / Drift / markers — не trognyты
- ✅ 0 generator src/ changes

## Релевантный контекст

Файлы для прочтения перед началом:

- [ai/tasks/done/TASK-025-bug-4---riverpod-ref-mounted-в-state-providers/report.md](../../done/TASK-025-bug-4---riverpod-ref-mounted-в-state-providers/report.md) — pattern reference, test structure, junction edge case, 11-guard scope
- [src/test/generators/state_providers_ref_mounted.test.ts](../../../../src/test/generators/state_providers_ref_mounted.test.ts) — test file для extension (Live regression suite)
- [ai/bug-reports/001-state-provider-ref-disposed.md](../../../bug-reports/001-state-provider-ref-disposed.md) — BUG-001 (Resolved для simplified, t115 теперь закрывается)
- `G:/Templates/flutter/simplified/.../category/category_state_providers.dart` — post-TASK-025 reference (guard pattern, но repository internal)
- `G:/Templates/flutter/t115/.../category/category_state_providers.dart` — t115 pre-state (usecase internal)
- [ai/docs/agent_memory.md](../../../docs/agent_memory.md) — `.test.ts` filename convention + stack lock

## План работы

1. [ ] Patch `t115/.../category/category_state_providers.dart` — 3 mutations wrap (usecase calls intact)
2. [ ] Patch `task/task_state_providers.dart` — 3 mutations
3. [ ] Patch `tag/tag_state_providers.dart` — 3 mutations
4. [ ] Patch `task_tag_map/task_tag_map_state_providers.dart` — 2 mutations (сохранить `AsyncValue.loading()` pre-await если есть)
5. [ ] Verify Configuration + auth t115 НЕ trognyты (re-grep, 0 anti-pattern в source после patch ⇒ только 4 файла)
6. [ ] Extend [state_providers_ref_mounted.test.ts](../../../../src/test/generators/state_providers_ref_mounted.test.ts) — t115 Live regression suite (4 paths, guard counts: 3/3/3/2)
7. [ ] `npm run compile` clean
8. [ ] `npm run lint` 0 errors
9. [ ] mocha → 258 + N passing
10. [ ] **STOP-gate** перед create-project (~3 мин)
11. [ ] `codegen create-project --name t<N+1> --template t115` (N = highest used + 1; последний t196, next t197+)
12. [ ] `codegen verify --name t<N+1> --human` → PASS errors=0
13. [ ] (optional) generate-entity на одну entity с **full** `--feature-path` → grep `if (!ref.mounted) return;` в generated state_providers (substitution evidence; см. TASK-031 lesson — full path обязателен)
14. [ ] **STOP-gate** перед multi-agent review (Standard + Adversarial spawn)
15. [ ] Apply HIGH+ findings inline
16. [ ] report.md + docs sync (status/roadmap/agent_memory + BUG-001 t115 closure note)
17. [ ] **STOP-gate** ЖДУ User "коммить"

## STOP-gates (требуется явное "ok" User'а)

- **Перед `create-project --name t<N+1> --template t115`** — ~50MB новая директория, sandbox не позволит удалить (User policy)
- **Перед spawn multi-agent reviewers** — context budget
- **Перед `task.py pr`** — push в remote
- **Перед `task.py merge`** — merge в master, blast radius на все будущие t115 проекты

## План тестирования

**Unit (обязательно):**

- Extend [state_providers_ref_mounted.test.ts](../../../../src/test/generators/state_providers_ref_mounted.test.ts) Live regression suite параллельно для t115:
  - 4 t115 files → guard count (`if (!ref.mounted) return;`) == expected (3/3/3/2), `state = result;` count == guard count, `state = await AsyncValue.guard` (anti-pattern) == 0
  - Skip gracefully на CI (t115 disk paths недоступны)
- НЕ изменять existing simplified suite assertions

**Verify (обязательно — DoD-гейт):**

- `codegen create-project --name t<N+1> --template t115` (~3 мин)
- `codegen verify --name t<N+1> --human` → PASS errors=0
- Цитировать `errors=N, warnings=M, infos=K`

**Runtime (skip — Option B precedent TASK-025):**

- `ref.mounted` = compile-time gate purpose, trivial Dart idiom, weight precedent
- Cite TASK-025 reasoning

**Команды:**

```bash
npm run compile
node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
npm run lint
# после STOP-gate:
node out/adapters/cli/index.js create-project --name t<N+1> --template t115
node out/adapters/cli/index.js verify --name t<N+1> --human
```

## Результаты

**Ожидаемые изменения:**

- 4 файла в `G:/Templates/flutter/t115/t115_flutter/lib/features/tasks/presentation/providers/` (template patch, outside repo → commit в devabacus/t115 отдельно, как TASK-031)
- 1 файл `src/test/generators/state_providers_ref_mounted.test.ts` (test extension)
- `report.md` (final, реальные числа)
- `ai/docs/status.md` / `roadmap.md` (TASK-032 closure + renumber suggestions)
- `ai/docs/agent_memory.md` (минор)
- `ai/bug-reports/001-state-provider-ref-disposed.md` (t115 closure note — BUG-001 теперь закрыт для обоих templates)

**0 src/ generator logic changes** — template + test only.

**Cross-repo impact:** devabacus/t115 получает 4 file changes (commit отдельно). Weight regen на t115 получает Bug 4 protection — закрывает главный остаточный gap для weight readiness (→ HIGH).
