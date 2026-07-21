#!/usr/bin/env python3
"""
Discussion CLI - Unified tool for managing discussions

Folder-per-discussion model:
    active/{id}-{topic}/
        discussion.md          # main
        discussion_p2.md       # continuation of main
        roadmap.md             # spawned child (one-off)
        tasks.md               # spawned child
        roadmap_p2.md          # continuation of spawned child

Usage:
    python discuss.py new "Question text"          Create new discussion
    python discuss.py new --empty "Topic"          Create empty
    python discuss.py spawn 5 roadmap              Spawn child "roadmap" under #5
    python discuss.py spawn 5 tasks                Spawn child "tasks" under #5
    python discuss.py continue 5                   Continue main discussion.md
    python discuss.py continue 5 roadmap           Continue spawned roadmap.md
    python discuss.py close 5                      Archive whole folder of #5
    python discuss.py list                         Show active discussions
    python discuss.py migrate                      Convert flat layout -> folders
"""

import os
import sys
import shutil
import datetime
import argparse
import re

# Структура v2: скрипт и шаблоны/доки дискуссий — в ai/core/discussions (upstream-owned),
# контент дискуссий (active/archive/prompts) — в ai/project/discussions (project-owned).
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))          # ai/core/discussions/scripts
CORE_DISCUSSIONS = os.path.dirname(SCRIPT_DIR)                    # ai/core/discussions
CORE_DIR = os.path.dirname(CORE_DISCUSSIONS)                      # ai/core
AI_ROOT = os.path.dirname(CORE_DIR)                              # ai/
PROJECT_DISCUSSIONS = os.path.join(AI_ROOT, "project", "discussions")  # ai/project/discussions

# --- Контент (project-owned) ---
ACTIVE_DIR = os.path.join(PROJECT_DISCUSSIONS, "active")
ARCHIVE_DIR = os.path.join(PROJECT_DISCUSSIONS, "archive")
PROMPTS_DIR = os.path.join(PROJECT_DISCUSSIONS, "prompts")
SPAWN_PROMPTS_DIR = os.path.join(PROJECT_DISCUSSIONS, "spawn_prompts")

# --- Шаблоны и документация протокола (upstream-owned) ---
TEMPLATE_FILE = os.path.join(CORE_DISCUSSIONS, "_template.md")
CONTINUE_TEMPLATE_FILE = os.path.join(CORE_DISCUSSIONS, "_template_continue.md")
SPAWN_TEMPLATE_FILE = os.path.join(CORE_DISCUSSIONS, "_template_spawn.md")
PROMPT_TEMPLATE_FILE = os.path.join(CORE_DISCUSSIONS, "_template_prompt.md")
PROTOCOL_FILE = os.path.join(CORE_DISCUSSIONS, "docs", "MULTI_AGENT_PROTOCOL.md")
EXAMPLE_FILE = os.path.join(CORE_DISCUSSIONS, "docs", "EXAMPLE.md")


# ---------- helpers ----------

def sanitize_topic(topic):
    safe = re.sub(r'[^\w\s-]', '', topic.lower())
    safe = re.sub(r'[\s_]+', '-', safe)
    return safe[:40].strip('-')


def list_discussion_folders(root):
    if not os.path.exists(root):
        return []
    return [d for d in os.listdir(root)
            if os.path.isdir(os.path.join(root, d)) and re.match(r'^\d+-', d)]


def get_next_id():
    ids = []
    for root in (ACTIVE_DIR, ARCHIVE_DIR):
        for d in list_discussion_folders(root):
            match = re.match(r'^(\d+)-', d)
            if match:
                ids.append(int(match.group(1)))
    return (max(ids) + 1) if ids else 1


def find_active_folder(disc_id):
    for d in list_discussion_folders(ACTIVE_DIR):
        if re.match(rf'^{disc_id}-', d):
            return os.path.join(ACTIVE_DIR, d)
    return None


def folder_topic(folder_name):
    match = re.match(r'^\d+-(.+)$', folder_name)
    return match.group(1) if match else folder_name


def next_part_number(folder_path, kind):
    """Find next _pN for given kind ('discussion', 'roadmap', ...)"""
    if not os.path.exists(folder_path):
        return 2
    pattern = re.compile(rf'^{re.escape(kind)}(?:_p(\d+))?\.md$')
    max_part = 1
    for f in os.listdir(folder_path):
        match = pattern.match(f)
        if match:
            part = int(match.group(1)) if match.group(1) else 1
            max_part = max(max_part, part)
    return max_part + 1


