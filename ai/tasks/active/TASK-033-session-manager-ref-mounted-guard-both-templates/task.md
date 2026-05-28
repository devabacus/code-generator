# TASK-033: session manager ref.mounted guard both templates

## Ветка

feature/TASK-033-session-manager-ref-mounted-guard-both-templates

## Цель

Закрыть **последний residual BUG-001 shape** — `core/providers/session_manager_provider.dart` `_fetchUserContext()` присваивает `state = userContext;` (success) и `state = null;` (catch) после `await client.userManagement.getMyUserContext()` **без `ref.mounted` guard**. Если notifier disposed во время await → "Cannot use Ref after disposed" crash. Выявлен TASK-032 adversarial F3. Present в **обоих** templates (simplified + t115), 4 файла (flutter + admin каждого). Не покрыт TASK-025 (simplified) / TASK-032 (t115) — другой shape (прямой try/catch, не `AsyncValue.guard`).

## Не-цели

- НЕ менять generator logic (`src/`) — template-only patch + test
- НЕ trogать entity `*_state_providers.dart` (уже закрыты TASK-025/032)
- НЕ менять stack lock invariants / package versions
- НЕ менять логику `_fetchUserContext` кроме добавления 2 guards (после await перед `state = userContext`; в catch перед `state = null`)
- НЕ trogать другие методы/провайдеры в session_manager_provider.dart

## Scope

Разрешено:

- 4 файла `core/providers/session_manager_provider.dart` (manifest: startProject):
  - `G:/Templates/flutter/t115/t115_flutter/lib/core/providers/session_manager_provider.dart`
  - `G:/Templates/flutter/t115/t115_admin/lib/core/providers/session_manager_provider.dart`
  - `G:/Templates/flutter/simplified/simplified_flutter/lib/core/providers/session_manager_provider.dart`
  - `G:/Templates/flutter/simplified/simplified_admin/lib/core/providers/session_manager_provider.dart`
- Test: extend существующий test или новый `src/test/generators/session_manager_ref_mounted.test.ts` (Live regression — startProject verbatim файл, без substitution)
- report.md + docs sync

Запрещено:

- `src/features/generation/` generator logic
- entity state_providers (TASK-025/032 territory)
- любой другой template файл

## Критерии приёмки

