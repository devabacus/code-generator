# Discussion Workflow

## Quick Start (2 участника)

**1. Создать обсуждение:**

```bash
cd discussions/scripts
python new_discussion.py "Тема"
```

**2. Написать первое сообщение:**

```markdown
## Gemini

Предлагаю использовать X.
```

**3. Вызвать агента:**
Отправь путь к файлу:

```
G:\Projects\ai_team\discussions\active\DISC-001-тема.md
```

**4. Когда агент ответил — вызвать другого.**

**5. Завершить:**

```markdown
**CONSENSUS:** Используем X.
```

---

## Формат сообщения

```markdown
## Agent

Текст.
```

**Если >2 участника** — добавь `**Next:** @Agent`

---

## Завершение

| Результат | Формат                |
| --------- | --------------------- |
| Согласие  | `**CONSENSUS:** итог` |
| Спор      | `**DISPUTE:** @User`  |

---

## Архивация

```bash
python new_discussion.py --archive 1
```
