#!/usr/bin/env python3
"""
Тест: CLI-скрипты шаблона сами настраивают UTF-8 на stdout/stderr.

Фиксирует ежедневный дефект (TASK-018, п.1 «Цель»; воспроизведён внешним ревью
2026-07-22): без внешнего костыля `PYTHONIOENCODING=utf-8` на Windows-консоли
(системная кодировка cp1251) любой emoji в print роняет процесс:

    UnicodeEncodeError: 'charmap' codec can't encode character '\\u2705'

а кириллица, которая в cp1251 кодируется, уходит в поток НЕ в UTF-8 — потребитель,
читающий вывод как UTF-8, получает мусор. Второй, тихий вариант того же дефекта:
`sys.exit("❌ ...")` не падает, а печатает escape-форму `\\u274c` — вывод «работает»,
но emoji потерян.

Что проверяется (и почему именно так):

  * CLI запускаются **дочерним процессом** с вычищенным окружением: из env убраны
    PYTHONIOENCODING / PYTHONUTF8 / PYTHONLEGACYWINDOWSSTDIO. Ребёнок не получает
    ни одного внешнего костыля — предмет проверки в том, что скрипт настраивает
    себя САМ.
  * stdout/stderr читаются как **байты** (`text=False`) и декодируются СТРОГИМ UTF-8.
    Строгий decode — сам по себе различающая проверка: cp1251-байты кириллицы
    (напр. 'укажи' → b'\\xf3\\xea\\xe0\\xe6\\xe8') невалидны как UTF-8 и валят тест.
  * Утверждения — на **конкретные фрагменты кириллицы И конкретные emoji**, а не на
    «команда не упала». Замена всего текста на '?' (errors='replace' поверх cp1251)
    или на escape-форму '\\u2705' обязана валить тест — обе проверяются явно.
  * Проверяются **оба потока**: stdout (успешные пути) и stderr (ошибка argparse
    с кириллическим argv, и `sys.exit("❌ ...")` из task.py move).

Две группы прогонов:

  A. Системная кодировка. Ребёнок берёт кодировку хоста. На Windows с ACP 1251 это
     и есть боевое условие дефекта. Тест ПЕЧАТАЕТ фактическую ambient-кодировку —
     если там uft-8, группа A на этом хосте ничего не доказывает, и это видно в логе,
     а не спрятано.
  B. Враждебная кодировка: ребёнку явно навязан PYTHONIOENCODING=cp1251. Делает тест
     детерминированно красным до фикса на ЛЮБОМ хосте, включая UTF-8 Linux, и
     доказывает, что скрипт перекрывает внешнюю настройку, а не полагается на неё.

Живой проект не трогается: core/ копируется во временный каталог, project/ там же
создаётся с нуля, мутирующий new_task.py работает только по фикстуре.
test_sync.py прогоняется из живого дерева — он сам создаёт свои временные копии.

Запуск (никаких env-переменных не требуется — в этом весь смысл):
    python core/scripts/test_stdio_utf8.py
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def _configure_stdio_utf8() -> None:
    """Человекочитаемые stdout/stderr этого скрипта — UTF-8, безопасно и без падения."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError, OSError):
            pass


_configure_stdio_utf8()

SCRIPT_DIR = Path(__file__).resolve().parent          # ai/core/scripts
CORE_DIR = SCRIPT_DIR.parent                          # ai/core
AI_ROOT = CORE_DIR.parent                             # ai/

# Внешние «костыли», которые чинят кодировку снаружи. Ребёнок не должен получить ни одного.
ENCODING_ENV_VARS = ("PYTHONIOENCODING", "PYTHONUTF8", "PYTHONLEGACYWINDOWSSTDIO")

_OK = True


def check(name: str, cond: bool, detail: str = "") -> bool:
    global _OK
    mark = "✅" if cond else "❌"
    print(f"{mark} {name}" + (f"\n      └─ {detail}" if detail and not cond else ""))
    _OK = _OK and cond
    return cond