- [ ] 4 session_manager_provider.dart: `_fetchUserContext()` имеет `if (!ref.mounted) return;` после await (перед `state = userContext;`) И в catch (перед `state = null;`). **8 guards total** (2 × 4 файла).
- [ ] Остальная логика `_fetchUserContext` не изменена (`ref.read(serverpodClientProvider)`, print'ы, try/catch структура)
- [ ] `tsc` clean, `npm run lint` 0 errors
- [ ] mocha: 264 + N passing (Live regression session_manager)
- [ ] `codegen verify --name t<N+1> --template t115` PASS errors=0 + `codegen verify --name t<M+1> --template simplified` PASS errors=0 (оба templates — startProject файл copied на create-project)
- [ ] report.md с реальными числами
- [ ] Multi-agent review: Standard + Adversarial

## Заметки по реализации

### Pattern (per file `_fetchUserContext`)

```text
// BEFORE:
Future<void> _fetchUserContext() async {
  final client = ref.read(serverpodClientProvider);
  try {
    final userContext = await client.userManagement.getMyUserContext();
    state = userContext;
    print('✅ ...');
  } catch (e, st) {
    print('❌ ...');
    state = null;
  }
}

// AFTER:
Future<void> _fetchUserContext() async {
  final client = ref.read(serverpodClientProvider);
  try {
    final userContext = await client.userManagement.getMyUserContext();
    if (!ref.mounted) return;
    state = userContext;
    print('✅ ...');
  } catch (e, st) {
    print('❌ ...');
    if (!ref.mounted) return;
    state = null;
  }
}
```

⚠ **catch guard:** если await threw из-за dispose → state assign в catch тоже crash. Guard в catch обязателен (не только success path).

⚠ **`ref.mounted` доступен** в `@riverpod` Notifier (`UserSessionDataNotifier extends _$UserSessionDataNotifier`) — стандартный Riverpod 2.x API, как в state_providers.

⚠ **4 файла почти идентичны** — отличаются только import (`flutter_riverpod` в flutter, client import t115/simplified) + whitespace. `_fetchUserContext` идентичен везде → same patch.

### startProject manifest = verbatim copy

session_manager_provider.dart = `manifest: startProject` → копируется на `create-project` БЕЗ entity substitution (только project-name substitution `t115`→`<name>`). Нет per-entity multiplication, нет ENTITY dictionary concern. Test = Live regression grep (как state_providers live suite).

### Stack lock compliance

- ✅ Riverpod `@riverpod` preserved, `ref.mounted` = std idiom
- ✅ 0 generator src/ changes
- ✅ 0 package versions

## Релевантный контекст

- [ai/bug-reports/001-state-provider-ref-disposed.md](../../../bug-reports/001-state-provider-ref-disposed.md) — BUG-001, residual note (этот TASK закрывает)
- [ai/tasks/done/TASK-032-bug-4-t115-ref-mounted-guard-parity/report.md](../../done/TASK-032-bug-4-t115-ref-mounted-guard-parity/report.md) — adversarial F3 origin
- [src/test/generators/state_providers_ref_mounted.test.ts](../../../../src/test/generators/state_providers_ref_mounted.test.ts) — Live regression suite pattern reference
- `G:/Templates/flutter/t115/t115_flutter/lib/core/providers/session_manager_provider.dart` — pre-state

## План работы

1. [ ] Patch t115_flutter session_manager (2 guards)
2. [ ] Patch t115_admin (2 guards)
3. [ ] Patch simplified_flutter (2 guards)
4. [ ] Patch simplified_admin (2 guards)
5. [ ] Verify 8 guards total + логика не изменена (grep)
6. [ ] Test: Live regression session_manager (4 paths, 2 guards each) — extend state_providers test или новый файл
7. [ ] `npm run compile` + `npm run lint` + mocha
8. [ ] **STOP-gate** перед create-project
9. [ ] `create-project --name t<N+1> --template t115` + `verify` PASS errors=0
10. [ ] `create-project --name t<M+1> --template simplified` + `verify` PASS errors=0
11. [ ] grep guard в bootstrapped session_manager обоих fresh projects
12. [ ] **STOP-gate** multi-agent review (Standard + Adversarial)
13. [ ] Apply HIGH+ findings
14. [ ] report.md + docs sync + BUG-001 residual → closed
15. [ ] **STOP-gate** ЖДУ User "коммить"

## STOP-gates

- **Перед create-project** (×2: t115 + simplified) — ~50MB каждый, sandbox не удаляет
- **Перед multi-agent spawn**
- **Перед task.py pr** (push)
- **Перед task.py merge** (master)

## План тестирования

**Unit:** Live regression session_manager (4 disk paths, grep `if (!ref.mounted) return;` count == 2 per file). Skip на CI. Опционально inline golden если оправдано (startProject = verbatim, low substitution risk — live regression достаточно, но рассмотреть inline для CI coverage аналогично TASK-032 F1 lesson).

**Verify:** create-project + verify на **обоих** templates (startProject файл в обоих) PASS errors=0.

**Runtime:** skip (ref.mounted = std idiom, compile gate, TASK-025/032 precedent).

```bash
npm run compile
node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
npm run lint
# после STOP-gate:
node out/adapters/cli/index.js create-project --name t<N+1> --template t115
node out/adapters/cli/index.js verify --name t<N+1> --human
node out/adapters/cli/index.js create-project --name t<M+1> --template simplified
node out/adapters/cli/index.js verify --name t<M+1> --human
```

## Результаты

- 4 файла `session_manager_provider.dart` (template, outside repo → commit в devabacus/t115 + ... simplified? simplified template git status TBD)
- 1 test файл (extend или new)
- report.md + status/roadmap/agent_memory + BUG-001 residual → fully closed
- **0 src/ generator changes**

⚠ **CI-coverage lesson (TASK-032 F1):** Live regression skip'ается на CI. Рассмотреть inline golden для session_manager чтобы CI ловил regression (startProject verbatim — golden = literal copy + grep guard count). Решить в impl.
