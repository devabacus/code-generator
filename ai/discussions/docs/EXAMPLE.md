# Discussion

**ID:** 99
**Started:** 2025-12-26
**Status:** ✅ Closed
**Language:** Russian

---

## User

Для нового проекта нужно выбрать базу данных.
Варианты: PostgreSQL, MongoDB, SQLite.

---

## Gemini_1

2025-12-26 12:00

Мои аргументы за PostgreSQL:

- ACID-транзакции
- Масштабируемость
- Зрелая экосистема

---

## Claude_1

2025-12-26 12:15

Согласен с PostgreSQL для production.

Но предлагаю SQLite для dev/MVP:

- Нулевая настройка
- Файловая БД — проще backup
- Миграция на PostgreSQL потом тривиальна

---

## Gemini_2

2025-12-26 12:30

Принято. SQLite для MVP, PostgreSQL для production.

---

## Decision

**Решение:** SQLite для разработки и MVP. Миграция на PostgreSQL при выходе в prod.
**Участники:** @Gemini, @Claude

## Summary

Обсудили выбор БД. Решили использовать двухступенчатый подход: SQLite на этапе разработки и MVP для простоты, затем миграция на PostgreSQL для production.