def file_exists_in_folder(folder_path, kind):
    return os.path.exists(os.path.join(folder_path, f"{kind}.md"))


# ---------- template loaders ----------

def _ensure_default(path, default):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(default)
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def load_template():
    default = """# Discussion

**ID:** {ID}
**Started:** {DATE}
**Status:** 🟡 Active
**Language:** Russian

---

## User

{QUESTION}
"""
    return _ensure_default(TEMPLATE_FILE, default)


def load_continue_template():
    default = """# Discussion (Part {PART})

**ID:** {ID}
**Started:** {DATE}
**Status:** 🟡 Active
**Continues:** [[{PREV_LINK}]]
**Language:** Russian

---

Это продолжение обсуждения {PREV_LINK}, если ты в ней не участвовал — ознакомься с ней.

## User

[Продолжение обсуждения]
"""
    return _ensure_default(CONTINUE_TEMPLATE_FILE, default)


def load_spawn_template():
    default = """# Discussion: {KIND_TITLE}

**ID:** {ID}
**Started:** {DATE}
**Status:** 🟡 Active
**Type:** {KIND}
**Spawned from:** [[{PARENT_LINK}|{PARENT_TOPIC}]]
**Language:** Russian

---

## Context (from parent discussion #{PARENT_ID})

### Decision
{PARENT_DECISION}

### Summary
{PARENT_SUMMARY}

---

## User

{SPAWN_QUESTION}
"""
    return _ensure_default(SPAWN_TEMPLATE_FILE, default)


def load_spawn_question(kind):
    """Load user question for a spawn kind from spawn_prompts/{kind}.md."""
    os.makedirs(SPAWN_PROMPTS_DIR, exist_ok=True)
    path = os.path.join(SPAWN_PROMPTS_DIR, f"{kind}.md")

    defaults = {
        "roadmap": (
            "Как итоги родительской дискуссии должны лечь в `ai/docs/roadmap.md`?\n\n"
            "Обсудите:\n"
            "- Какие фазы добавляются / изменяются / удаляются\n"
            "- Пересмотр приоритетов и порядка\n"
            "- Зависимости между фазами\n"
            "- Какие риски проявились по итогам родительского решения\n"
        ),
        "tasks": (
            "Какие задачи нужно завести по итогам родительской дискуссии?\n\n"
            "Декомпозируйте решение в конкретные TASK-XXX. Для каждой:\n"
            "- Название и краткая цель\n"
            "- Scope: что входит, что нет\n"
            "- Зависимости от других задач\n"
            "- Предлагаемый порядок выполнения\n"
            "- Критерии приёмки (draft)\n"
        ),
    }

    if not os.path.exists(path):
        if kind in defaults:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(defaults[kind])
        else:
            return None

    with open(path, 'r', encoding='utf-8') as f:
        return f.read().strip()


def available_spawn_kinds():
    os.makedirs(SPAWN_PROMPTS_DIR, exist_ok=True)
    # trigger default creation
    load_spawn_question("roadmap")
    load_spawn_question("tasks")
    return sorted([
        f[:-3] for f in os.listdir(SPAWN_PROMPTS_DIR)
        if f.endswith('.md') and not f.startswith('_')
    ])


def load_prompt_template():
    agents = ["Gemini", "Claude", "GPT"]
    template_body = (
        "Тебе нужно поучаствовать в обсуждении вопроса\n"
        "- дискуссия проходит в файле {DISCUSSION_FILE}.\n"
        "- инструкция для общения находится в файле {PROTOCOL_FILE}.\n"
        "- твой псевдоним - {AGENT_NAME}.\n"
    )
    if os.path.exists(PROMPT_TEMPLATE_FILE):
        with open(PROMPT_TEMPLATE_FILE, 'r', encoding='utf-8') as f:
            content = f.read()
        if content.startswith('---'):
            parts = content.split('---', 2)
            if len(parts) >= 3:
                frontmatter = parts[1].strip()
                template_body = parts[2].strip()
                for line in frontmatter.split('\n'):
                    if line.startswith('agents:'):
                        agents_str = line.replace('agents:', '').strip()
                        agents = [a.strip().title() for a in agents_str.split(',')]
    return agents, template_body


# ---------- content extraction ----------

def _extract_section(content, name):
    match = re.search(
        rf'##\s+{name}\s*\n(.*?)(?=\n##\s|\Z)',
        content,
        re.DOTALL
    )
    return match.group(1).strip() if match else None


def extract_decision_from_content(content):
    return _extract_section(content, "Decision")


def extract_summary_from_content(content):
    return _extract_section(content, "Summary")


