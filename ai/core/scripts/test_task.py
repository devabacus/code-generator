#!/usr/bin/env python3
"""
Тесты task.py — резолв задачи по id, гейт на шаблонный report.md, поток отказов.

Секции A–C: резолв задачи по id (find_task_anywhere).

Фиксирует дефект из дискуссии #3 (`project/discussions/active/3-*/discussion.md`,
секция Decision, п. 4): find_task_anywhere просматривал только active/ и done/,
поэтому задача в blocked/ не находилась ВООБЩЕ — (None, 'none'). Из-за этого
`task.py pr` вёл себя так, будто задачи нет: PR не связывался с задачей, report.md
не попадал в body.

Покрывает:
  1. задача в active/  → ('active', папка внутри active/)
  2. задача в blocked/ → ('blocked', папка внутри blocked/)   ← красный до фикса
  3. задача в done/    → ('done', папка внутри done/)
  4. blocked находится и когда каталогов active/ и done/ нет вовсе
  5. обратная сторона инварианта: несуществующий id → (None, 'none')
  6. обратная сторона инварианта: частичный id ('TASK-10') НЕ матчит 'TASK-101-...'

Проверяемые значения выбраны отличающимися от «полного отказа»: при неисправном
коде find_task_anywhere возвращает ровно (None, 'none'), а тесты 1–4 требуют
конкретное имя каталога и конкретный location.

Секция D: `pr` не делает тело PR из шаблонного report.md (отзыв пилота, P1-2), и маркеры
шаблона синхронны настоящему файлу шаблона.

Отчёт пишет НЕ исполнитель (harness блокирует запись отчётов субагентами), поэтому
`report.md` вполне может остаться шаблонной рыбой — а `cmd_pr` подставляет его как
`--body-file`. У пилота пустой PR поймал ревьюер. Инвариант проверяется с ДВУХ сторон:
шаблонная рыба обязана блокировать, заполненный отчёт обязан проходить. Проверка
только «шаблон блокирует» прошла бы и на коде, который блокирует вообще всё.
Различающее значение: `new_task.py` подставляет id только в `task.md`, поэтому в
свежесозданном `report.md` буквально остаётся строка `# Отчёт TASK-XXX`.

D4/D5 закрывают дыру в самом тесте: раньше текст шаблона был литералом ВНУТРИ теста, а
`core/tasks/_template/report.md` не читался вовсе. Перепиши шаблон мимо маркеров —
`report_blockers()` вернёт `[]`, гейт умрёт, и ни один тест не покраснеет. Теперь предмет
проверки — настоящий файл шаблона и настоящий кортеж `REPORT_TEMPLATE_MARKERS` из `task.py`.

Секция E: отказы печатаются в stderr (отзыв пилота, P3-1). E5 — тот же инвариант в соседнем
скрипте `profile.py`: полу-инвариант («у task.py в stderr, у profile.py в stdout») не защищает
цепочку команд ни от чего.

`... | tail -3 && <дальше>` прячет stdout отказа, и следующая команда цепочки
выполняется как ни в чём не бывало (у пилота так ушёл коммит в master). Скрипт,
защищающий от работы в master, обязан печатать отказ в stderr. Проверяется именно
поток: текст обязан быть в stderr И обязан ОТСУТСТВОВАТЬ в stdout — иначе `| tail`
снова его покажет и тест перестанет что-либо доказывать.

Живые файлы проекта не трогаются: task.py копируется в скелет ai/ во временном
каталоге, задачи-фикстуры (и git-репозиторий вокруг них для секции E) создаются
там же, каталог удаляется в конце.

Запуск:
    python core/scripts/test_task.py

PYTHONIOENCODING=utf-8 больше НЕ требуется (TASK-018): скрипты сами настраивают UTF-8.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def configure_stdio_utf8() -> None:
    """Человекочитаемые stdout/stderr — UTF-8 с безопасным фолбэком (см. TASK-018)."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError, OSError):
            pass


SCRIPT_DIR = Path(__file__).resolve().parent          # ai/core/scripts
TASK_PY = SCRIPT_DIR / "task.py"
PROFILE_PY = SCRIPT_DIR / "profile.py"
# НАСТОЯЩИЙ шаблон отчёта, который new_task.py кладёт в новую задачу. Тест обязан читать
# именно его: копия текста внутри теста проверяет копию, а не то, что реально едет в PR.
TEMPLATE_REPORT_PATH = SCRIPT_DIR.parent / "tasks" / "_template" / "report.md"

