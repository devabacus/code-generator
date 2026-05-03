# TASK-001: Заполнить базовую документацию

## Ветка

feature/TASK-001-docs

## Цель

Довести до рабочего состояния скелет документации в `ai/docs/`:
- `status.md` — актуальное состояние проекта (фаза, активные задачи, риски)
- `roadmap.md` — фазы разработки и их цели
- `INDEX.md` — короткое описание проекта (защищён — draft, approval by User)
- `architecture.md` — высокоуровневая архитектура (защищён — draft, approval by User)
- `agent_memory.md` — факты и gotchas по проекту для агентов
- `troubleshooting.md` — расширить уже существующим кейсом (TS Server cache) + ссылка на `docs-code-generator/troubleshooting.md`

## Не-цели

- НЕ писать код и НЕ чинить баги (это отдельные задачи TASK-002, TASK-003)
- НЕ трогать `prompts/`, `conventions.md`, `_template/*` (защищены)
- НЕ заполнять `decisions/` (отдельная задача для ADR-0001)

## Scope

Разрешено:
- `ai/docs/status.md`
- `ai/docs/roadmap.md`
- `ai/docs/agent_memory.md`
- `ai/docs/troubleshooting.md`

Draft (требуют approval User перед финальным сохранением):
- `ai/docs/INDEX.md`
- `ai/docs/architecture.md`

Запрещено:
- любой код в `src/`
- `ai/prompts/`, `ai/docs/conventions.md`, `ai/tasks/_template/`
- `ai/bug-reports/` (readonly для этой задачи)

## Критерии приёмки

- [ ] `status.md` — заполнены: фаза, активные задачи (TASK-001 сам про себя), риски (2 открытых бага), следующий фокус
- [ ] `roadmap.md` — минимум 3 фазы со списком задач и критериями завершения
- [ ] `agent_memory.md` — записаны минимум 5 ключевых фактов о проекте (шаблон, CLI, manifest, sync-паттерн, platform-специфика Windows)
- [ ] `troubleshooting.md` — минимум 1 решённая проблема (TS Server cache) + ссылка на `docs-code-generator/troubleshooting.md`
- [ ] Draft `INDEX.md` и `architecture.md` показаны User в `report.md` — НЕ коммитятся без approval
- [ ] `report.md` написан
- [ ] Все изменения в одной ветке `feature/TASK-001-docs`

## Заметки по реализации

- Проект уже содержит `docs-code-generator/` со старой документацией (`progress.md`, `bugs-and-tasks.md`, `implementation-plan.md`, `project-info-before-refactoring.md`, `refactor-instructions.md`, `troubleshooting.md`). Использовать как source of truth для `agent_memory.md`.
- Память агента Claude Code в `C:\Users\User\.claude\projects\g--Projects-vs-code-extensions-code-generator\memory\` содержит 3 релевантных факта — перенести в `agent_memory.md`, где уместно.
- Баг-репорты: BUG-001 (Ref disposed, High), BUG-002 (camelCase, Medium) — упомянуть в status.md как открытые риски.
- Даты: сегодня 2026-04-18.

## Релевантный контекст

Файлы для прочтения перед началом:

- `ai/prompts/teamlead.prompt.md` — регламент работы TeamLead
- `ai/docs/workflow.md` — жизненный цикл задачи
- `ai/docs/conventions.md` — Conventional Commits, approval delegation
- `docs-code-generator/progress.md` — история рефакторинга (source для status.md)
- `docs-code-generator/project-info-before-refactoring.md` — краткое описание архитектуры
- `docs-code-generator/bugs-and-tasks.md` — источник задач (TASK-1..3 оттуда)
- `ai/bug-reports/001-state-provider-ref-disposed.md`
- `ai/bug-reports/002-file-names-camelcase.md`
- `package.json` — команды, bin, main, версия

## План тестирования

Проверка вручную:
1. Открыть `status.md` — видно текущее состояние
2. Открыть `roadmap.md` — понятны фазы
3. Открыть `agent_memory.md` — есть минимум 5 фактов
4. Открыть `troubleshooting.md` — записан хотя бы TS Server cache issue
5. `report.md` содержит:
   - список изменённых файлов
   - черновики INDEX.md / architecture.md для утверждения
   - что обновлено и где

## Результаты

Ожидаемые файлы:
- ✏️ `ai/docs/status.md`
- ✏️ `ai/docs/roadmap.md`
- ➕ `ai/docs/agent_memory.md` (создать новый)
- ✏️ `ai/docs/troubleshooting.md`
- 📄 `tasks/active/TASK-001-заполнить-базовую-документацию/report.md`
- 📄 Draft `ai/docs/INDEX.md` и `ai/docs/architecture.md` в `report.md` (как текстовые блоки)

## Приоритет

Medium — предпосылка для корректной работы остальных задач, но сами баг-фиксы важнее.
