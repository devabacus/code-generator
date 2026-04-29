# Git Worktree для AI Team Framework

Инструкция по настройке worktree для работы с несколькими агентами.

---

## 🎯 Зачем

- Каждый агент в своём окне VS Code
- Изоляция веток — агенты не мешают друг другу
- Пространственная память: "левый монитор = Executor"

---

## 📋 Начальная настройка

```bash
# 1. Перейти в основной проект
cd G:\YourProject

# 2. Создать ветку dev (если нет)
git checkout -b dev
git push -u origin dev

# 3. Создать worktree для Executor
git worktree add -b feature/setup ../YourProject-executor dev
```

**Результат:**

```
YourProject/          → dev (TeamLead + Strategy)
YourProject-executor/ → feature/* (Executor)
```

---

## 🔄 Ежедневный Workflow

### TeamLead создаёт задачу

```bash
# В основной папке (dev)
# Обновляет docs/status.md, tasks/active/TASK-XXX/
```

### Executor начинает задачу

```bash
cd ../YourProject-executor

# Получить свежий dev
git fetch origin

# Создать feature ветку
git checkout -b feature/TASK-XXX origin/dev

# Работать...
git add .
git commit -m "feat: TASK-XXX description"
```

### Merge после ревью

```bash
# В основной папке (TeamLead/User)
cd ../YourProject
git merge feature/TASK-XXX
git push origin dev

# Удалить ветку
git branch -d feature/TASK-XXX
```

### Executor — следующая задача

```bash
cd ../YourProject-executor
git fetch origin
git checkout -b feature/TASK-YYY origin/dev
```

---

## 📊 Раскладка мониторов

```
┌─────────────────┐  ┌─────────────────┐
│   Монитор 1     │  │   Монитор 2     │
│   VS Code       │  │   VS Code       │
│   MAIN/DEV      │  │   EXECUTOR      │
│   TeamLead      │  │   feature/*     │
└─────────────────┘  └─────────────────┘

┌─────────────────┐  ┌─────────────────┐
│   Монитор 3     │  │   Монитор 4     │
│   Браузер/Доки  │  │   Терминал      │
└─────────────────┘  └─────────────────┘
```

---

## ⚠️ Важные правила

| Правило                                | Причина                                |
| -------------------------------------- | -------------------------------------- |
| Одна ветка = один worktree             | Git не позволит checkout занятой ветки |
| Пушить dev после merge                 | Чтобы `origin/dev` был актуален        |
| Executor создаёт ветки от `origin/dev` | Обходит ограничение worktree           |

---

## 🔧 Команды управления

```bash
# Список worktree
git worktree list

# Удалить worktree
git worktree remove ../YourProject-executor

# Создать новый worktree
git worktree add -b branch-name ../folder-name
```

---

## 🛡️ Безопасность

Worktree изолирует работу, но **не запрещает** переключение на main/dev.

Для полной защиты добавь pre-commit hook:

```bash
#!/bin/bash
# .git/hooks/pre-commit
branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" = "main" ] || [ "$branch" = "dev" ]; then
  echo "❌ Коммит в $branch запрещён! Используй feature ветку."
  exit 1
fi
```
