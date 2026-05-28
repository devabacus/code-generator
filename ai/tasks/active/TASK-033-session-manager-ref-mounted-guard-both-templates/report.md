# TASK-033 — session_manager ref.mounted guard (BUG-001 residual, оба templates)

## Резюме

Закрывает **последний residual BUG-001 shape** — `core/providers/session_manager_provider.dart` `_fetchUserContext()` присваивал `state = userContext;` (success) и `state = null;` (catch) после `await client.userManagement.getMyUserContext()` **без `ref.mounted` guard** → "Cannot use Ref after disposed" crash при dispose-during-await. Выявлен TASK-032 adversarial F3. Другой shape чем entity state_providers (прямой try/catch, не `AsyncValue.guard`) → не покрыт TASK-025/032.

**Template-only patch + test, 0 generator src/ changes.** 8 guards (2 × 4 файла: t115 + simplified, flutter + admin). **BUG-001 теперь полностью закрыт** для обоих templates (entity state_providers + session_manager).

**Result:** verify t199 (t115) PASS errors=0, t200 (simplified) PASS errors=0. mocha **271 passing** (+7). Standard + Adversarial оба APPROVE.

## Изменения

### Template patch (4 файла, manifest: startProject)

| Файл | Guards |
|---|---|
| `t115/t115_flutter/lib/core/providers/session_manager_provider.dart` | 2 |
| `t115/t115_admin/lib/core/providers/session_manager_provider.dart` | 2 |
| `simplified/simplified_flutter/lib/core/providers/session_manager_provider.dart` | 2 |
| `simplified/simplified_admin/lib/core/providers/session_manager_provider.dart` | 2 |

**8 guards total** (2 per file: после await перед `state = userContext`; в catch перед `state = null`).

### Transformation

```dart
// BEFORE:
final userContext = await client.userManagement.getMyUserContext();
state = userContext;
...
} catch (e, st) {
  print('❌ ...');
  state = null;
}

// AFTER:
final userContext = await client.userManagement.getMyUserContext();
if (!ref.mounted) return;
state = userContext;
...
} catch (e, st) {
  print('❌ ...');
  if (!ref.mounted) return;
  state = null;
}
```

⚠ **catch guard обязателен:** если await threw из-за dispose → `state = null` в catch тоже crash. Guard в обоих путях.

### Repo changes (git tracked)

- **NEW:** [src/test/generators/session_manager_ref_mounted.test.ts](../../../../src/test/generators/session_manager_ref_mounted.test.ts) — 7 tests:
  - 3 inline golden (CI-safe): 2 guards count + ordering перед `state = userContext` + ordering перед `state = null`
  - 4 live regression (disk-dependent): 4 файла, 2 guards each, skip на CI
- **0 src/ generator logic changes**

## Тесты

| Слой | Status | Details |
|---|---|---|
| `tsc -p ./` | ✅ clean | 0 errors |
| mocha workaround | ✅ **271 passing** | baseline 264 (post-TASK-032) + 7 TASK-033 (3 inline golden + 4 live regression) |
| `npm run lint` | ✅ | 0 errors, 18 pre-existing warnings |
| grep guards (4 файла) | ✅ | 2 each = 8; логика intact (`state = userContext` ×1 + `state = null` ×2 [catch + build sync listener] = 3 assigns per file) |
| `verify --name t199 --template t115` | ✅ PASS | errors=0 warnings=1 infos=44 (26422ms) |
| `verify --name t200 --template simplified` | ✅ PASS | errors=0 warnings=0 infos=30 (26390ms) |
| bootstrapped session_manager (t199 + t200) | ✅ | 2 guards each — startProject verbatim copy с guard |

## Multi-agent review (Standard + Adversarial)

### Standard — APPROVE

Correctness ✅ (guard placement правильный во всех 4, canonical ordering), logic intact ✅ (`build()` sync `state = null` correctly НЕ guarded), completeness ✅ (4 файла), scope ✅ (другие провайдеры untouched), test quality ✅ (3 inline CI-safe + 4 live, golden matches disk verbatim). (mocha runtime blocked vscode-update mutex — teamlead подтвердил 271.)

### Adversarial — APPROVE

| Severity | ID | Finding | Disposition |
|---|---|---|---|
| LOW | F1 | `build()` listener 3rd `state = null` (line ~38) unguarded — но SAFE: sync в `if/else if` (await в ДРУГОЙ ветке), no async gap. Count 3 assigns / 2 guards мог бы looks like miss. | **Acceptable** — не defect, sync path. |
| INFO | F2 | Riverpod = **3.0.3** (не 2.x как предполагал task prompt). `ref.mounted` resolves via generated `$Notifier` base (independent от flutter_riverpod import — admin .dart omits it, всё равно compiles). dispose-safe by design. | Version-corrected здесь. Не влияет на fix correctness. |
| INFO | F3 | Inline golden `FETCH_USER_CONTEXT_PATCHED` byte-exact с реальным patch (guard ordering regexes pass на всех 4 live). | No drift. |
| INFO | F4 | Same CI limitation как TASK-032 (inline golden тестит свою копию, live skip на CI). | Acceptable per precedent. |
| LOW | F5 | report.md был unfilled template. | **APPLIED** — этот report заполнен. |

No CRITICAL/HIGH/MEDIUM. No scope creep.

## Stack-lock compliance (Discussion #11)

✅ Riverpod (3.0.3) `@riverpod` annotations preserved, `ref.mounted` = std `$Notifier` API
✅ Clean directory layout / sync_core / Drift / 13 markers — не trognyты
✅ 0 generator src/ logic changes
✅ 0 package version changes

## BUG-001 — полностью закрыт (оба templates)

| Layer | simplified | t115 |
|---|---|---|
| entity `*_state_providers.dart` | TASK-025 ✅ | TASK-032 ✅ |
| core `session_manager_provider.dart` | TASK-033 ✅ | TASK-033 ✅ |

Anti-pattern (`state =` после await без `ref.mounted` guard) истреблён в обоих templates во всех известных местах.

## Риски / Заметки

- **t199/t200 state:** clean (verify PASS errors=0). Sandbox blocks delete.
- **Riverpod 3.0.3** (не 2.x) — `ref.mounted` валиден через `$Notifier` base, dispose-safe.
- **CI coverage:** inline golden (CI-safe shape lock) + live regression (disk, skip CI) — per TASK-032 F1 lesson.
- **t115 + simplified template changes — outside repo** (commit отдельно: `devabacus/t115` + simplified template repo если применимо).
- **Adversarial review value 13-й precedent:** оба APPROVE; F1 (build 3rd assign) корректно классифицирован как safe (не false-positive miss). Pattern continues.

## Статус

Ready for review.