_OK = True


def check(name: str, cond: bool, detail: str = "") -> bool:
    global _OK
    mark = "✅" if cond else "❌"
    print(f"{mark} {name}" + (f" — {detail}" if detail and not cond else ""))
    _OK = _OK and cond
    return cond


def make_fixture(tmp: Path, placements: dict[str, str],
                 make_empty_dirs: bool = True) -> Path:
    """Собрать скелет ai/ во временном каталоге и вернуть путь к копии task.py.

    placements: {status_dir: folder_name}. Для каждой записи создаётся
    project/tasks/<status>/<folder>/task.md с согласованным frontmatter.
    make_empty_dirs=False — не создавать каталоги статусов, которых нет в placements
    (проверка, что поиск не падает на отсутствующих каталогах).
    """
    ai = tmp / "ai"
    scripts = ai / "core" / "scripts"
    scripts.mkdir(parents=True)
    task_py = scripts / "task.py"
    shutil.copy2(TASK_PY, task_py)

    tasks = ai / "project" / "tasks"
    if make_empty_dirs:
        for status in ("active", "blocked", "done"):
            (tasks / status).mkdir(parents=True, exist_ok=True)

    for status, folder in placements.items():
        d = tasks / status / folder
        d.mkdir(parents=True, exist_ok=True)
        tid = folder.split("-")[0] + "-" + folder.split("-")[1]
        (d / "task.md").write_text(
            "---\n"
            f"id: {tid}\n"
            "schema_version: 2\n"
            f"status: {status}\n"
            "mode: interactive\n"
            "---\n\n"
            f"# {folder}\n",
            encoding="utf-8")
    return task_py


def resolve(task_py: Path, ids: list[str]) -> dict[str, dict]:
    """Прогнать find_task_anywhere по списку id в дочернем процессе.

    Импортируем ИМЕННО копию task.py: её module-level ACTIVE_DIR/BLOCKED_DIR/DONE_DIR
    выводятся из __file__ и указывают на фикстуру, а не на живой проект.
    """
    ids_json = json.dumps(ids)
    # Драйвер настраивает свой stdout сам: он не CLI-скрипт шаблона (main() не вызывается),
    # а внешнего PYTHONIOENCODING после TASK-018 намеренно нет.
    driver = f'''
import importlib.util, json, sys
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError, OSError):
        pass
spec = importlib.util.spec_from_file_location("taskmod", r"{task_py}")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
out = {{}}
for tid in json.loads({ids_json!r}):
    p, loc = m.find_task_anywhere(tid)
    out[tid] = {{
        "location": loc,
        "name": p.name if p is not None else None,
        "parent": p.parent.name if p is not None else None,
    }}
print(json.dumps(out, ensure_ascii=False))
'''
    p = subprocess.run([sys.executable, "-c", driver], text=True, capture_output=True,
                       encoding="utf-8", errors="replace")
    lines = [ln for ln in p.stdout.splitlines() if ln.strip()]
    if not lines:
        raise AssertionError(f"драйвер не вернул вывод:\nSTDOUT:{p.stdout}\nSTDERR:{p.stderr}")
    try:
        return json.loads(lines[-1])
    except json.JSONDecodeError as e:
        raise AssertionError(f"драйвер вернул не-JSON ({e}):\n"
                             f"STDOUT:{p.stdout}\nSTDERR:{p.stderr}") from e


ACTIVE_FOLDER = "TASK-101-активная-задача"
BLOCKED_FOLDER = "TASK-102-заблокированная-задача"
DONE_FOLDER = "TASK-103-завершённая-задача"


def three_states():
    print("\n=== A. find_task_anywhere различает active / blocked / done ===")
    with tempfile.TemporaryDirectory(prefix="task_A_") as tmp:
        task_py = make_fixture(Path(tmp), {
            "active": ACTIVE_FOLDER,
            "blocked": BLOCKED_FOLDER,
            "done": DONE_FOLDER,
        })
        r = resolve(task_py, ["TASK-101", "TASK-102", "TASK-103"])

        a = r["TASK-101"]
        check("A1 active: location == 'active'", a["location"] == "active", repr(a))
        check("A1 active: возвращена папка задачи", a["name"] == ACTIVE_FOLDER, repr(a))
        check("A1 active: папка лежит в active/", a["parent"] == "active", repr(a))

        b = r["TASK-102"]
        check("A2 blocked: задача НАЙДЕНА (не (None,'none'))", b["name"] is not None, repr(b))
        check("A2 blocked: location == 'blocked'", b["location"] == "blocked", repr(b))
        check("A2 blocked: возвращена папка задачи", b["name"] == BLOCKED_FOLDER, repr(b))
        check("A2 blocked: папка лежит в blocked/", b["parent"] == "blocked", repr(b))

        d = r["TASK-103"]
        check("A3 done: location == 'done'", d["location"] == "done", repr(d))
        check("A3 done: возвращена папка задачи", d["name"] == DONE_FOLDER, repr(d))
        check("A3 done: папка лежит в done/", d["parent"] == "done", repr(d))


