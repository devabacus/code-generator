# TASK-010: `codegen verify --runtime` + sync_smoke_test шаблон

## ⚠ Status: Abandoned (per Discussion #8 Q7 + Discussion #9 supersession, 2026-05-03)

**Решение:** TASK-010 abandoned — runtime docker verify не блокирует roadmap. Phase 1.5 static verify (pub get + serverpod generate + build_runner + flutter analyze) sufficient для current needs.

**Если still relevant** — runtime test concern может быть merged в **Initiative Phase A scope** (Discussion #9, "Simplified Template Initiative") когда Phase A architectural design phase оценивает CI infrastructure (TASK-CI-001 covers minimal gate, runtime verify = potential extension).

**Не actionable как self-standing TASK** — moved active→done без implementation.

См. [Discussion #8 archive Q7](../../../discussions/archive/8-roadmap-approval-sequence-phase-15-closu/) + [Discussion #9 archive](../../../discussions/archive/9-weight-v2-fresh-build-на-simplified-temp/).

---

## Ветка (изначальная — не использована)

`feature--codegen-verify-runtime` (новая, после мерджа `feature--fix-codegen-regen-bugs`)

## Цель

Расширить `codegen verify` команду флагом `--runtime`. Сейчас она делает только статическую проверку (pub get → serverpod generate → build_runner → flutter analyze). Цель — добавить **runtime-гейт**, чтобы агент не мог отдать пользователю проект "вроде работает" без подтверждения, что сервер реально стартует и базовые endpoints отвечают.

Без runtime-гейта баги типа "сервер падает на init из-за clock skew" / "endpoint возвращает 500" проходят analyze, но проявляются только при ручной проверке. Это противоречит Definition of Done в [CLAUDE.md](../../../CLAUDE.md).

## Не-цели

- НЕ писать UI/widget tests (`flutter test`) — это отдельная задача, требует виртуального дисплея.
- НЕ тестировать BLE-flow (физическое устройство недоступно в CI).
- НЕ тестировать auth/login flow (много специфики, лучше пользовательский test_helper).
- НЕ заменять `codegen verify` (статическая) — `--runtime` это **дополнительный** гейт, статическая остаётся.

## Scope

Разрешено:

- `src/adapters/cli/commands/verify.ts` — добавить флаг `--runtime` и шаги: docker compose up → pg_isready → serverpod create-migration → server start (background) → healthcheck → integration test → server stop → docker compose down.
- `G:/Templates/flutter/t115/t115_server/test/integration/sync_smoke_test.dart` — новый шаблон (manifest startProject), generic CRUD + watchEvents для Category/Tag/Task.
- `src/adapters/cli/commands/create_project.ts` — копирование sync_smoke_test.dart в target (или через manifest).
- `src/test/verify/` — unit-тесты на новые helpers (parseServerStartLog, healthcheckUrl).
- `CLAUDE.md` — обновить DoD: "verify --runtime PASS" вместо "verify PASS" для финального approval.
- `ai/docs/agent_memory.md` — упомянуть `--runtime` как обязательный гейт.

Запрещено:

- менять `serverpod_test` (стороннее API).
- удалять статическую часть `verify`.
- автоматический `--runtime` по умолчанию (опт-ин: только когда передан флаг).

## Критерии приёмки

- [ ] `codegen verify --name <X> --runtime` выполняет: статическая часть → docker up → migration → server start → healthcheck → integration test → server stop → docker down. Возвращает JSON со всеми step results.
- [ ] Если статическая часть FAIL → runtime НЕ запускается (раннее завершение).
- [ ] Если docker не запущен → понятная ошибка "Docker daemon not running, start Docker Desktop".
- [ ] Healthcheck опрашивает `http://localhost:8080/` с таймаутом 30s.
- [ ] Integration test запускается через `dart test test/integration/sync_smoke_test.dart`. Тест проверяет минимум: `category.createCategory()` returns non-null id, `category.getCategoryById(id)` returns the same.
- [ ] Сервер останавливается **гарантированно** даже при FAIL integration test (try/finally).
- [ ] Docker контейнеры останавливаются **гарантированно** (флаг `--keep-docker` для отладки).
- [ ] На свежем t144 (через `create-project --name t144`) `verify --runtime` проходит PASS с первого запуска.
- [ ] Unit-тесты для парсера логов сервера (детект "DATABASE INITIALIZATION COMPLETED" / "Failed to start" / "errno = 10048").

## Заметки по реализации

### Структура verify.ts с --runtime

```ts
async function handleVerify(opts: VerifyOptions): Promise<void> {
    // ... существующая статическая часть ...
    if (!opts.runtime) {
        emitVerifyResult(result, jsonMode, startTime);
        process.exit(result.success ? 0 : 1);
    }

    // Раннее завершение если статика FAIL
    if (!result.success) {
        emitVerifyResult(result, jsonMode, startTime);
        process.exit(1);
    }

    let serverProcess: ChildProcess | null = null;
    try {
        // Step 5: docker compose up -d
        // Step 6: pg_isready loop
        // Step 7: serverpod create-migration --force
        // Step 8: spawn dart bin/main.dart --apply-migrations (background)
        // Step 9: poll http://localhost:8080/ with 30s timeout
        // Step 10: dart test test/integration/sync_smoke_test.dart
    } finally {
        if (serverProcess) { serverProcess.kill('SIGTERM'); }
        if (!opts.keepDocker) {
            await runCommand('docker compose down -v', serverPath, 60_000);
        }
    }
}
```

### sync_smoke_test.dart шаблон

```dart
// manifest: startProject
import 'package:test/test.dart';
import 'package:serverpod_test/serverpod_test.dart';
import 'package:t115_server/src/generated/test_tools/serverpod_test_tools.dart';
import 'package:t115_server/src/generated/protocol.dart';

void main() {
  withServerpod('Sync smoke', (sessionBuilder, endpoints) {
    test('Category CRUD round-trip', () async {
      final created = await endpoints.category.createCategory(
        sessionBuilder.build(),
        Category(/* ... */),
      );
      expect(created.id, isNotNull);
      final fetched = await endpoints.category.getCategoryById(
        sessionBuilder.build(),
        created.id!,
      );
      expect(fetched, isNotNull);
    });

    test('Task watchEvents emits SyncEvent on create', () async {
      // ...
    });
  });
}
```

Шаблон через `withServerpod` использует `serverpod_test` с in-memory или test-postgres контейнером (зависит от настройки). На сгенерированном t143 это уже работает — `serverpod_test_tools.dart` есть в `test/integration/test_tools/`.

### Управление портами

`docker-compose.yaml` шаблона использует постоянные порты (8090 postgres, 8091 redis для main; 9090/9091 для test). Несколько проектов одновременно невозможно поднять — это ограничение шаблона, **не задача TASK-010**. В рамках задачи зафиксировать в README/CLAUDE.md "verify --runtime требует чтобы предыдущий verify --runtime был завершён (server stopped, docker down)".

### Граничные случаи

- **8082 занят зомби dart процессом** (наблюдалось на t140→t143 переключении): добавить pre-check на `Get-NetTCPConnection -LocalPort 8082 -State Listen` (Windows) / `lsof -i:8082` (Unix), kill зомби с понятным сообщением.
- **Postgres медленно стартует:** pg_isready loop с таймаутом 60s.
- **Server init долго (build_runner cache miss):** healthcheck loop с таймаутом 90s.

## Релевантный контекст

Файлы для прочтения перед началом:

- [`src/adapters/cli/commands/verify.ts`](../../../src/adapters/cli/commands/verify.ts) — существующая статическая часть.
- [`src/adapters/cli/commands/local_setup.ts`](../../../src/adapters/cli/commands/local_setup.ts) — уже есть docker compose + migration + server start логика, частично переиспользовать.
- [`src/adapters/cli/commands/create_project.ts`](../../../src/adapters/cli/commands/create_project.ts) — добавить копирование sync_smoke_test.dart (либо через manifest startProject).
- `G:/Templates/flutter/t115/t115_server/test/integration/test_tools/serverpod_test_tools.dart` — посмотреть API serverpod_test для шаблона smoke-теста.
- [`CLAUDE.md`](../../../CLAUDE.md) → раздел Definition of Done — обновить требование на verify --runtime.

## План тестирования

1. Реализация → `npm test` (новые unit-тесты на парсер логов).
2. Smoke-test на существующем t143:
   - Запустить `codegen verify --name t143 --runtime --human` (server не должен быть уже запущен).
   - Ожидаем PASS на всех шагах.
   - Проверить что после завершения docker stopped и port 8082 свободен.
3. Полная проверка: `create-project --name t144` → `verify --name t144 --runtime` → PASS с первого раза.
4. FAIL-кейс: специально сломать endpoint в шаблоне (например, бросить exception в `getCategories`) → убедиться что integration test FAIL и сервер остановлен.

## Результаты

- `src/adapters/cli/commands/verify.ts` — добавлен флаг `--runtime` и runtime-секция (~150 строк).
- `G:/Templates/flutter/t115/t115_server/test/integration/sync_smoke_test.dart` — новый файл с manifest startProject (или копируется явно из autoGenerateTasksFeature).
- `src/adapters/cli/commands/create_project.ts` — копирование sync_smoke_test.dart в target.
- `src/test/verify/` — unit-тесты на парсер логов сервера.
- `CLAUDE.md` — DoD обновлён: финальный approval требует `verify --runtime PASS`.
- `ai/docs/agent_memory.md` — упомянуть `--runtime` гейт.
- `report.md` — отчёт с конкретными прогонами на t143 и t144 (или t145 если потребуется fix).