# ─── Запуск дочернего CLI ────────────────────────────────────────────────────


def child_env(force_encoding: str | None = None) -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if k.upper() not in ENCODING_ENV_VARS}
    if force_encoding is not None:
        env["PYTHONIOENCODING"] = force_encoding
    return env


def ambient_encoding(force_encoding: str | None = None) -> str:
    """Кодировка stdout, которую дочерний python получил БЫ без правки скриптов.

    Диагностический маркер состояния: печатается в лог, чтобы было видно, боевое
    ли условие воспроизводится на этом хосте, или группа A вырождена.
    """
    probe = "import sys; sys.stdout.buffer.write(sys.stdout.encoding.encode('ascii'))"
    p = subprocess.run([sys.executable, "-c", probe], capture_output=True,
                       env=child_env(force_encoding))
    return p.stdout.decode("ascii", "replace").strip() or "<неизвестно>"


def run_cli(script: Path, argv: list[str], cwd: Path,
            force_encoding: str | None = None) -> subprocess.CompletedProcess:
    """Дочерний процесс без -X utf8 и без PYTHONIOENCODING. Вывод — СЫРЫЕ БАЙТЫ."""
    return subprocess.run([sys.executable, str(script), *argv], cwd=str(cwd),
                          env=child_env(force_encoding), capture_output=True)


def preview(raw: bytes) -> str:
    return repr(raw[:300])


def escape_forms(ch: str) -> list[str]:
    """Как выглядит символ, если поток отдали через backslashreplace."""
    cp = ord(ch)
    fmt = "\\U%08{}" if cp > 0xFFFF else "\\u%04{}"
    return list(dict.fromkeys([fmt.format("x") % cp, fmt.format("X") % cp]))


def assert_stream(label: str, stream_name: str, raw: bytes,
                  need_text: list[str], need_emoji: list[str]) -> None:
    """Строгий UTF-8 + наличие конкретной кириллицы + наличие конкретных emoji."""
    try:
        text = raw.decode("utf-8")
        decoded_ok = True
    except UnicodeDecodeError as e:
        decoded_ok = False
        # errors='ignore' запрещён контрактом; backslashreplace — только для показа в отчёте
        text = raw.decode("utf-8", errors="backslashreplace")
        check(f"{label} / {stream_name}: декодируется строгим UTF-8", False,
              f"{e}\n         raw={preview(raw)}")
    if decoded_ok:
        check(f"{label} / {stream_name}: декодируется строгим UTF-8", True)

    check(f"{label} / {stream_name}: нет UnicodeEncodeError",
          "UnicodeEncodeError" not in text, preview(raw))

    for frag in need_text:
        check(f"{label} / {stream_name}: кириллица {frag!r} на месте",
              frag in text, f"текст={text[:300]!r}")

    for ch in need_emoji:
        check(f"{label} / {stream_name}: emoji {ch!r} (U+{ord(ch):04X}) на месте",
              ch in text, f"текст={text[:300]!r}")
        for esc in escape_forms(ch):
            check(f"{label} / {stream_name}: {ch!r} не выродился в escape {esc!r}",
                  esc not in text, f"текст={text[:300]!r}")


# ─── Фикстура ────────────────────────────────────────────────────────────────

TASK_FOLDER = "TASK-101-тестовая-задача"
DISCUSSION_FOLDER = "1-кодировка-вывода"

PROFILE_YAML = """\
project: encoding-fixture

zones:
  - name: template-core
    class: I
    execution: apply
    runner: cloud
    network: none
    side_effects: none
    secrets: []
    hardware: []
    protected_paths: []
    frozen_contracts: []
    verification_profile: template-selfcheck
"""

VERIFICATION_PROFILE = """\
name: template-selfcheck
checks:
  task_lint:
    cmd: "python ai/core/scripts/task.py lint"
    timeout: 60
"""

TASK_MD = """\
---
id: TASK-101
schema_version: 2
status: active
mode: interactive
zone: template-core
verification_profile: template-selfcheck
checks: []
max_attempts: 3
depends_on: []
---

# TASK-101: тестовая задача про кодировку
"""


