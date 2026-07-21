# Руководство пользователя: AI-агенты

Полное руководство по работе с системой AI-агентов.

---

## 📋 Первоначальная настройка (v2)

Шаблон разделён на `ai/core/` (upstream-owned, обновляется `sync.py`) и `ai/project/`
(project-owned, наполняешь ты). См. [core/README.md](../README.md).

### Новый проект — через sync.py

```bash
# из шаблон-репо: установить core/ + скелет project/ + template.lock в проект
python ai/core/scripts/sync.py init <путь-к-проекту>/ai --template <путь-к-шаблон-репо>/ai
```

`init` копирует `core/`, создаёт пустой скелет `project/` (docs, tasks, discussions,
profiles) и пишет `ai/template.lock`. Дальше:

1. Создай README.md проекта: `→ [ai/core/docs/INDEX.md](ai/core/docs/INDEX.md) — начни отсюда`
2. Заполни `ai/project/docs/architecture.md`, `status.md`
3. Заполни `ai/project/profile.yaml` (зоны + capability policy — см. `core/docs/profiles.md`)
4. Заполни `ai/project/docs/dev_guide.md` командами для тестов

### Существующий проект (v1 → v2)

Пошаговый гайд миграции: [migration-v1-to-v2.md](migration-v1-to-v2.md).

### Обновление шаблона в проекте

```bash
python ai/core/scripts/sync.py --check <проект>/ai --template <шаблон>/ai   # показать дрейф
python ai/core/scripts/sync.py --apply <проект>/ai --template <шаблон>/ai   # обновить core/ (на task-ветке)
```

**Exit codes `--check`** (контракт для CI/ежемесячного контроля дрейфа):

| Код | Значение |
| --- | --- |
| `0` | синхронизировано — core проекта совпадает с шаблоном |
| `2` | доступно обновление шаблона (upstream add/modify/delete) — инвариант цел, запусти `--apply` |
| `3` | **нарушен инвариант**: локальная правка/добавление/удаление core, несовпадение/повреждение `schema_version`, повреждённый/отсутствующий lock. `apply` заблокирован |

`apply` атомарен (staged-каталог → верификация хэшей → transactional swap, lock пишется
последним через temp+replace): прерывание посреди `apply` не оставляет частично обновлённый
core — повторный `apply` доводит до конца. `template.lock` — JSON (парсится stdlib); старый
YAML-lock мигрируется в JSON при первом `--apply`.

---

## 🎯 Концепция

Система построена на разделении ролей:

- **User (Ты)** — владелец проекта, принимает финальные решения
- **TeamLead Agent** — организует работу, создаёт задачи, ревьюит
- **Executor Agent** — выполняет задачи, пишет код

> **Важно:** Один чат = одна роль. Не смешивай агентов в одном чате.

---

## 💬 Фаза 0: Дискуссия

Перед началом работы часто нужно обсудить архитектуру, стратегию, приоритеты.

```
1. Обсуди с AI архитектуру/стратегию
2. Приняли решения → используй core/prompts/finalize.prompt.md
3. Теперь TeamLead может читать актуальные docs
```

**Пример:**

```
Прочитай core/prompts/finalize.prompt.md

Мы обсудили: переход на PostgreSQL, новая фаза "Миграция".
Обнови docs.
```

---

## 🚀 Запуск агентов

### TeamLead

```
Прочитай core/prompts/teamlead.prompt.md
Затем core/docs/INDEX.md и project/docs/status.md
Предложи первые задачи.
```

### Executor

```
Прочитай core/prompts/executor.prompt.md
Затем project/tasks/active/TASK-XXX/task.md
Начни работу.
```

---

## 🔄 Ежедневный цикл

```
1. TeamLead → читает project/docs/status.md → предлагает задачу
2. Ты → одобряешь
3. TeamLead → создаёт TASK-XXX (new_task.py) в project/tasks/active/
4. Executor → работает в feature branch
5. Executor → пишет report.md
6. TeamLead → ревьюит → показывает тебе
7. Ты → "MERGE OK"
8. Ты → делаешь merge
```

---

## 💡 Ключевые правила

| Правило                     | Почему                             |
| --------------------------- | ---------------------------------- |
| Один чат = одна роль        | Не смешивай TeamLead и Executor    |
| Начинай с "прочитай файл X" | Агент без контекста = галлюцинации |
| Фиксируй решения в репо     | Чат умрёт, репо останется          |
| Executor в feature branch   | Изоляция изменений                 |
| Никаких merge без OK        | Ты владелец                        |

---

## 🚨 Эскалация

```
Executor → TeamLead → Дискуссия → User
```

| Ситуация              | Действие            |
| --------------------- | ------------------- |
| Задача непонятна      | Executor → TeamLead |
| Архитектурное решение | Дискуссия → ADR     |
| Блокирующий вопрос    | → User              |

---

## 🔁 Продолжение работы

### TeamLead (новый чат)

```
Прочитай core/prompts/teamlead.prompt.md

Ты продолжаешь работу предыдущего TeamLead.
Прочитай project/docs/status.md и project/tasks/active/.
Дай статус и следующие шаги.
```

### Executor (новый чат)

```
Прочитай core/prompts/executor.prompt.md

Продолжи работу над TASK-XXX.
Прочитай project/tasks/active/TASK-XXX/task.md
Продолжи с того места где остановился.
```

---

## 📂 Где что искать

| Нужно...              | Смотри...                            |
| --------------------- | ------------------------------------ |
| Структура папок       | `core/guides/folder_structure.md`    |
| Текущее состояние     | `project/docs/status.md`             |
| Задачи в работе       | `project/tasks/active/`              |
| Архитектурные решения | `project/docs/decisions/`            |
| Git Worktree          | `core/guides/worktree_guide.md`      |
| Миграция v1 → v2      | `core/guides/migration-v1-to-v2.md`  |

---

## 🔗 Связанные документы

- [folder_structure.md](folder_structure.md) — Структура папок
- [worktree_guide.md](worktree_guide.md) — Git Worktree
- [../docs/workflow.md](../docs/workflow.md) — Детальный workflow