def blocked_only_no_sibling_dirs():
    print("\n=== B. blocked находится, когда каталогов active/ и done/ нет вовсе ===")
    with tempfile.TemporaryDirectory(prefix="task_B_") as tmp:
        task_py = make_fixture(Path(tmp), {"blocked": BLOCKED_FOLDER},
                               make_empty_dirs=False)
        r = resolve(task_py, ["TASK-102"])
        b = r["TASK-102"]
        check("B: location == 'blocked' без active/ и done/", b["location"] == "blocked", repr(b))
        check("B: возвращена папка задачи", b["name"] == BLOCKED_FOLDER, repr(b))


def not_found_side():
    print("\n=== C. обратная сторона инварианта: чего нет — не находится ===")
    with tempfile.TemporaryDirectory(prefix="task_C_") as tmp:
        task_py = make_fixture(Path(tmp), {
            "active": ACTIVE_FOLDER,
            "blocked": BLOCKED_FOLDER,
            "done": DONE_FOLDER,
        })
        r = resolve(task_py, ["TASK-999", "TASK-10"])

        miss = r["TASK-999"]
        check("C1 несуществующий id: location == 'none'", miss["location"] == "none", repr(miss))
        check("C1 несуществующий id: path is None", miss["name"] is None, repr(miss))

        partial = r["TASK-10"]
        check("C2 частичный id 'TASK-10' НЕ матчит 'TASK-101-...'",
              partial["location"] == "none" and partial["name"] is None, repr(partial))


# ─── D/E. Гейт на шаблонный report.md и поток отказов ────────────────────────

# Ровно то, что new_task.py кладёт в свежую задачу: он подставляет id только в task.md,
# так что 'TASK-XXX' в отчёте остаётся буквально. Читаем НАСТОЯЩИЙ файл шаблона, а не его
# копию: раньше здесь был литерал, и переписывание core/tasks/_template/report.md мимо
# маркеров не роняло ни одного теста — гейт умирал молча.
try:
    TEMPLATE_REPORT = TEMPLATE_REPORT_PATH.read_text(encoding="utf-8")
except OSError as _e:   # шаблон обязан существовать: без него гейт не на чем проверять
    raise SystemExit(f"❌ не читается шаблон отчёта {TEMPLATE_REPORT_PATH}: {_e}") from _e

# Заполненный отчёт: ни одной строки-заглушки. Обратная сторона инварианта — такой
# отчёт обязан ПРОЙТИ гейт, иначе «блокирует всё» неотличимо от «блокирует шаблон».
FILLED_REPORT = (
    "# Отчёт TASK-101\n\n"
    "## Резюме\n\n"
    "Добавлен гейт на незаполненный отчёт в `task.py pr`.\n\n"
    "## Изменения\n\n"
    "- `core/scripts/task.py` — `report_blockers()` + вызов в `cmd_pr` до push.\n\n"
    "## Тесты\n\n"
    "- `core/scripts/test_task.py`, секции D и E.\n"
)

PR_BRANCH = "feature/TASK-101-report-gate"
DONE_FOLDER_101 = "TASK-101-гейт-отчёта"

# Фрагменты, по которым тест узнаёт конкретный отказ/этап в выводе CLI.
REFUSAL_TEMPLATE = "заглушк"      # отказ из-за шаблонной рыбы в report.md
REFUSAL_DIRTY = "не чист"         # отказ из-за грязного рабочего каталога
MARK_PUSH = "push"                # cmd_pr дошёл до пуша => гейт отчёта пропустил


def git(repo: Path, *args: str) -> subprocess.CompletedProcess:
    """git в фикстуре с фиксированной identity (глобальный user.* может быть не задан)."""
    return subprocess.run(
        ["git", "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid",
         "-c", "commit.gpgsign=false", *args],
        cwd=str(repo), text=True, capture_output=True, encoding="utf-8", errors="replace")


