import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * TASK-033 — `ref.mounted` guard в `core/providers/session_manager_provider.dart`
 * `_fetchUserContext()`. Закрывает последний residual BUG-001 shape (выявлен
 * TASK-032 adversarial F3).
 *
 * **Корень:** `_fetchUserContext` присваивает `state = userContext;` (success)
 * и `state = null;` (catch) после `await client.userManagement.getMyUserContext()`
 * БЕЗ `ref.mounted` guard. Disposed-during-await → "Cannot use Ref after disposed".
 * Другой shape чем entity state_providers (прямой try/catch, не `AsyncValue.guard`)
 * → не покрыт TASK-025/032.
 *
 * **Фикс** — `if (!ref.mounted) return;` после await (перед `state = userContext`)
 * И в catch (перед `state = null`). Применён в ОБОИХ templates × flutter+admin
 * (4 файла, manifest: startProject — verbatim copy на create-project).
 *
 * **Что проверяет:**
 * 1. Inline golden (CI-safe): patched `_fetchUserContext` содержит 2 guards в
 *    правильном порядке (перед каждым state assign). Independent от disk.
 * 2. Live regression (disk-dependent): 4 template файла на disk содержат 2 guards.
 *    Skip на CI (templates недоступны).
 */

// ── Inline golden (patched _fetchUserContext shape) ─────────────────────────

const FETCH_USER_CONTEXT_PATCHED = `  Future<void> _fetchUserContext() async {
    final client = ref.read(serverpodClientProvider);
    try {
      final userContext = await client.userManagement.getMyUserContext();
      if (!ref.mounted) return;
      state = userContext;
      print('✅ Получен User Context: $userContext');
    } catch (e, st) {
      print('❌ Ошибка получения User Context: $e\\n$st');
      if (!ref.mounted) return;
      state = null;
    }
  }`;

// ── Disk paths (optional live regression) ───────────────────────────────────

const SESSION_MANAGER_PATHS: Record<string, string> = {
    t115Flutter: 'G:/Templates/flutter/t115/t115_flutter/lib/core/providers/session_manager_provider.dart',
    t115Admin: 'G:/Templates/flutter/t115/t115_admin/lib/core/providers/session_manager_provider.dart',
    simplifiedFlutter: 'G:/Templates/flutter/simplified/simplified_flutter/lib/core/providers/session_manager_provider.dart',
    simplifiedAdmin: 'G:/Templates/flutter/simplified/simplified_admin/lib/core/providers/session_manager_provider.dart',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function countGuards(content: string): number {
    return (content.match(/if\s*\(!ref\.mounted\)\s*return;/g) ?? []).length;
}

/**
 * Проверяет что guard стоит ПЕРЕД `state = userContext;` (success path) —
 * canonical ordering. Возвращает true если паттерн `if (!ref.mounted) return;`
 * непосредственно предшествует `state = userContext;`.
 */
function hasGuardBeforeSuccessAssign(content: string): boolean {
    return /if\s*\(!ref\.mounted\)\s*return;\s*\n\s*state\s*=\s*userContext;/.test(content);
}

/** Guard перед `state = null;` в catch блоке. */
function hasGuardBeforeNullAssign(content: string): boolean {
    return /if\s*\(!ref\.mounted\)\s*return;\s*\n\s*state\s*=\s*null;/.test(content);
}

suite('TASK-033: session_manager ref.mounted guard (BUG-001 residual)', () => {

    suite('Inline golden shape (CI-safe)', () => {
        test('_fetchUserContext содержит 2 guards (success + catch)', () => {
            assert.strictEqual(
                countGuards(FETCH_USER_CONTEXT_PATCHED),
                2,
                'expected 2 `if (!ref.mounted) return;` (после await перед state=userContext; в catch перед state=null)',
            );
        });

        test('guard ordering: перед state = userContext; (success path)', () => {
            assert.ok(
                hasGuardBeforeSuccessAssign(FETCH_USER_CONTEXT_PATCHED),
                'guard должен стоять ПЕРЕД `state = userContext;` (иначе useless после async gap)',
            );
        });

        test('guard ordering: перед state = null; (catch path)', () => {
            assert.ok(
                hasGuardBeforeNullAssign(FETCH_USER_CONTEXT_PATCHED),
                'guard должен стоять ПЕРЕД `state = null;` в catch (disposed-during-await crash)',
            );
        });
    });

    suite('Live template regression (disk-dependent, optional)', () => {
        for (const [variant, filePath] of Object.entries(SESSION_MANAGER_PATHS)) {
            test(`${variant}: live session_manager содержит 2 guards`, function () {
                if (!fs.existsSync(filePath)) {
                    (this as Mocha.Context).skip();
                    return;
                }
                const content = fs.readFileSync(filePath, 'utf-8');
                assert.strictEqual(
                    countGuards(content),
                    2,
                    `live ${path.basename(filePath)} (${variant}): expected 2 guards, ` +
                    `got ${countGuards(content)}. Регрессия TASK-033 patch?`,
                );
                assert.ok(
                    hasGuardBeforeSuccessAssign(content),
                    `live ${variant}: guard перед state = userContext; отсутствует`,
                );
                assert.ok(
                    hasGuardBeforeNullAssign(content),
                    `live ${variant}: guard перед state = null; (catch) отсутствует`,
                );
            });
        }
    });
});
