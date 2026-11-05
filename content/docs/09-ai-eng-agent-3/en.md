> This is **Part 3** of the three-part series "Designing an Agent from Scratch".
> The route: extensions → program bookkeeping → logs and memory → acceptance criteria and pitfalls → version appendix.
> Part 1 got the loop and the four file tools working. Part 2 added commands, context, controls and permissions. Part 3 solves the last three things: how to extend tools, how to prove it actually finished, and how to investigate after an incident.

## 12. Extensions: plugins, MCP, Skills

The tools are not enough, but you should not keep piling them into the main program. The current version provides three extension paths, each answering a different "who maintains it" question.

Plugins: one `.py` file on the local machine

Scan the `tools/` directory. Every `.py` file that provides `TOOL_DEF` and `run` is automatically mounted as a tool:

```python
def scan_and_load_plugins(verbose=True):
    # Excerpt: TOOL_DEF type, duplicate-name and run-callable checks omitted
    result = {}
    if not os.path.isdir(PLUGINS_DIR):
        return result
    files = sorted(f for f in os.listdir(PLUGINS_DIR)
                   if f.endswith(".py") and not f.startswith("_"))
    for fn in files:
        path = os.path.join(PLUGINS_DIR, fn)
        try:
            spec = importlib.util.spec_from_file_location(f"_plugin_{fn[:-3]}", path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
        except Exception as e:
            print(f"  [plugin] failed to load {fn}: {e}")
            continue
        if not hasattr(mod, "TOOL_DEF") or not hasattr(mod, "run"):
            continue
        name = mod.TOOL_DEF.get("name")
        if not name or name in BUILTIN_TOOL_MAP:
            continue
        result[name] = {"def": mod.TOOL_DEF, "run": mod.run, "file": fn}
    return result
```

A load failure does not crash anything; print the reason and skip. One broken plugin should not take down the whole Agent.

MCP: another process, speaking a standard protocol

The MCP background thread runs an asyncio event loop. The main thread submits work through `run_coroutine_threadsafe` and waits for the result:

```python
MCP_LOOP = None
MCP_THREAD = None

def _start_mcp_loop():
    global MCP_LOOP, MCP_THREAD
    MCP_LOOP = asyncio.new_event_loop()

    def run():
        asyncio.set_event_loop(MCP_LOOP)
        MCP_LOOP.run_forever()

    MCP_THREAD = threading.Thread(target=run, daemon=True)
    MCP_THREAD.start()

def _mcp_call_tool_sync(server_name, tool_name, args):
    session = MCP_SESSIONS[server_name]["session"]

    async def _call():
        return await session.call_tool(tool_name, args)

    fut = asyncio.run_coroutine_threadsafe(_call(), MCP_LOOP)
    return fut.result(timeout=60)
```

Why not call `asyncio.run` directly on the main thread? Because the main thread already has a synchronous conversation loop. Two sides fighting over the event loop will deadlock.

In a real log, one MCP query looks like this:

```json
{"ts": 1793194714.657, "kind": "mcp_call", "server": "sqlite", "tool": "list_tables", "elapsed": 0.007, "result_preview": "users"}
{"ts": 1793194715.738, "kind": "mcp_call", "server": "sqlite", "tool": "query", "elapsed": 0.018, "result_preview": "(2,)"}
{"ts": 1793194717.515, "kind": "mcp_call", "server": "sqlite", "tool": "query", "elapsed": 0.004, "result_preview": "(1, 'Alice', 30)\n(2, 'Bob', 25)"}
```

Three calls, three steps. The log shows exactly what the MCP process returned: first list the tables, then count the rows, then pull the full table to verify.

Skills: a `SKILL.md` file that is essentially a prompt

Scan `SKILL.md` under `skills/`, parse the `---` front matter, and use the body as a prompt:

```python
def _parse_frontmatter(text):
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    fm_text = text[3:end].strip()
    body = text[end + 4:].lstrip("\n")
    meta = {}
    for line in fm_text.split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip().strip('"').strip("'")
    return meta, body
```

`use_skill` returns the body and the list of attached files to the model, and the model follows the steps itself. It does not change code; it only changes the prompt.

How to choose among the three

| Path | What it is | Who maintains it | When to use it |
| --- | --- | --- | --- |
| Plugin | A local `.py` file with `TOOL_DEF` and `run()` | You | A tool only you need |
| MCP | Another process speaking a standard protocol | Someone else | An existing system must be exposed to multiple applications |
| Skills | A `SKILL.md`, essentially a prompt | Operations / business | A multi-step process that does not change code |

This order is not by sophistication; it is by **cost of change**. A plugin change requires a restart. An MCP change requires changing the other side. A Skills change is a text edit. If Skills can solve it, don't write a plugin.

## 13. Program bookkeeping: turn "it says it is done" into "the program can prove it"