def git_or_die(repo: Path, *args: str) -> None:
    r = git(repo, *args)
    if r.returncode != 0:
        raise AssertionError(f"git {' '.join(args)} упал: rc={r.returncode}\n"
                             f"STDOUT:{r.stdout}\nSTDERR:{r.stderr}")


def make_git_fixture(tmp: Path, placements: dict[str, str],
                     reports: dict[str, str] | None = None,
                     branch: str = PR_BRANCH, dirty_file: tuple[str, str] | None = None) -> Path:
    """Скелет ai/ внутри git-репо: cmd_pr без git не работает вообще.

    reports: {имя папки задачи: текст report.md}.
    dirty_file: (status, folder) — оставить незакоммиченную правку в task.md этой задачи.
    """
    task_py = make_fixture(tmp, placements)
    tasks = tmp / "ai" / "project" / "tasks"
    for status, folder in placements.items():
        if reports and folder in reports:
            (tasks / status / folder / "report.md").write_text(reports[folder], encoding="utf-8")

    git_or_die(tmp, "init")
    git_or_die(tmp, "add", "-A")
    git_or_die(tmp, "commit", "-m", "fixture")
    git_or_die(tmp, "checkout", "-b", branch)
    left = git(tmp, "status", "--porcelain").stdout.strip()
    if left:
        raise AssertionError(f"фикстура должна быть чистой до правок, а осталось:\n{left}")

    if dirty_file is not None:
        status, folder = dirty_file
        md = tasks / status / folder / "task.md"
        md.write_text(md.read_text(encoding="utf-8") + "\nнезакоммиченная правка\n",
                      encoding="utf-8")
    return task_py


def run_cli(task_py: Path, argv: list[str]) -> subprocess.CompletedProcess:
    """task.py дочерним процессом из каталога ai/ фикстуры; stdout и stderr — раздельно."""
    return subprocess.run([sys.executable, str(task_py), *argv],
                          cwd=str(task_py.parents[2]), text=True, capture_output=True,
                          encoding="utf-8", errors="replace")


def call_report_blockers(task_py: Path, files: dict[str, Path]) -> dict:
    """Вызвать task.py::report_blockers по каждому пути + вернуть REPORT_TEMPLATE_MARKERS.

    Функции нет → has_function=False. Маркеры отдаём из САМОГО модуля, а не из копии в
    тесте: иначе «синхронность» проверялась бы двух копий друг с другом.
    """
    paths_json = json.dumps({k: str(v) for k, v in files.items()})
    driver = f'''
import importlib.util, json, sys
from pathlib import Path
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError, OSError):
        pass
spec = importlib.util.spec_from_file_location("taskmod", r"{task_py}")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
fn = getattr(m, "report_blockers", None)
out = {{"has_function": fn is not None, "result": {{}},
       "markers": list(getattr(m, "REPORT_TEMPLATE_MARKERS", ()))}}
if fn is not None:
    for label, path in json.loads({paths_json!r}).items():
        out["result"][label] = list(fn(Path(path)))
print(json.dumps(out, ensure_ascii=False))
'''
    p = subprocess.run([sys.executable, "-c", driver], text=True, capture_output=True,
                       encoding="utf-8", errors="replace")
    lines = [ln for ln in p.stdout.splitlines() if ln.strip()]
    if not lines:
        raise AssertionError(f"драйвер не вернул вывод:\nSTDOUT:{p.stdout}\nSTDERR:{p.stderr}")
    return json.loads(lines[-1])


