---
id: TASK-042
schema_version: 2
status: active            # active | blocked | done
mode: interactive         # interactive | auto
zone: "generator-core"
verification_profile: "ts-generator"
checks: [compile, lint, unit]
max_attempts: 3
depends_on: []
---

# TASK-042: BUG-029 preflight + ledger — fail-closed guard против потери пользовательского кода

## Цель

Закрыть [BUG-029](../../bug-reports/029-base-section-overwrite-loses-custom-code.md) в его
переформулированном виде: **65 из 81 entity-шаблона идут через `createFile()` без проверки
существования** — пользовательский код молча затирается при regen.

Первый (и единственный в этой задаче) deliverable — **двухфазный fail-closed preflight
ПЛЮС ledger хешей машинного вывода**. Это **неделимая единица**: guard без baseline
нежизнеспособен (см. ниже), ledger без guard ничего не предотвращает.

## Почему preflight и ledger нельзя разделить

Каждый штатный regen меняет вывод генератора во ВСЕХ файлах сущности (добавили поле →
изменились модель, адаптеры, таблицы, провайдеры — ~21 файл). Если preflight сравнивает
только `existing ↔ new render`, он выдаст conflict на всех файлах, которых пользователь
не касался → пользователь рефлекторно жмёт `--overwrite-existing` при каждом запуске →
guard превращается в шум и перестаёт защищать ровно тогда, когда custom-код есть
(prompt fatigue). Ledger даёт недостающую **третью точку сравнения**: хеш того, что
записал сам генератор.

| Состояние | Значение | Действие |
| --- | --- | --- |
| хеш existing == хеш в ledger | нетронутый машинный вывод | перезаписать молча, **даже если render изменился** |
| хеш existing != хеш в ledger | пользователь правил файл | conflict, fail-closed + diff |
| записи в ledger нет | legacy / первый запуск | по state machine ниже (инвариант «в») |

## Три технических инварианта (обязательны, из дискуссии #14 → Decision)

