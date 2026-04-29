#!/usr/bin/env python3
"""
Discussion CLI - Unified tool for managing discussions
Usage:
    python discuss.py new "Question text"     # Create with question
    python discuss.py new --empty "Topic"     # Create empty
    python discuss.py close 5                 # Archive discussion #5
    python discuss.py continue 5              # Create part 2 of #5
    python discuss.py list                    # Show active discussions
"""

import os
import sys
import datetime
import argparse
import re

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DISCUSSIONS_ROOT = os.path.dirname(SCRIPT_DIR)
ACTIVE_DIR = os.path.join(DISCUSSIONS_ROOT, "active")
ARCHIVE_DIR = os.path.join(DISCUSSIONS_ROOT, "archive")
PROMPTS_DIR = os.path.join(DISCUSSIONS_ROOT, "prompts")
TEMPLATE_FILE = os.path.join(DISCUSSIONS_ROOT, "_template.md")
CONTINUE_TEMPLATE_FILE = os.path.join(DISCUSSIONS_ROOT, "_template_continue.md")
PROMPT_TEMPLATE_FILE = os.path.join(DISCUSSIONS_ROOT, "_template_prompt.md")
PROTOCOL_FILE = os.path.join(DISCUSSIONS_ROOT, "docs", "MULTI_AGENT_PROTOCOL.md")
EXAMPLE_FILE = os.path.join(DISCUSSIONS_ROOT, "docs", "EXAMPLE.md")


def get_all_discussion_files():
    """Get all discussion files from active and archive."""
    files = []
    if os.path.exists(ACTIVE_DIR):
        files.extend([f for f in os.listdir(ACTIVE_DIR) if f.endswith('.md')])
    if os.path.exists(ARCHIVE_DIR):
        for item in os.listdir(ARCHIVE_DIR):
            item_path = os.path.join(ARCHIVE_DIR, item)
            if os.path.isdir(item_path):
                files.extend([f for f in os.listdir(item_path) if f.endswith('.md')])
    return files


def get_next_id():
    """Find next available discussion ID (1, 2, 3...)."""
    files = get_all_discussion_files()
    max_id = 0
    for f in files:
        match = re.match(r'^(\d+)-', f)
        if match:
            max_id = max(max_id, int(match.group(1)))
    return max_id + 1


def get_part_number(disc_id):
    """Get next part number for a discussion."""
    if not os.path.exists(ACTIVE_DIR):
        return 2
    
    pattern = re.compile(rf'^{disc_id}-.*?(_p(\d+))?\.md$')
    max_part = 1
    
    for f in os.listdir(ACTIVE_DIR):
        match = pattern.match(f)
        if match:
            if match.group(2):
                max_part = max(max_part, int(match.group(2)))
            else:
                max_part = max(max_part, 1)
    
    return max_part + 1


def sanitize_topic(topic):
    """Convert topic to filename-safe string."""
    # Replace spaces and special chars with hyphens
    safe = re.sub(r'[^\w\s-]', '', topic.lower())
    safe = re.sub(r'[\s_]+', '-', safe)
    return safe[:40].strip('-')


def load_template():
    """Load template from file. If missing, create default."""
    if not os.path.exists(TEMPLATE_FILE):
        default_template = """# Discussion

**ID:** {ID}
**Started:** {DATE}
**Status:** 🟡 Active
**Language:** Russian

> [!important] ВНИМАНИЕ: ОБЯЗАТЕЛЬНО К ПРОЧТЕНИЮ
> Перед началом работы ты **ОБЯЗАН** прочитать протокол.
> Это критически важно для соблюдения формата общения.
> [[docs/MULTI_AGENT_PROTOCOL|👉 ЧИТАТЬ ПРОТОКОЛ ЗДЕСЬ]]

---

## User

{QUESTION}
"""
        with open(TEMPLATE_FILE, 'w', encoding='utf-8') as f:
            f.write(default_template)

    with open(TEMPLATE_FILE, 'r', encoding='utf-8') as f:
        return f.read()