All previous brakes say "you may not". This section changes direction: **the program keeps its own books, and checks them before answering.**

```python
def check_before_answer(facts):
    warnings = []

    # Check 1: .py files changed but nothing verified
    if facts["modified_py"] and not facts["ran_test"]:
        files = sorted(facts["modified_py"])[:3]
        more = " etc." if len(facts["modified_py"]) > 3 else ""
        warnings.append(
            f"You modified Python files {files}{more}, but did not run any tests or import checks. "
            f"Consider using run_shell to run pytest or a python -c check."
        )

    # Check 2: shell failures were ignored
    if facts["shell_failures"]:
        fails = facts["shell_failures"][:2]
        warnings.append(
            f"These commands failed but were not handled: {fails}. Handle the errors or explain why."
        )

    return warnings
```

`facts` has only three fields: which `.py` files were modified, whether any test ran, and which commands returned a nonzero exit code. These are not reported by the model; they are recorded by the tool executor as a side effect:

```python
def update_facts_from_tool(tool_name, tool_args_str, result, facts):
    try:
        args = json.loads(tool_args_str or "{}")
    except json.JSONDecodeError:
        args = {}

    if tool_name in ("write_file", "edit_file"):
        path = args.get("path", "")
        if path.endswith(".py"):
            facts["modified_py"].add(path)

    if tool_name == "run_shell":
        cmd = args.get("command", "")
        cmd_lower = cmd.lower()
        if ("pytest" in cmd_lower or
            ("python" in cmd_lower and ".py" in cmd_lower) or
            "python3 -c" in cmd_lower or "python -c" in cmd_lower):
            facts["ran_test"] = True

        r = str(result)
        if "[exit code " in r:
            try:
                tag = r.split("[exit code ")[-1].split("]")[0].strip()
                if int(tag) != 0:
                    facts["shell_failures"].append(cmd[:60])
            except Exception:
                pass
```

Why is this more important than all the interception above? Because most of those failures can still be caught by limits and interception. Only one cannot — **it finished, and it believes it did the right thing**. It changed five files, ran nothing, and then said "done". That kind of delivery explodes in the customer's hands, and when it does, you cannot say which step was wrong.

A real run: the check really does block

On 2026-10-28 I reran the current version and asked it to change `Hello Agent` to `Hello Pi` in `sandbox/hello.py`, and explicitly said "do not run any commands".

It made the change, read it back to confirm, and was about to wrap up when the objective check stopped it. Here is an excerpt:

```text
Done: `print("Hello Agent")` in `sandbox/hello.py` has been changed to `print("Hello Pi")`. Only this one place was modified; no commands were run.

  [verification check] issue found; asking the Agent to continue fixing (attempt 1/2):
    - You modified Python files ['sandbox/hello.py'], but did not run any tests or import checks.

My conclusion has not changed; you need to make a decision here.
You explicitly said "do not run any commands", so I did not execute run_shell...
```

This is a good example of two things:

1. **The check is triggered by facts, not by the model's self-report.** The model saying "done" does not help. If `modified_py` is nonempty and `ran_test` is false, it triggers.

2. **The check can conflict with an explicit human instruction.** The user says "do not run commands"; the check says "you must run tests". The current version leaves this conflict to the model to explain; there is no program-level "skip for this run" mechanism. That is debt.


The check is still crude

`ran_test` is judged from the command string, not from the result. Worse: **if the user denies the command, it is still recorded as "ran"**.

In another run of the four file tools, it tried to verify with `python sandbox/hello.py`, but the confirmation step was denied. `ran_test` was still set to true, so the check did not block again.

So the value of this check is "better than nothing", not "reliable". The next step needs at least three fixes:

- Count only commands with exit code 0 as verification.

- Distinguish "ran tests" from "ran a script".

- Give the user an explicit "skip verification for this run" switch.


The original log is at `logs/samples/verify_rerun_20261028_224113.jsonl`.

## 14. Logs and memory: investigate incidents, remember for next time

The smallest unit of a log is one tool call

The current log is jsonl: write one line for every event.

```python
LOG_DIR = os.path.join(WORKSPACE, "logs")
SESSION_ID = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
LOG_FILE = os.path.join(LOG_DIR, f"session_{SESSION_ID}.jsonl")
_LOG_FH = None

def log_event(kind, **fields):
    if _LOG_FH is None:
        return
    rec = {"ts": round(time.time(), 3), "kind": kind, **fields}
    try:
        _LOG_FH.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except Exception:
        pass
```

There are not many event types:

| kind | When it is written | Key fields |
| --- | --- | --- |
| `session_start` | Session starts | `model`, `base_url`, `workdir` |
| `llm_call` | Every model call | `step`, `prompt_tokens`, `completion_tokens`, `elapsed` |
| `tool_call` | Every tool execution | `name`, `args_preview`, `result_preview`, `elapsed` |
| `mcp_call` | Every MCP call | `server`, `tool`, `elapsed`, `result_preview` |
| `sub_agent_start` / `sub_agent_end` | Start and end of a sub-agent | `profile`, `task`, `elapsed` |
| `assistant_final` | Final answer | `text` |
| `session_end` | Session ends | `llm_calls`, `tool_calls`, `mcp_calls`, token totals |

**The smallest unit of a log is one tool call, not one session.** If you don't do this, after an incident you only see "the end was wrong" with a blank in the middle. That kind of log is as good as none.

In a real log, a five-step counting task restored as a terminal view looks like this:

```text
[step 1] run_shell → 3657
 27469 total
[exit code 0]

[step 2] run_shell → 3631 ./.venv
...
[step 3] run_shell → 12918
[exit code 0]

[step 4] run_shell → 12918 total
  1766 ./Tiny-Agent-v8.0.py
  1560 ./Tiny-Agent-v7.0.py
  ...

[step 5] final answer: 26 files, 12,918 lines total
```

That session wrote 19 log lines. Without logs, you see only the last line. With logs, all five steps are there.

| Without logs | With logs |
| --- | --- |
| Only the last sentence: "26 files, 12,918 lines total" | Five steps, six tool calls, tokens and elapsed time per step |
| No idea why it looked at `.venv` | You can see step 2 counted directories first, and step 3 excluded them |
| After an incident, rerun from scratch | Jump directly to the failing step |

Memory: remember conventions, not conclusions

The `remember` tool writes content into `AGENT.md`. The next time a new session starts, it is automatically appended to the system prompt:

```python
MEMORY_FILE = os.path.join(WORKSPACE, "AGENT.md")

def load_memory():
    if not os.path.isfile(MEMORY_FILE):
        return ""
    with open(MEMORY_FILE, "r", encoding="utf-8") as f:
        return f.read().strip()

def append_memory(content):
    try:
        is_new = not os.path.isfile(MEMORY_FILE)
        with open(MEMORY_FILE, "a", encoding="utf-8") as f:
            if is_new:
                f.write("# Project memory\n")
            ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
            f.write(f"\n## {ts}\n{content.strip()}\n")
        return f"remembered in {os.path.basename(MEMORY_FILE)}"
    except Exception as e:
        return f"failed to write memory: {e}"
```

At startup:

```python
memory = load_memory()
if memory:
    base += "\n\n## Project memory (from AGENT.md)\n" + memory
```

On 2026-10-28 I reran the current version and asked it to remember two new conventions:

```text
> Remember: this project deploys with docker compose and logs with loguru
[step 1] calling tools: ['remember', 'remember']
[step 1] remember → remembered in AGENT.md
[step 1] remember → remembered in AGENT.md
AI: Remembered two project conventions: 1. deployment uses docker compose 2. logging uses loguru
```

The corresponding two raw `tool_call` lines:

```json
{"ts": 1793194732.658, "kind": "tool_call", "name": "remember", "args_preview": "{\"content\": \"deployment uses docker compose\"}", "result_preview": "remembered in AGENT.md", "elapsed": 0.0}
{"ts": 1793194732.658, "kind": "tool_call", "name": "remember", "args_preview": "{\"content\": \"logging uses loguru\"}", "result_preview": "remembered in AGENT.md", "elapsed": 0.0}
```

In another session, the same conventions were already in `AGENT.md`. It first used `read_file` to confirm and did not write them again — you can see that step in the log.

Memory should only store two kinds of things: **conventions** and **preferences** — this project uses pytest; code style uses black. Do not store conclusions. Data from the previous run or a temporary judgment, once stored, becomes a landmine for the next run. It will answer today's question with a three-day-old conclusion, and it will sound completely confident.

The original logs are at `logs/samples/logging_20260929_190304.jsonl` (five-step count) and `logs/samples/memory_rerun_20261028_213850.jsonl` (remember).

## 15. Acceptance criteria and pitfalls

Three criteria, each testable on the spot:

1. **Name the three limits:** steps, wall clock and cost. If you cannot name them, they do not exist.

2. **Demonstrate "it stopped"**, not a successful run. Succeeding is not a skill.

3. **Point to why it stopped last time:** find that step in the log. If you cannot, you are keeping a pet in a black box.


The current version's self-check table

| Item | Current state | Risk |
| --- | --- | --- |
| Step limit | `max_steps=8`, sub-agent 6 | Present, but only stops infinite loops |
| Wall clock | No per-turn deadline | It can run for a long time and never stop |
| Cost | No token or money budget | One session can burn through the budget |
| Repetition detection | None | The same tool and arguments can loop forever |
| `read_file` truncation | None | Large files eat context |
| `list_dir` filtering | Does not skip `.venv` / `__pycache__` | Large directories flood the output |
| Parallelism criterion | Only excludes `run_shell` | `code` sub-agents can also modify files in parallel |
| `ran_test` | Judged from the command string | A denied command is still recorded as "ran" |
| Platform | `termios` / `tty` | Does not run on Windows from v4.2 |
| MCP | Depends on `python3` and the `mcp` package | Cannot connect when the venv is not active |

