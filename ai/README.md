# AI Team Framework

Структура для организации командной разработки с AI-агентами.

## 🚀 Быстрый старт

→ [guides/user_guide.md](guides/user_guide.md)

## 📋 Что это

Фреймворк для работы с несколькими AI-агентами:
- **Strategy Agent** — консультирует по архитектуре
- **TeamLead Agent** — управляет задачами
- **Executor Agent** — выполняет код

Принцип: **Репозиторий > Чат**. Все решения фиксируются в файлах.

## 📁 Структура

```
prompts/      → Промпты для агентов
docs/          → Документация и правила
tasks/         → Система задач
```

## 📖 Документация

| Файл | Описание |
|------|----------|
| [workflow.md](docs/workflow.md) | Схема работы |
| [conventions.md](docs/conventions.md) | Правила |
| [troubleshooting.md](docs/troubleshooting.md) | Решение проблем |

## 🏁 Как использовать

1. Скопируй структуру в свой проект
2. Читай `guides/user_guide.md`
3. Начни с Strategy Agent для нового проекта

---

> **Repository is the source of truth. Chats are disposable.**