def load_continue_template():
    """Load continue template from file. If missing, create default."""
    if not os.path.exists(CONTINUE_TEMPLATE_FILE):
        default_template = """# Discussion (Part {PART})

**ID:** {ID}
**Started:** {DATE}
**Status:** 🟡 Active
**Continues:** [[{PREV_LINK}]]
**Language:** Russian

> [!important] ВНИМАНИЕ: ОБЯЗАТЕЛЬНО К ПРОЧТЕНИЮ
> Перед началом работы ты **ОБЯЗАН** прочитать протокол.
> Это критически важно для соблюдения формата общения.
> [[docs/MULTI_AGENT_PROTOCOL|👉 ЧИТАТЬ ПРОТОКОЛ ЗДЕСЬ]]

---

## User

[Продолжение обсуждения]
"""
        with open(CONTINUE_TEMPLATE_FILE, 'w', encoding='utf-8') as f:
            f.write(default_template)

    with open(CONTINUE_TEMPLATE_FILE, 'r', encoding='utf-8') as f:
        return f.read()


def load_prompt_template():
    """Load prompt template and parse agents from frontmatter."""
    agents = ["Gemini", "Claude", "GPT"]  # defaults
    template_body = """Тебе нужно поучаствовать в обсуждении вопроса 
- дискуссия проходит в файле {DISCUSSION_FILE}.
- инструкция для общения находится в файле {PROTOCOL_FILE}.
- твой псевдоним - {AGENT_NAME}.
"""
    
    if os.path.exists(PROMPT_TEMPLATE_FILE):
        with open(PROMPT_TEMPLATE_FILE, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Parse frontmatter
        if content.startswith('---'):
            parts = content.split('---', 2)
            if len(parts) >= 3:
                frontmatter = parts[1].strip()
                template_body = parts[2].strip()
                
                # Extract agents
                for line in frontmatter.split('\n'):
                    if line.startswith('agents:'):
                        agents_str = line.replace('agents:', '').strip()
                        agents = [a.strip().title() for a in agents_str.split(',')]
    
    return agents, template_body


def generate_prompts_file(disc_id, discussion_filepath):
    """Generate prompts file for all agents."""
    agents, template_body = load_prompt_template()
    
    os.makedirs(PROMPTS_DIR, exist_ok=True)
    
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
    
    content = "\n---\n\n".join(lines)
    
    with open(prompts_filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    return prompts_filepath


def cmd_new(args):
    """Create a new discussion."""
    disc_id = get_next_id()
    today = datetime.date.today().isoformat()
    
    # Handle topic/question
    if args.empty:
        topic = args.text if args.text else input("Название темы: ").strip()
        question = ""
    else:
        question = args.text if args.text else input("Вопрос: ").strip()
        topic = sanitize_topic(question) if question else f"discussion-{disc_id}"
    
    filename = f"{disc_id}-{topic}.md"
    filepath = os.path.join(ACTIVE_DIR, filename)
    
    os.makedirs(ACTIVE_DIR, exist_ok=True)
    
    template = load_template()
    content = template.replace("{ID}", str(disc_id))
    content = content.replace("{DATE}", today)
    content = content.replace("{QUESTION}", question)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    # Generate prompts file
    prompts_path = generate_prompts_file(disc_id, filepath)
    
    print(f"✓ Создано: {filepath}")
    print(f"✓ Промпты: {prompts_path}")
    if question:
        print(f"📋 Вопрос записан. Скопируй промпты для агентов.")
    else:
        print(f"📋 Открой файл и напиши вопрос под ## User")


def extract_decision_from_content(content):
    """Extract Decision section from discussion content."""
    decision_match = re.search(
        r'## Decision\s*\n(.*?)(?=\n## |\Z)',
        content,
        re.DOTALL
    )
    if decision_match:
        return decision_match.group(1).strip()
    return None


def extract_summary_from_content(content):
    """Extract Summary section from discussion content."""
    summary_match = re.search(
        r'## Summary\s*\n(.*?)(?=\n## |\Z)',
        content,
        re.DOTALL
    )
    if summary_match:
        return summary_match.group(1).strip()
    return None


def generate_adr(disc_id, topic, decision_text, summary_text, adr_dir):
    """Generate ADR file from closed discussion."""
    # Find next ADR number
    existing = [f for f in os.listdir(adr_dir) if f.startswith('ADR-') and f.endswith('.md')]
    adr_nums = []
    for f in existing:
        match = re.match(r'ADR-(\d+)', f)
        if match:
            adr_nums.append(int(match.group(1)))
    next_num = max(adr_nums) + 1 if adr_nums else 1
    
    # Skip template
    if next_num == 1 and os.path.exists(os.path.join(adr_dir, 'ADR-0001-template.md')):
        next_num = 2
    
    adr_filename = f"ADR-{next_num:04d}-{topic}.md"
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
    
    with open(adr_path, 'w', encoding='utf-8') as f:
        f.write(adr_content)
    
    return adr_path


def cmd_close(args):
    """Close and archive a discussion."""
    disc_id = args.id
    
    if not os.path.exists(ACTIVE_DIR):
        print(f"Ошибка: папка active/ не найдена")
        return
    
    # Find all matching files
    pattern = re.compile(rf'^{disc_id}-.*\.md$')
    found_files = []
    for f in os.listdir(ACTIVE_DIR):
        if pattern.match(f):
            found_files.append(f)
    
    if not found_files:
        print(f"Ошибка: обсуждение #{disc_id} не найдено")
        return
    
    # ADR generation - find main file (not _p part)
    main_file = None
    topic = None
    for f in found_files:
        if '_p' not in f:
            main_file = f
            match = re.match(rf'^{disc_id}-(.+)\.md$', f)
            if match:
                topic = match.group(1)
            break
    
    if not main_file and found_files:
        main_file = found_files[0]
        match = re.match(rf'^{disc_id}-(.+?)(_p\d+)?\.md$', main_file)
        if match:
            topic = match.group(1)
    
    # Check for Decision section and generate ADR
    if main_file:
        main_path = os.path.join(ACTIVE_DIR, main_file)
        with open(main_path, 'r', encoding='utf-8') as f:
            main_content = f.read()
        
        decision_text = extract_decision_from_content(main_content)
        summary_text = extract_summary_from_content(main_content)
        
        if decision_text and '[TBD]' not in decision_text:
            # Find ADR directory
            ai_docs_dir = os.path.join(os.path.dirname(DISCUSSIONS_ROOT), '_ai', 'docs', 'DECISIONS')
            if os.path.exists(ai_docs_dir):
                adr_path = generate_adr(disc_id, topic or f'discussion-{disc_id}', 
                                       decision_text, summary_text, ai_docs_dir)
                print(f"✓ ADR создан: {adr_path}")
    
    for found in found_files:
        src = os.path.join(ACTIVE_DIR, found)
        
        # Update status in file
        try:
            with open(src, 'r', encoding='utf-8') as f:
                content = f.read()
            
            content = content.replace("🟡 Active", "✅ Closed")
            
            with open(src, 'w', encoding='utf-8') as f:
                f.write(content)
        except Exception as e:
            print(f"Ошибка при обновлении статуса {found}: {e}")
            continue
        
        # Determine destination folder (group by main topic ID and name, ignoring _p part)
        # Assuming format: {ID}-{Topic}[_p{Part}].md
        # We want the folder to be {ID}-{Topic}
        base_name = re.sub(r'(_p\d+)?\.md$', '', found)
        # If it's a part file (has _p), we need to find the base name without _p
        if '_p' in base_name:
             base_name = base_name.split('_p')[0]
             
        dst_dir = os.path.join(ARCHIVE_DIR, base_name)
        os.makedirs(dst_dir, exist_ok=True)
        
        # Keep original filename to avoid collisions and preserve links
        dst = os.path.join(dst_dir, found)
        
        try:
            if os.path.exists(dst):
                os.remove(dst) # Ensure clean move if target exists on windows
            os.rename(src, dst)
            print(f"✓ Закрыто и архивировано: {found} -> {dst_dir}")
        except Exception as e:
            print(f"Ошибка при архивации {found}: {e}")


def cmd_continue(args):
    """Create a continuation file for a discussion."""
    disc_id = args.id
    
    if not os.path.exists(ACTIVE_DIR):
        print(f"Ошибка: папка active/ не найдена")
        return
    
    # Find original file
    pattern = re.compile(rf'^{disc_id}-([^_]+)(\.md|_p\d+\.md)$')
    original = None
    topic = None
    
    for f in os.listdir(ACTIVE_DIR):
        match = pattern.match(f)
        if match and not '_p' in f:
            original = f
            topic = match.group(1)
            break
    
    if not original:
        # Try to find any part
        for f in os.listdir(ACTIVE_DIR):
            if f.startswith(f"{disc_id}-"):
                original = f
                topic = re.sub(r'_p\d+\.md$', '', f.replace(f"{disc_id}-", "")).replace('.md', '')
                break
    
    if not original:
        print(f"Ошибка: обсуждение #{disc_id} не найдено")
        return
    
    part = get_part_number(disc_id)
    today = datetime.date.today().isoformat()
    
    new_filename = f"{disc_id}-{topic}_p{part}.md"
    new_filepath = os.path.join(ACTIVE_DIR, new_filename)
    
    # Create continuation file
    template = load_continue_template()
    prev_link = f"{original.replace('.md', '')}|Part {part-1}"
    
    content = template.replace("{ID}", str(disc_id))
    content = content.replace("{DATE}", today)
    content = content.replace("{PART}", str(part))
    content = content.replace("{PREV_LINK}", prev_link)
    
    with open(new_filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"✓ Создано продолжение: {new_filename}")
    print(f"📋 Ссылка на Part {part-1} добавлена")


def cmd_list(args):
    """List active discussions."""
    if not os.path.exists(ACTIVE_DIR):
        print("Нет активных обсуждений")
        return
    
    files = sorted([f for f in os.listdir(ACTIVE_DIR) if f.endswith('.md')])
    
    if not files:
        print("Нет активных обсуждений")
        return
    
    print("📋 Активные обсуждения:\n")
    for f in files:
        # Extract ID and topic
        match = re.match(r'^(\d+)-(.+?)(_p\d+)?\.md$', f)
        if match:
            disc_id = match.group(1)
            topic = match.group(2).replace('-', ' ')
            part = match.group(3) or ""
            print(f"  {disc_id}. {topic}{part}")


def main():
    parser = argparse.ArgumentParser(description="Discussion CLI")
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # new
    new_parser = subparsers.add_parser('new', help='Create new discussion')
    new_parser.add_argument('text', nargs='?', help='Question or topic')
    new_parser.add_argument('--empty', action='store_true', help='Create without question')
    new_parser.set_defaults(func=cmd_new)
    
    # close
    close_parser = subparsers.add_parser('close', help='Close and archive')
    close_parser.add_argument('id', type=int, help='Discussion ID')
    close_parser.set_defaults(func=cmd_close)
    
    # continue
    continue_parser = subparsers.add_parser('continue', help='Create continuation')
    continue_parser.add_argument('id', type=int, help='Discussion ID')
    continue_parser.set_defaults(func=cmd_continue)
    
    # list
    list_parser = subparsers.add_parser('list', help='List active discussions')
    list_parser.set_defaults(func=cmd_list)
    
    args = parser.parse_args()
    
    if args.command:
        args.func(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