This table is not self-flagellation; it is how you prioritize the next step. **Being able to say clearly what is not done is better than pretending everything is done.**

Four pitfalls

**Pitfall 1: looking only at demos, not failures.** Vendor demos always take the smoothest path. Ask three questions during acceptance: what does it do when the task is unclear, what does it do when a tool fails, and does it have a way to know when the answer is wrong? If the third answer is missing, the first two are probably luck.

**Pitfall 2: treating "free planning" as a capability metric.** At a bank customer, **predictability is worth more than intelligence**. A customer can accept a system that is inflexible but behaves consistently. They cannot accept one that is occasionally brilliant and occasionally insane.

**Pitfall 3: logging only the final result.** After an incident you see only "the end was wrong" with a blank in the middle. The smallest unit of a log is one tool call, not one session.

**Pitfall 4: thinking a step limit makes it safe.** This whole article has been about this. The limit controls "how long it runs", not "which direction it runs in".

**Pitfall 5: writing the rule in the function name but not in the criterion.** `profile_can_parallel` reads like "only read-only roles may run in parallel", but the actual criterion is only "does not contain `run_shell`". `code` sub-agents can still modify files in parallel. A name is not a brake; the criterion is.

Appendix: version evolution

The article is not organized by version, but the version chain is evidence. It answers "in which version did this capability first appear", not "the reader must write it twenty times".

| Version | File | What it added |
| --- | --- | --- |
| v1.0 | `v1.0_loop.py` | Two tools + loop + step limit |
| v1.1 | `v1.1_no_loop.py` | Removed the loop as a control |
| v2.0 | `v2.0_loop_back.py` | Loop restored; exit condition written into code |
| v2.1 | `v2.1_multi_turn.py` | Session state moved outside the function |
| v2.2 | `v2.2_single_exec_stream.py` | One tool execution at a time + streaming |
| v2.3 | `v2.3_step_mode.py` | Single-step pause (side branch, never in the main line) |
| v3.0 | `v3.0_file_tools.py` | Four file tools + workspace boundary |
| v3.1 | `v3.1_shell_guard.py` | Shell allowlist / audit / confirmation / timeout |
| v3.2 | `v3.2_search.py` | `grep` / `find_files` |
| v4.0 | `v4.0_context_trim.py` | Trim history by turn |
| v4.1 | `v4.1_slash_commands.py` | Slash commands; constants moved into state |
| v4.2 | `v4.2_model_wizard.py` | Model selection wizard; introduced termios |
| v5.0 | `v5.0_sub_agent.py` | Sub-agents; profile as permission |
| v5.1 | `v5.1_sub_agent_parallel.py` | Parallel read-only tasks (criterion written incorrectly) |
| v6.0 | `v6.0_plugins.py` | Plugins: auto-mount from `tools/` |
| v6.1 | `v6.1_mcp.py` | MCP: background event loop + synchronous calls |
| v6.2 | `v6.2_skills.py` | Skills: `SKILL.md` as a prompt |
| v7.0 | `v7.0_verify_facts.py` | Program bookkeeping + pre-answer checks |
| v8.0 | `v8.0_logging.py` | jsonl logs + `/stats` `/log` |
| v9.0 | `v9.0_memory.py` | Long-term memory in `AGENT.md` |

The complete code, nine real logs, and plugin / Skills / MCP examples are in the Gitee repository:

```text
https://gitee.com/key1088/tiny-agent
```

That is the end of the "Designing an Agent from Scratch" tutorial. There is quite a lot of material. I originally intended to explain the principles of Agents briefly, but Agents have become too important, and before I knew it I had written a lot.

These articles are enough for an FDE engineer to understand Agents. But if you want to do Agent development, you will need to go deeper. I may summarize that separately when I have a chance.

* * *

## Links to all three parts:

**Part 1:** [**Designing an Agent from Scratch (Part 1)**](/docs/09-ai-eng-agent-1/)

**Part 2:** [**Designing an Agent from Scratch (Part 2)**](/docs/09-ai-eng-agent-2/)

* * *

**The AI-FDE Transition Path**: for IT implementation, pre-sales and operations people who don't write code, turning existing delivery skills into AI skills. The full series has 55 articles across six modules and 53 skills.

Want to see what you're missing first? The AI-FDE skill self-assessment map scores 53 items and produces a radar chart. [The AI-FDE Transition Path · Introduction](/docs/00-intro/)

![](/media/docs/09-ai-eng-agent-3/img-01.png)