# ---------- prompts file ----------

def generate_prompts_file(disc_id, discussion_filepath, kind=None):
    agents, template_body = load_prompt_template()
    os.makedirs(PROMPTS_DIR, exist_ok=True)

    if kind and kind != "discussion":
        prompts_filename = f"{disc_id}-{kind}-first-msg-to-agents.md"
    else:
        prompts_filename = f"{disc_id}-first-msg-to-agents.md"
    prompts_filepath = os.path.join(PROMPTS_DIR, prompts_filename)

    lines = []
    for agent in agents:
        prompt = template_body
        prompt = prompt.replace("{DISCUSSION_FILE}", discussion_filepath)
        prompt = prompt.replace("{PROTOCOL_FILE}", PROTOCOL_FILE)
        prompt = prompt.replace("{EXAMPLE_FILE}", EXAMPLE_FILE)
        prompt = prompt.replace("{AGENT_NAME}", agent)
        lines.append(prompt)

    with open(prompts_filepath, 'w', encoding='utf-8') as f:
        f.write("\n---\n\n".join(lines))
    return prompts_filepath


# ---------- commands ----------

def cmd_new(args):
    disc_id = get_next_id()
    today = datetime.date.today().isoformat()

    if args.empty:
        topic = args.text if args.text else input("Название темы: ").strip()
        question = ""
    else:
        question = args.text if args.text else input("Вопрос: ").strip()
        topic = sanitize_topic(question) if question else f"discussion-{disc_id}"

    folder_name = f"{disc_id}-{topic}"
    folder_path = os.path.join(ACTIVE_DIR, folder_name)
    os.makedirs(folder_path, exist_ok=True)

    filepath = os.path.join(folder_path, "discussion.md")

    template = load_template()
    content = (template
               .replace("{ID}", str(disc_id))
               .replace("{DATE}", today)
               .replace("{QUESTION}", question))

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    prompts_path = generate_prompts_file(disc_id, filepath)

    print(f"✓ Создано: {filepath}")
    print(f"✓ Промпты: {prompts_path}")
    if question:
        print("📋 Вопрос записан. Скопируй промпты для агентов.")
    else:
        print("📋 Открой файл и напиши вопрос под ## User")


def cmd_spawn(args):
    parent_id = args.parent_id
    kind = args.kind.lower()

    folder = find_active_folder(parent_id)
    if not folder:
        print(f"Ошибка: активная дискуссия #{parent_id} не найдена")
        return

    main_file = os.path.join(folder, "discussion.md")
    if not os.path.exists(main_file):
        print(f"Ошибка: {main_file} не найдено")
        return

    if file_exists_in_folder(folder, kind):
        print(f"Ошибка: {kind}.md уже существует. Используй `continue {parent_id} {kind}` для продолжения.")
        return

    spawn_question = load_spawn_question(kind)
    if spawn_question is None:
        kinds = available_spawn_kinds()
        print(f"Ошибка: неизвестный тип '{kind}'. Доступные: {', '.join(kinds)}")
        print(f"Чтобы добавить новый тип — создай {SPAWN_PROMPTS_DIR}/{kind}.md с текстом вопроса.")
        return

    with open(main_file, 'r', encoding='utf-8') as f:
        main_content = f.read()

    decision = extract_decision_from_content(main_content) or "[Решение ещё не зафиксировано в родительской дискуссии]"
    summary = extract_summary_from_content(main_content) or "[Резюме ещё не зафиксировано в родительской дискуссии]"

    folder_name = os.path.basename(folder)
    parent_topic = folder_topic(folder_name)
    today = datetime.date.today().isoformat()
    # Obsidian link target (file name without .md) — relative within vault
    parent_link = f"{folder_name}/discussion"

    template = load_spawn_template()
    content = (template
               .replace("{ID}", str(parent_id))
               .replace("{DATE}", today)
               .replace("{KIND}", kind)
               .replace("{KIND_TITLE}", kind.title())
               .replace("{PARENT_ID}", str(parent_id))
               .replace("{PARENT_LINK}", parent_link)
               .replace("{PARENT_TOPIC}", parent_topic.replace('-', ' '))
               .replace("{PARENT_DECISION}", decision)
               .replace("{PARENT_SUMMARY}", summary)
               .replace("{SPAWN_QUESTION}", spawn_question))

    filepath = os.path.join(folder, f"{kind}.md")
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    prompts_path = generate_prompts_file(parent_id, filepath, kind=kind)

    print(f"✓ Создана дочерняя дискуссия: {filepath}")
    print(f"✓ Промпты: {prompts_path}")
    print(f"📋 Контекст из #{parent_id} (Decision/Summary) подставлен автоматически.")