def report_blockers_unit():
    print("\n=== D. report_blockers: шаблонная рыба ≠ заполненный отчёт ===")
    with tempfile.TemporaryDirectory(prefix="task_D_") as tmp:
        tmp_p = Path(tmp)
        task_py = make_fixture(tmp_p, {"done": DONE_FOLDER_101})
        filled = tmp_p / "filled-report.md"
        filled.write_text(FILLED_REPORT, encoding="utf-8")
        missing = tmp_p / "нет-такого-report.md"

        # Предмет D1/D4/D5 — НАСТОЯЩИЙ core/tasks/_template/report.md, как он лежит в репо.
        r = call_report_blockers(task_py, {"template": TEMPLATE_REPORT_PATH,
                                           "filled": filled, "missing": missing})
        if not check("D0 в task.py есть report_blockers()", r["has_function"], repr(r)):
            return
        res = r["result"]
        markers = r["markers"]

        check("D1 настоящий core/tasks/_template/report.md блокируется",
              bool(res["template"]), repr(res["template"]))
        joined = " | ".join(res["template"])
        check("D1 в причинах названа строка-заглушка 'Что было реализовано.'",
              "Что было реализовано." in joined, joined)
        check("D1 в причинах названа строка-заглушка '# Отчёт TASK-XXX'",
              "# Отчёт TASK-XXX" in joined, joined)

        check("D2 заполненный report.md НЕ блокируется (обратная сторона)",
              res["filled"] == [], repr(res["filled"]))

        # Фикстура — отсутствующий файл. `pr` на уровне CLI отсутствующий отчёт не блокирует
        # (см. cmd_pr: `if _report.exists()`), поэтому здесь проверяется именно поведение
        # самой report_blockers: нечитаемый вход не приравнивается к «заполнен».
        check("D3 отсутствующий/нечитаемый файл блокируется самой report_blockers "
              "(fail-closed, не «значит заполнен»)",
              bool(res["missing"]), repr(res["missing"]))

        # ── D4/D5: маркеры синхронны настоящему шаблону ──────────────────────
        # Дыра, которую это закрывает: раньше тест собирал текст шаблона литералом внутри
        # себя. Перепиши core/tasks/_template/report.md мимо маркеров — report_blockers()
        # на нём вернёт [], гейт `pr` перестанет ловить рыбу, и НИ ОДИН тест не покраснеет.
        check("D4 REPORT_TEMPLATE_MARKERS непуст", bool(markers), repr(markers))
        missing_markers = [mk for mk in markers if mk not in TEMPLATE_REPORT]
        check(f"D4 каждый из {len(markers)} маркеров реально есть в {TEMPLATE_REPORT_PATH.name}",
              not missing_markers,
              f"нет в шаблоне: {missing_markers!r} — маркеры и "
              f"core/tasks/_template/report.md разъехались")

        # Врезка «Тело PR берётся из этого файла…» адресована автору отчёта. Оставленная в
        # файле, она уехала бы в тело PR — значит обязана быть маркером, а не просто текстом.
        check("D5 врезка шаблона входит в маркеры (иначе она уезжает в тело PR)",
              any("Тело PR берётся из этого файла" in mk for mk in markers),
              repr(markers))
        check("D5 врезка названа среди причин отказа на настоящем шаблоне",
              "Тело PR берётся из этого файла" in joined, joined)


def pr_refuses_template_report():
    print("\n=== E1. pr отказывается делать тело PR из шаблонного report.md ===")
    with tempfile.TemporaryDirectory(prefix="task_E1_") as tmp:
        task_py = make_git_fixture(Path(tmp), {"done": DONE_FOLDER_101},
                                   reports={DONE_FOLDER_101: TEMPLATE_REPORT})
        p = run_cli(task_py, ["pr"])
        detail = f"rc={p.returncode}\n      STDOUT:{p.stdout!r}\n      STDERR:{p.stderr!r}"
        check("E1 pr завершился отказом (rc=1)", p.returncode == 1, detail)
        check("E1 причина отказа — в stderr", REFUSAL_TEMPLATE in p.stderr, detail)
        check("E1 причина отказа НЕ только в stdout (| tail её не спрячет)",
              REFUSAL_TEMPLATE not in p.stdout, detail)
        check("E1 до push дело не дошло", MARK_PUSH not in p.stdout, detail)


def pr_accepts_filled_report():
    print("\n=== E2. pr пропускает заполненный report.md (обратная сторона) ===")
    with tempfile.TemporaryDirectory(prefix="task_E2_") as tmp:
        task_py = make_git_fixture(Path(tmp), {"done": DONE_FOLDER_101},
                                   reports={DONE_FOLDER_101: FILLED_REPORT})
        p = run_cli(task_py, ["pr"])
        detail = f"rc={p.returncode}\n      STDOUT:{p.stdout!r}\n      STDERR:{p.stderr!r}"
        # origin в фикстуре нет — push обязан упасть; предмет проверки в том, ЧТО именно
        # остановило команду: гейт отчёта или уже сам git.
        check("E2 гейт отчёта не сработал на заполненном отчёте",
              REFUSAL_TEMPLATE not in p.stdout and REFUSAL_TEMPLATE not in p.stderr, detail)
        check("E2 команда дошла до push", MARK_PUSH in p.stdout, detail)


