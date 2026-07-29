---
id: TASK-047
schema_version: 2
status: active
mode: interactive
zone: "generator-core"
verification_profile: "ts-generator"
checks: [compile, lint, unit]
max_attempts: 3
depends_on: []
---

# TASK-047: полный цикл новой сущности на weight (`--with-server` + verify)

> Доказать до конца то, что разведка 2026-07-28 показала наполовину.

## Цель

Ответить фактами на вопрос «можно ли уже сейчас добавлять новые сущности в weight».

Разведка показала: новая сущность в копии weight генерируется **без единого конфликта**
(exit 0, 24 файла), общие файлы не страдают — `sync_orchestrator_provider.dart` получил
19 вставок и 0 удалений, `database.dart` — только смену `schemaVersion`.

**Но:** прогон был без `--with-server`, и **компиляция не проверялась**. Значит утверждение
«новые сущности работают» держится на половине доказательства: сгенерировать файлы ≠
получить рабочий код.

## Не-цели

- НЕ мигрировать существующие сущности weight (это TASK-048/049).
- НЕ менять генератор, если он не сломается: задача проверочная. Найденный дефект →
  bug-report + отдельная задача, а не фикс «по ходу».
- НЕ коммитить ничего в сам weight.

## Scope

Разрешено:

- прогоны CLI в **копии** weight (git worktree, см. ниже)
- `ai/project/docs/weight-migration-probe-*.md` — дописать результат
- новый bug-report, если что-то сломается

Запрещено:

- писать в оригинальный `G:/Projects/Flutter/serverpod/weight` (только worktree-копия)
- коммиты/push в репо weight

## Как воспроизвести окружение

Копия уже может существовать (`G:/Projects/Flutter/serverpod-probe/weight`). Если нет:

```bash
cd G:/Projects/Flutter/serverpod/weight
git worktree add --detach G:/Projects/Flutter/serverpod-probe/weight HEAD
```

⚠ Имя папки обязано быть `weight` — `targetProject` выводится из `basename(--workspace)`.
⚠ В копии от разведки уже лежит экспериментальная сущность `probe` и `.codegen/ledger.json` —
   начать с чистого состояния (`git status` в worktree должен быть пуст).

## Критерии приёмки

- [x] Новая сущность сгенерирована с `--with-server` — файлы и на клиенте, и в `weight_server/`
- [x] `serverpod generate --experimental-features=all` → exit 0 (20260ms)
- [x] `build_runner build --delete-conflicting-outputs` → exit 0 (44849ms)
- [x] **`flutter analyze` в `weight_flutter`** — **errors=0**, warnings=1, infos=46 — идентично baseline до генерации
- [x] Проверено, что общие файлы (`sync_orchestrator_provider.dart`, `database.dart`) не потеряли пользовательский код: 19/0 и 6/1, единственное удаление — строка `schemaVersion => 25`
- [x] Проверено, что повторный прогон той же сущности **молчит** (exit 0, 0 конфликтов, патчеры идемпотентны, `schemaVersion` не подскочил)
- [!] Результат дописан в `weight-migration-probe-*.md` — **блокировано**: файл существует только в открытом PR #56, в master его нет. Дописать после merge
- [x] Явный вердикт в report.md: можно ли добавлять новые сущности в weight сегодня, и при каких условиях

## Заметки по реализации

- `flutter analyze` на weight покажет предсуществующие ошибки проекта — снять baseline
  **до** генерации, чтобы отличить свои от чужих. Без этого числа бессмысленны.
- weight — большой проект, `build_runner` может идти минуты. Не перезапускать «посмотреть лог».
- Windows: `flutter`/`serverpod` через PowerShell wrapper, в цепочках `;` вместо `&&`.

## План тестирования

Сам прогон и есть тест. Гейт — `flutter analyze` с errors=0 и цитированием чисел.