def cmd_continue(args):
    disc_id = args.id
    kind = args.kind.lower() if args.kind else "discussion"

    folder = find_active_folder(disc_id)
    if not folder:
        print(f"Ошибка: активная дискуссия #{disc_id} не найдена")
        return

    base_file = os.path.join(folder, f"{kind}.md")
    if not os.path.exists(base_file):
        print(f"Ошибка: {kind}.md не существует в #{disc_id}")
        return

    part = next_part_number(folder, kind)
    today = datetime.date.today().isoformat()

    new_filename = f"{kind}_p{part}.md"
    new_filepath = os.path.join(folder, new_filename)

    folder_name = os.path.basename(folder)
    prev_name = f"{kind}_p{part-1}" if part > 2 else kind
    prev_link = f"{folder_name}/{prev_name}|Part {part-1}"

    template = load_continue_template()
    content = (template
               .replace("{ID}", str(disc_id))
               .replace("{DATE}", today)
               .replace("{PART}", str(part))
               .replace("{PREV_LINK}", prev_link))

    with open(new_filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    prompts_path = generate_prompts_file(disc_id, new_filepath, kind=f"{kind}-p{part}")

    print(f"✓ Создано продолжение: {new_filepath}")
    print(f"✓ Промпты: {prompts_path}")


def cmd_close(args):
    disc_id = args.id

    folder = find_active_folder(disc_id)
    if not folder:
        print(f"Ошибка: активная дискуссия #{disc_id} не найдена")
        return

    # Update status in every .md file inside folder
    for f in os.listdir(folder):
        if not f.endswith('.md'):
            continue
        fp = os.path.join(folder, f)
        try:
            with open(fp, 'r', encoding='utf-8') as fh:
                content = fh.read()
            if "🟡 Active" in content:
                content = content.replace("🟡 Active", "✅ Closed")
                with open(fp, 'w', encoding='utf-8') as fh:
                    fh.write(content)
        except Exception as e:
            print(f"Ошибка обновления статуса {f}: {e}")

    # Optional ADR generation from main discussion
    main_file = os.path.join(folder, "discussion.md")
    if os.path.exists(main_file):
        with open(main_file, 'r', encoding='utf-8') as fh:
            main_content = fh.read()
        decision = extract_decision_from_content(main_content)
        summary = extract_summary_from_content(main_content)
        if decision and '[TBD]' not in decision:
            ai_docs_dir = os.path.join(AI_ROOT, 'project', 'docs', 'decisions')
            if os.path.exists(ai_docs_dir):
                topic = folder_topic(os.path.basename(folder))
                adr_path = generate_adr(disc_id, topic, decision, summary, ai_docs_dir)
                print(f"✓ ADR создан: {adr_path}")

    # Move folder active -> archive
    os.makedirs(ARCHIVE_DIR, exist_ok=True)
    dst = os.path.join(ARCHIVE_DIR, os.path.basename(folder))
    if os.path.exists(dst):
        print(f"Ошибка: {dst} уже существует, ручная проверка")
        return
    shutil.move(folder, dst)
    print(f"✓ Закрыто и архивировано: {os.path.basename(folder)} -> archive/")


def generate_adr(disc_id, topic, decision_text, summary_text, adr_dir):
    existing = [f for f in os.listdir(adr_dir) if f.lower().startswith('adr-') and f.endswith('.md')]
    adr_nums = []
    for f in existing:
        match = re.match(r'[aA][dD][rR]-(\d+)', f)
        if match:
            adr_nums.append(int(match.group(1)))
    next_num = max(adr_nums) + 1 if adr_nums else 1
    if next_num == 1 and any('template' in f.lower() for f in existing):
        next_num = 2

    adr_filename = f"adr-{next_num:04d}-{topic}.md"
    adr_path = os.path.join(adr_dir, adr_filename)
    today = datetime.date.today().isoformat()

    adr_content = f"""# ADR-{next_num:04d}: {topic.replace('-', ' ').title()}

**Date:** {today}
**Source:** Discussion #{disc_id}

## Context

{summary_text if summary_text else '[From discussion #' + str(disc_id) + ']'}

## Decision

{decision_text}

## Consequences

- [TODO: Document consequences]
"""
    with open(adr_path, 'w', encoding='utf-8') as fh:
        fh.write(adr_content)
    return adr_path


def cmd_list(args):
    folders = sorted(list_discussion_folders(ACTIVE_DIR),
                     key=lambda d: int(re.match(r'^(\d+)-', d).group(1)))
    if not folders:
        print("Нет активных обсуждений")
        return

    print("📋 Активные обсуждения:\n")
    for d in folders:
        match = re.match(r'^(\d+)-(.+)$', d)
        disc_id = match.group(1)
        topic = match.group(2).replace('-', ' ')
        folder_path = os.path.join(ACTIVE_DIR, d)
        files = sorted(f[:-3] for f in os.listdir(folder_path) if f.endswith('.md'))
        kinds = ", ".join(files) if files else "(пусто)"
        print(f"  {disc_id}. {topic}")
        print(f"     [{kinds}]")


def cmd_migrate(args):
    """Convert flat layout to folder-per-discussion."""
    moved = 0

    # ACTIVE: flat files -> folder/discussion.md
    if os.path.exists(ACTIVE_DIR):
        for f in list(os.listdir(ACTIVE_DIR)):
            src = os.path.join(ACTIVE_DIR, f)
            if not (os.path.isfile(src) and f.endswith('.md')):
                continue
            match = re.match(r'^(\d+)-(.+?)(_p(\d+))?\.md$', f)
            if not match:
                continue
            disc_id, topic = match.group(1), match.group(2)
            part = match.group(4)
            folder_path = os.path.join(ACTIVE_DIR, f"{disc_id}-{topic}")
            os.makedirs(folder_path, exist_ok=True)
            dst_name = "discussion.md" if not part else f"discussion_p{part}.md"
            dst = os.path.join(folder_path, dst_name)
            if os.path.exists(dst):
                print(f"⚠ пропуск: {dst} уже существует")
                continue
            shutil.move(src, dst)
            print(f"✓ active: {f} -> {disc_id}-{topic}/{dst_name}")
            moved += 1

    # ARCHIVE: folders with inner files named {id}-{topic}.md -> discussion.md
    if os.path.exists(ARCHIVE_DIR):
        for d in list_discussion_folders(ARCHIVE_DIR):
            folder_path = os.path.join(ARCHIVE_DIR, d)
            for f in list(os.listdir(folder_path)):
                if not f.endswith('.md'):
                    continue
                if f in ("discussion.md",) or re.match(r'^(discussion|roadmap|tasks)(_p\d+)?\.md$', f):
                    continue
                match = re.match(r'^(\d+)-(.+?)(_p(\d+))?\.md$', f)
                if not match:
                    continue
                part = match.group(4)
                src = os.path.join(folder_path, f)
                dst_name = "discussion.md" if not part else f"discussion_p{part}.md"
                dst = os.path.join(folder_path, dst_name)
                if os.path.exists(dst):
                    print(f"⚠ пропуск: {dst} уже существует")
                    continue
                shutil.move(src, dst)
                print(f"✓ archive: {d}/{f} -> {dst_name}")
                moved += 1

    print(f"\nГотово. Перемещено файлов: {moved}")


def main():
    parser = argparse.ArgumentParser(description="Discussion CLI")
    subparsers = parser.add_subparsers(dest='command', help='Commands')

    p_new = subparsers.add_parser('new', help='Create new discussion')
    p_new.add_argument('text', nargs='?', help='Question or topic')
    p_new.add_argument('--empty', action='store_true', help='Create without question')
    p_new.set_defaults(func=cmd_new)

    p_spawn = subparsers.add_parser('spawn', help='Spawn child discussion under a parent')
    p_spawn.add_argument('parent_id', type=int, help='Parent discussion ID')
    p_spawn.add_argument('kind', help='Child kind (roadmap, tasks, ...)')
    p_spawn.set_defaults(func=cmd_spawn)

    p_continue = subparsers.add_parser('continue', help='Create continuation _p<N>')
    p_continue.add_argument('id', type=int, help='Discussion ID')
    p_continue.add_argument('kind', nargs='?', default=None,
                            help='File kind to continue (default: discussion). '
                                 'Use roadmap/tasks to continue spawned children.')
    p_continue.set_defaults(func=cmd_continue)

    p_close = subparsers.add_parser('close', help='Close and archive')
    p_close.add_argument('id', type=int, help='Discussion ID')
    p_close.set_defaults(func=cmd_close)

    p_list = subparsers.add_parser('list', help='List active discussions')
    p_list.set_defaults(func=cmd_list)

    p_migrate = subparsers.add_parser('migrate', help='Convert flat layout to folders')
    p_migrate.set_defaults(func=cmd_migrate)

    args = parser.parse_args()
    if args.command:
        args.func(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