def build_fixture(tmp: Path) -> Path:
    """Скелет ai/ с копией core/ и минимальным project/. Живой проект не трогается."""
    ai = tmp / "ai"
    shutil.copytree(CORE_DIR, ai / "core",
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    project = ai / "project"
    tasks = project / "tasks"
    for st in ("active", "blocked", "done"):
        (tasks / st).mkdir(parents=True, exist_ok=True)
    task_dir = tasks / "active" / TASK_FOLDER
    task_dir.mkdir()
    (task_dir / "task.md").write_text(TASK_MD, encoding="utf-8")

    profiles = project / "profiles"
    profiles.mkdir(parents=True, exist_ok=True)
    (profiles / "template-selfcheck.yaml").write_text(VERIFICATION_PROFILE, encoding="utf-8")
    (project / "profile.yaml").write_text(PROFILE_YAML, encoding="utf-8")
    (project / "docs").mkdir(parents=True, exist_ok=True)

    disc = project / "discussions" / "active" / DISCUSSION_FOLDER
    disc.mkdir(parents=True)
    (disc / "discussion.md").write_text("# Кодировка вывода\n", encoding="utf-8")
    (project / "discussions" / "archive").mkdir(parents=True, exist_ok=True)
    (project / "discussions" / "prompts").mkdir(parents=True, exist_ok=True)
    return ai


# ─── Матрица сценариев ───────────────────────────────────────────────────────
# (метка, относительный путь скрипта, argv, ожидаемый rc,
#  stdout: (кириллица, emoji), stderr: (кириллица, emoji))

CASES = [
    ("task.py lint", "core/scripts/task.py", ["lint"], 0,
     (["ошибок нет", "предупреждений"], ["✅"]), ([], [])),

    ("task.py move (stderr, sys.exit)", "core/scripts/task.py",
     ["move", "TASK-999", "done"], 1,
     ([], []), (["не найдена"], ["❌"])),

    ("task.py argparse error (stderr)", "core/scripts/task.py",
     ["несуществующая-команда"], 2,
     ([], []), (["несуществующая-команда"], [])),

    ("profile.py lint", "core/scripts/profile.py", ["lint"], 0,
     (["ошибок нет", "зон"], ["✅"]), ([], [])),

    ("profile.py argparse error (stderr)", "core/scripts/profile.py",
     ["проверь-это"], 2,
     ([], []), (["проверь-это"], [])),

    ("sync.py argparse error (stderr)", "core/scripts/sync.py", ["--check"], 2,
     ([], []), (["укажи <target>", "путь к каталогу"], [])),

    ("discuss.py list", "core/discussions/scripts/discuss.py", ["list"], 0,
     (["Активные обсуждения", "кодировка вывода"], ["📋"]), ([], [])),
]


def sync_check_case(ai: Path, force: str | None) -> None:
    """sync.py --check по несуществующему target: emoji 🔎/⛔ + кириллица, без мутаций."""
    label = "sync.py --check (нет lock)"
    missing = ai.parent / "нет-такого-проекта" / "ai"
    p = run_cli(ai / "core" / "scripts" / "sync.py",
                ["--check", str(missing), "--template", str(ai)], cwd=ai,
                force_encoding=force)
    check(f"{label}: exit 3 (нарушен инвариант)", p.returncode == 3,
          f"rc={p.returncode} {preview(p.stdout)} {preview(p.stderr)}")
    assert_stream(label, "stdout", p.stdout,
                  ["sync --check", "НАРУШЕН ИНВАРИАНТ"], ["🔎", "⛔"])
    check(f"{label}: target не создан", not missing.exists())


def new_task_case(ai: Path, force: str | None) -> None:
    """new_task.py — мутирующий, поэтому только по фикстуре."""
    label = "new_task.py (фикстура)"
    p = run_cli(ai / "core" / "scripts" / "new_task.py",
                ["Проверка Кодировки Вывода", "--no-status"], cwd=ai,
                force_encoding=force)
    check(f"{label}: exit 0", p.returncode == 0,
          f"rc={p.returncode} {preview(p.stdout)} {preview(p.stderr)}")
    assert_stream(label, "stdout", p.stdout,
                  ["проверка-кодировки-вывода"], ["✓", "📋"])


def group(title: str, force: str | None) -> None:
    print(f"\n=== {title} ===")
    print(f"    ambient stdout.encoding у ребёнка: {ambient_encoding(force)}")
    with tempfile.TemporaryDirectory(prefix="stdio_utf8_") as tmp:
        ai = build_fixture(Path(tmp))
        for label, rel, argv, rc, (out_txt, out_emo), (err_txt, err_emo) in CASES:
            p = run_cli(ai / rel, argv, cwd=ai, force_encoding=force)
            check(f"{label}: exit {rc}", p.returncode == rc,
                  f"rc={p.returncode}\n         stdout={preview(p.stdout)}"
                  f"\n         stderr={preview(p.stderr)}")
            if out_txt or out_emo:
                assert_stream(label, "stdout", p.stdout, out_txt, out_emo)
            if err_txt or err_emo:
                assert_stream(label, "stderr", p.stderr, err_txt, err_emo)
        sync_check_case(ai, force)
        new_task_case(ai, force)


def test_sync_suite() -> None:
    """test_sync.py целиком, без PYTHONIOENCODING: и он сам, и его дети sync.py."""
    print("\n=== C. test_sync.py целиком без PYTHONIOENCODING ===")
    p = subprocess.run([sys.executable, str(SCRIPT_DIR / "test_sync.py")],
                       cwd=str(AI_ROOT), env=child_env(), capture_output=True)
    check("test_sync.py: exit 0", p.returncode == 0,
          f"rc={p.returncode}\n         tail={p.stdout[-600:]!r}\n         err={p.stderr[-600:]!r}")
    assert_stream("test_sync.py", "stdout", p.stdout,
                  ["ВСЕ ПРОВЕРКИ ПРОШЛИ", "ИТОГ"], ["✅"])


# Проверка безопасного фолбэка: поток, у которого reconfigure недоступен или запрещён.
# configure_stdio_utf8() обязана продолжить работу, а НЕ упасть и НЕ заглушить вывод.
FALLBACK_DRIVER = r'''
import importlib.util, io, json, sys

results = {}
real_out, real_err = sys.stdout, sys.stderr


def load(path):
    spec = importlib.util.spec_from_file_location("climod", path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def closed_wrapper():
    w = io.TextIOWrapper(io.BytesIO())
    w.close()
    return w


for path in sys.argv[1:]:
    m = load(path)
    per_script = {}

    # 1. StringIO: reconfigure нет вовсе (AttributeError) — вывод обязан дойти целым
    buf_out, buf_err = io.StringIO(), io.StringIO()
    sys.stdout, sys.stderr = buf_out, buf_err
    try:
        m.configure_stdio_utf8()
        print("✅ кириллица-out")
        print("✅ кириллица-err", file=sys.stderr)
        per_script["stringio"] = {"raised": None,
                                  "out": buf_out.getvalue(), "err": buf_err.getvalue()}
    except BaseException as e:
        per_script["stringio"] = {"raised": type(e).__name__ + ": " + str(e)}
    finally:
        sys.stdout, sys.stderr = real_out, real_err

    # 2. Закрытый TextIOWrapper: reconfigure бросает ValueError
    sys.stdout, sys.stderr = closed_wrapper(), closed_wrapper()
    try:
        m.configure_stdio_utf8()
        per_script["closed"] = {"raised": None}
    except BaseException as e:
        per_script["closed"] = {"raised": type(e).__name__ + ": " + str(e)}
    finally:
        sys.stdout, sys.stderr = real_out, real_err

    # 3. sys.stdout/sys.stderr = None (pythonw.exe, detached process)
    sys.stdout, sys.stderr = None, None
    try:
        m.configure_stdio_utf8()
        per_script["none"] = {"raised": None}
    except BaseException as e:
        per_script["none"] = {"raised": type(e).__name__ + ": " + str(e)}
    finally:
        sys.stdout, sys.stderr = real_out, real_err

    results[path] = per_script

sys.stdout.buffer.write(json.dumps(results, ensure_ascii=False).encode("utf-8"))
'''

FALLBACK_SCRIPTS = [
    "core/scripts/task.py",
    "core/scripts/new_task.py",
    "core/scripts/sync.py",
    "core/scripts/profile.py",
    "core/scripts/test_sync.py",
    "core/scripts/test_task.py",
    "core/discussions/scripts/discuss.py",
]


def fallback_suite() -> None:
    """Поток без reconfigure / закрытый / None: продолжаем работу, вывод не глушим."""
    print("\n=== D. безопасный фолбэк: stdout/stderr не TextIOWrapper ===")
    with tempfile.TemporaryDirectory(prefix="stdio_fallback_") as tmp:
        ai = build_fixture(Path(tmp))
        paths = [str(ai / rel) for rel in FALLBACK_SCRIPTS]
        p = subprocess.run([sys.executable, "-c", FALLBACK_DRIVER, *paths],
                           cwd=str(ai), env=child_env(), capture_output=True)
        if not check("драйвер фолбэка отработал", p.returncode == 0,
                     f"rc={p.returncode} err={p.stderr[-500:]!r}"):
            return
        import json as _json
        data = _json.loads(p.stdout.decode("utf-8"))
        for rel, path in zip(FALLBACK_SCRIPTS, paths):
            r = data[path]
            check(f"{rel}: StringIO — не упало",
                  r["stringio"]["raised"] is None, str(r["stringio"].get("raised")))
            check(f"{rel}: StringIO — stdout не заглушён, текст цел",
                  r["stringio"].get("out", "").strip() == "✅ кириллица-out",
                  repr(r["stringio"].get("out")))
            check(f"{rel}: StringIO — stderr не заглушён, текст цел",
                  r["stringio"].get("err", "").strip() == "✅ кириллица-err",
                  repr(r["stringio"].get("err")))
            check(f"{rel}: закрытый поток — не упало",
                  r["closed"]["raised"] is None, str(r["closed"].get("raised")))
            check(f"{rel}: sys.stdout is None — не упало",
                  r["none"]["raised"] is None, str(r["none"].get("raised")))


def file_handle_suite() -> None:
    """Запись через переданный file handle (не PIPE), без shell/redirection-синтаксиса."""
    print("\n=== E. вывод в переданный file handle ===")
    with tempfile.TemporaryDirectory(prefix="stdio_fh_") as tmp:
        ai = build_fixture(Path(tmp))
        out_path = Path(tmp) / "out.bin"
        err_path = Path(tmp) / "err.bin"
        with open(out_path, "wb") as fo, open(err_path, "wb") as fe:
            p = subprocess.run([sys.executable, str(ai / "core/scripts/task.py"), "lint"],
                               cwd=str(ai), env=child_env(), stdout=fo, stderr=fe)
        check("task.py lint в file handle: exit 0", p.returncode == 0,
              f"rc={p.returncode} err={err_path.read_bytes()[:300]!r}")
        assert_stream("task.py lint (file handle)", "файл stdout", out_path.read_bytes(),
                      ["ошибок нет"], ["✅"])


def main() -> int:
    group("A. системная кодировка хоста (PYTHONIOENCODING снят)", None)
    group("B. враждебная кодировка (PYTHONIOENCODING=cp1251 навязан ребёнку)", "cp1251")
    test_sync_suite()
    fallback_suite()
    file_handle_suite()

    print("\n" + "=" * 44)
    print("ИТОГ:", "ВСЕ ПРОВЕРКИ ПРОШЛИ ✅" if _OK else "ЕСТЬ ПРОВАЛЫ ❌")
    return 0 if _OK else 1


if __name__ == "__main__":
    sys.exit(main())