def pr_dirty_tree_refusal_goes_to_stderr():
    print("\n=== E3. отказ на грязном дереве уходит в stderr ===")
    with tempfile.TemporaryDirectory(prefix="task_E3_") as tmp:
        task_py = make_git_fixture(Path(tmp), {"done": DONE_FOLDER_101},
                                   reports={DONE_FOLDER_101: FILLED_REPORT},
                                   dirty_file=("done", DONE_FOLDER_101))
        p = run_cli(task_py, ["pr"])
        detail = f"rc={p.returncode}\n      STDOUT:{p.stdout!r}\n      STDERR:{p.stderr!r}"
        check("E3 pr завершился отказом (rc=1)", p.returncode == 1, detail)
        check("E3 причина отказа — в stderr", REFUSAL_DIRTY in p.stderr, detail)
        check("E3 причина отказа НЕ только в stdout", REFUSAL_DIRTY not in p.stdout, detail)
        check("E3 список грязных файлов — тоже в stderr",
              "task.md" in p.stderr, detail)


def lint_errors_go_to_stderr():
    print("\n=== E4. ошибки lint уходят в stderr ===")
    with tempfile.TemporaryDirectory(prefix="task_E4_") as tmp:
        # Расхождение папка↔status: лежит в active/, а во frontmatter status: done.
        task_py = make_fixture(Path(tmp), {"active": ACTIVE_FOLDER})
        md = (Path(tmp) / "ai" / "project" / "tasks" / "active" / ACTIVE_FOLDER / "task.md")
        md.write_text(md.read_text(encoding="utf-8").replace("status: active", "status: done"),
                      encoding="utf-8")

        p = run_cli(task_py, ["lint"])
        detail = f"rc={p.returncode}\n      STDOUT:{p.stdout!r}\n      STDERR:{p.stderr!r}"
        check("E4 lint завершился отказом (rc=1)", p.returncode == 1, detail)
        check("E4 текст ошибки — в stderr", "расхождение папка/status" in p.stderr, detail)
        check("E4 текст ошибки НЕ только в stdout", "расхождение папка/status" not in p.stdout,
              detail)
        check("E4 итоговая строка про ошибки — в stderr", "1 ошибок" in p.stderr, detail)


def profile_lint_errors_go_to_stderr():
    print("\n=== E5. ошибки profile.py lint уходят в stderr (тот же инвариант, соседний скрипт) ===")
    with tempfile.TemporaryDirectory(prefix="task_E5_") as tmp:
        tmp_p = Path(tmp)
        scripts = tmp_p / "ai" / "core" / "scripts"
        scripts.mkdir(parents=True)
        profile_py = scripts / "profile.py"
        shutil.copy2(PROFILE_PY, profile_py)
        project = tmp_p / "ai" / "project"
        (project / "profiles").mkdir(parents=True)
        # Зона без обязательных ключей + пустой project: гарантированные ошибки схемы.
        (project / "profile.yaml").write_text(
            "project: \"\"\nzones:\n  - name: битая-зона\n", encoding="utf-8")

        p = subprocess.run([sys.executable, str(profile_py), "lint"],
                           cwd=str(tmp_p / "ai"), text=True, capture_output=True,
                           encoding="utf-8", errors="replace")
        detail = f"rc={p.returncode}\n      STDOUT:{p.stdout!r}\n      STDERR:{p.stderr!r}"
        check("E5 profile lint завершился отказом (rc=1)", p.returncode == 1, detail)
        check("E5 текст ошибки — в stderr", "пустое поле project" in p.stderr, detail)
        check("E5 текст ошибки НЕ только в stdout (| tail её не спрячет)",
              "пустое поле project" not in p.stdout, detail)
        check("E5 итоговая строка про ошибки — в stderr",
              "profile lint:" in p.stderr and "ошибок" in p.stderr, detail)
        check("E5 итоговая строка про ошибки НЕ в stdout",
              "profile lint:" not in p.stdout, detail)


def main() -> int:
    configure_stdio_utf8()
    three_states()
    blocked_only_no_sibling_dirs()
    not_found_side()
    report_blockers_unit()
    pr_refuses_template_report()
    pr_accepts_filled_report()
    pr_dirty_tree_refusal_goes_to_stderr()
    lint_errors_go_to_stderr()
    profile_lint_errors_go_to_stderr()

    print("\n" + "=" * 44)
    print("ИТОГ:", "ВСЕ ПРОВЕРКИ ПРОШЛИ ✅" if _OK else "ЕСТЬ ПРОВАЛЫ ❌")
    return 0 if _OK else 1


if __name__ == "__main__":
    sys.exit(main())