**(а) Preflight ДО начала любой записи, НЕ внутри `_processFile`.**
Файлы обрабатываются через `Promise.all`
([generation_service.ts:172-177](../../../../src/features/generation/generators/generation_service.ts#L172-L177)) —
конкурентно. Бросок в одном promise не остановит остальные → частично записанное дерево.
Поток строго двухфазный:

1. **Plan/preflight:** вычислить все destination paths и новый контент, прочитать
   existing, классифицировать (`create` / `safe merge` / `full replace` / `broken markers`),
   **не меняя filesystem**.
2. **Apply:** только если конфликтов нет ИЛИ получено явное подтверждение — выполнить записи.

CLI по умолчанию: non-zero exit со списком путей. VS Code: preview/confirm. Флаг подтверждения
назвать узко — `--overwrite-existing`, не универсальный `--force`.

**(б) Для merge-файлов хешируются РЕГИОНЫ, не файл целиком.**
Иначе легальное добавление custom-импорта/метода в preserved-зону даёт conflict на пустом
месте. Форма ledger зависит от ownership:

```json
{
  "schemaVersion": 1,
  "files": {
    "lib/.../task_model.dart": { "ownership": "generated", "sha256": "..." },
    "lib/.../task_dao.dart": {
      "ownership": "merge",
      "regions": { "imports": "...", "base": "..." }
    }
  }
}
```

Custom-зоны в ledger не входят и при preflight игнорируются. Исчезнувший, дублированный
или malformed region-marker — conflict независимо от хеша (это закрывает silent staleness).

**(в) Legacy-состояние НЕ «усыновляется» как generated.**
Если existing ≠ render и пользователь выбрал «оставить как есть» — **нельзя** писать хеш
existing как baseline: внутри может быть custom-код, и на следующем regen
`existing == ledger` → генератор молча сотрёт его (guard лишь отложит BUG-029 на один
запуск). Безопасная state machine для отсутствующей записи:

1. `existing == render` → безопасно seed hash без prompt.
2. `existing != render` → conflict + diff.
3. После conflict допустимо ТОЛЬКО: **overwrite reviewed** (записать render, затем
   хешировать именно render) ИЛИ **preserve** (ничего не писать и не seed'ить).
   Команда «adopt existing as generated» по умолчанию **недопустима**.

## Дополнительные требования к ledger

- Путь: `<project>/.codegen/ledger.json`, **versioned** (`schemaVersion`), хранится **в git**
  (иначе свежий clone = пустой baseline = всё в conflict), пути **project-relative**.
- Хеш — **точный SHA-256 по UTF-8 содержимому**, БЕЗ lossy-нормализации. В Dart whitespace
  внутри строковых литералов и комментариев является содержимым; схлопывание пробелов
  способно сделать разные программы одинаковыми для guard. Format-on-save иногда даст
  ложный conflict — это **безопасная деградация** (одно подтверждение, ledger пересевается).
- Ledger записывается в FS **последним** — после успешного apply всех файлов, атомарной
  заменой временного файла. Если записать первым, crash оставит ложное «файл нетронут».
- Backup/diff перед подтверждённым destructive apply полезен: ledger хранит только хеши
  и восстановить прежний код не может.

## Не-цели

- **НЕ мигрировать 65 шаблонов** на merge-дисциплину — это отдельный инкрементальный этап
  ПОСЛЕ guard'а, по файлу.
- **НЕ вводить per-method markers** и **НЕ делать patch-only постоянным режимом** — оба
  отклонены дискуссией #14.
- **НЕ решать правку тела generated-метода** — не сохраняется ни одной маркерной схемой,
  это вопрос точек расширения (callback/strategy/wrapper/subclass), отдельное решение.
- НЕ вводить ownership-директиву `// codegen:ownership:` в шаблоны в этой задаче — но
  структура ledger обязана быть к ней готова (поле `ownership` уже в схеме).
- НЕ трогать junction-задачи (TASK-040/041).

## Scope

Разрешено:

- `src/features/generation/generators/generation_service.ts` — двухфазный поток plan/apply
- новый модуль preflight/ledger (напр. `src/features/generation/generators/ledger.ts`)
- `src/adapters/cli/commands/generate_entity.ts` (+ прочие точки генерации) — флаг
  `--overwrite-existing`, non-zero exit, вывод плана
- `src/adapters/vscode/**` — preview/confirm (минимально: показать список и запросить подтверждение)
- `src/test/**`
- `ai/project/bug-reports/029-*.md` — статус

Запрещено:

- шаблоны `G:/Templates/flutter/*` (миграция — отдельный этап)
- target-проекты (руками не патчить)
- lossy-нормализация при хешировании
- «adopt existing as generated» по умолчанию

## Критерии приёмки

- [ ] Двухфазный поток: ни одной записи в FS до завершения plan; доказать тестом (конфликт в одном файле → НИ ОДИН файл не записан)
- [ ] Ledger создаётся/обновляется атомарно и **после** успешного apply
- [ ] `existing == ledger` при изменившемся render → молчаливая перезапись (нет prompt fatigue) — тест
- [ ] `existing != ledger` → conflict, fail-closed, non-zero exit в CLI, diff в выводе — тест
- [ ] merge-файл: правка в custom-зоне НЕ даёт conflict; правка в `:base` — даёт — тест
- [ ] Сломанные/дублированные `:base`-маркеры → conflict (silent staleness закрыт) — тест
- [ ] Legacy без записи в ledger: `existing == render` → seed; `existing != render` → conflict; «оставить как есть» НЕ сеет baseline — тест
- [ ] Хеширование без нормализации (тест: файл, отличающийся только пробелами в строковом литерале, даёт другой хеш)
- [ ] `--overwrite-existing` подтверждает и записывает render, ledger получает хеш render
- [ ] E2E: свежий `t<N>` → create-project → generate-entity → повторный generate-entity без правок = молча; с ручной правкой файла = conflict. Числа `codegen verify` в report.md
- [ ] checks compile/lint/unit зелёные, baseline не падает

## Заметки по реализации

- СТРАТЕГИЯ 1 (merge) / СТРАТЕГИЯ 2 (full replace) — `generation_service.ts:214-239`;
  именно СТРАТЕГИЯ 2 (65 файлов) пишет `createFile` без проверок.
- `_mergeBaseContent` при отсутствии маркеров
  [тихо возвращает destinationContent](../../../../src/features/generation/generators/generation_service.ts#L255-L257) —
  это третий silent-режим, закрывается инвариантом (б).
- `AppDatabaseGenerator` и патчеры (`relation_patcher`, `orchestrator_patcher`) пишут файлы
  своими путями — проверить, нужно ли их тоже завести под plan/apply (как минимум
  зафиксировать в report.md, если оставлены вне guard'а в этой итерации).
- Грабля: `git commit -m` с кавычками в PowerShell 5.1 → `git commit -F <файл>`.
- HARD RULE: test-проекты не удалять, incremental numbering.

## Релевантный контекст

Файлы для прочтения перед началом:

- [дискуссия #14](../../discussions/archive/14-bug-029-base-overwrite-как-сохранять-cus/discussion.md) — полный разбор + Decision (три инварианта, форма ledger, state machine legacy)
- [BUG-029](../../bug-reports/029-base-section-overwrite-loses-custom-code.md) — переформулированный баг, три режима отказа
- `src/features/generation/generators/generation_service.ts` — обе стратегии, `Promise.all`, `_mergeBaseContent`
- `src/features/generation/generators/marker_analyzer.ts` — manifest/dictionaries/flags строки (референс для будущей `ownership:`)
- `CLAUDE.md` → DoD, «Что НЕ генерируется автоматически»

## План тестирования

Unit на MockFileSystem (`src/test/mocks/mock_file_system.ts`) — все пункты критериев;
E2E на свежем `t<N>`: двойной regen без правок (молча) и с ручной правкой (conflict).
Гейт: checks профиля ts-generator + `codegen verify` на тестовом проекте.

## Результаты

- Двухфазный plan/apply + ledger-модуль + флаг подтверждения.
- Тесты по всем критериям.
- BUG-029 → Resolved (первый deliverable), с явной пометкой что миграция 65 шаблонов и
  ownership-директива — следующие этапы.
- report.md с реальными CLI-выводами.
