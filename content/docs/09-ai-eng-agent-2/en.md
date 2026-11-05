> This is **Part 2** of the three-part series "Designing an Agent from Scratch".
> The route: four layers of shell interception → retrieval and context → control commands → sub-agents.
>
> Part 1 recap: the loop runs, stop lines are installed, and the four file tools have boundaries. Part 2 starts touching more dangerous things: commands, context, runtime parameters and permissions.

## 8. Shell: put the interception in the tool layer

File tools handle "changing files". Shell handles "running commands". The latter is an order of magnitude riskier: file tools change files inside the workspace, while shell can touch the whole system.

So `run_shell` is not a wrapper around `subprocess.run`. It is four layers of interception:

```python
SAFE_CMDS = {"ls", "cat", "head", "tail", "wc", "find", "grep", "tree",
             "pwd", "whoami", "date", "echo", "diff", "stat", "file"}
CONFIRM_CMDS = {"python", "python3", "pip", "pip3", "pytest", "git", "make", "npm", "node"}
ALLOWED = SAFE_CMDS | CONFIRM_CMDS
DANGEROUS_PY = ["os.system", "os.popen", "subprocess", "shutil.rmtree", "shutil.move",
                "eval(", "exec(", "__import__", "os.remove", "os.unlink", "os.rmdir",
                "os.removedirs", "os.rename", "os.chmod", "os.chown", "pty.spawn", "socket."]

def _audit(path):
    try:
        full = _safe_path(path)
        if not os.path.isfile(full):
            return ""
        with open(full, "r", encoding="utf-8", errors="ignore") as f:
            c = f.read()
        for t in DANGEROUS_PY:
            if t in c:
                return f"script contains a dangerous call: {t}"
        return ""
    except Exception as e:
        return f"audit failed: {e}"

def run_shell(command, timeout=30):
    cmd = command.strip()
    if not cmd:
        return "empty command"
    parts = cmd.split()
    base = os.path.basename(parts[0])
    if base not in ALLOWED:
        return f"command '{base}' is not on the allowlist; rejected"
    if base in {"python", "python3"}:
        if "-c" in parts:
            i = parts.index("-c")
            code = parts[i + 1] if i + 1 < len(parts) else ""
            for t in DANGEROUS_PY:
                if t in code:
                    return f"rejected: -c code contains {t}"
        for p in parts[1:]:
            if not p.startswith("-") and os.path.isfile(_safe_path(p)):
                d = _audit(p)
                if d:
                    return f"rejected: {d}"
    if base not in SAFE_CMDS:
        print(f"\n⚠️  execute: {cmd}")
        if input("Allow? (y/n)").strip().lower() != "y":
            return "user denied execution"
    try:
        r = subprocess.run(cmd, shell=True, cwd=WORKSPACE,
                           capture_output=True, text=True, timeout=timeout)
        out = (r.stdout + r.stderr)[:3000]
        rc_note = f"\n[exit code {r.returncode}]"
        return (out if out else "(no output)") + rc_note
    except subprocess.TimeoutExpired:
        return f"timeout (>{timeout}s)\n[exit code -1]"
    except Exception as e:
        return f"execution failed: {e}\n[exit code -1]"
```

The four layers are:

1. **Allowlist:** if `base` is not in `ALLOWED`, reject immediately. `rm`, `mv` and `dd` never get a chance to run.

2. **Script audit:** for `python xxx.py`, read the script first. If it contains `os.remove`, `shutil.rmtree`, `subprocess`, `eval(` or `socket.`, reject.

3. **Human confirmation:** read-only commands need no confirmation. `python`, `git`, `npm` and similar require typing `y`.

4. **Timeout + truncation:** 30 seconds by default; keep only the first 3000 characters of output.


Why the audit's purpose is "leaving a trace", not "security"

That blacklist cannot stop a real attacker. `python` can do anything; one library call that is not on the list bypasses it.

What it really stops is: **the model writing a script to erase its own traces**. Once `os.remove`, `shutil.rmtree` or `subprocess` enters a script, it becomes very hard to reconstruct what happened from the logs afterwards. The reason to block them is preserving auditability, not treating this as a security sandbox.

A real log: one `ls`

On 2026-10-28 I reran the current version and asked it to execute `ls -1` through `run_shell`:

```json
{
  "ts":1793194692.762,
"kind":"tool_call",
"name":"run_shell",
"args_preview":"{\"command\": \"ls -1\"}",
"result_preview":"AGENT.md\ndemo.db\ndemo_project\nlogs\nmcp_servers.json\nmy_sqlite_server.py\nREADME.md\nrequirements.txt\nsandbox\nskills\ntools\nversions\nVERSIONS.md\n\n[exit code 0]",
"elapsed":0.003
}
```

This single line answers four questions: what ran, what came back, how long it took, and what the exit code was.

That time the model first said "12 entries", then corrected itself to 13 — even though the tool had returned 13 lines. Logs do not fix judgment errors, but they let you see at which step it miscounted.

**The tool layer is responsible for blocking; the log layer is responsible for leaving a trace. Neither replaces the other.**

The original log is at `logs/samples/shell_rerun_20261028_213810.jsonl`.

## 9. Retrieval and context: first let it find things, then let it remember

Give it retrieval first; don't make it walk directories one by one

The model does not know where files are. Ask it to "find where this configuration item is used" and it will `list_dir` one directory at a time, then `read_file` one file at a time. Three files later, the context is full.

`grep` and `find_files` solve this:

```python
def grep(keyword, path=".", max_results=50):
    try:
        full = _safe_path(path)
        matches = []
        for root, dirs, files in os.walk(full):
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__"]
            for fn in files:
                if fn.endswith((".pyc", ".pyo", ".so", ".log")):
                    continue
                fp = os.path.join(root, fn)
                try:
                    with open(fp, "r", encoding="utf-8", errors="ignore") as f:
                        for i, line in enumerate(f, 1):
                            if keyword in line:
                                rel = os.path.relpath(fp, WORKSPACE)
                                matches.append(f"{rel}:{i}: {line.rstrip()[:200]}")
                                if len(matches) >= max_results:
                                    return "\n".join(matches) + f"\n...(more than {max_results} matches; truncated)"
                except Exception:
                    continue
        return "\n".join(matches) if matches else f"no matches for '{keyword}'"
    except Exception as e:
        return f"search failed: {e}"
```

Several details were learned the hard way: skip every directory starting with `.`, skip `__pycache__`, skip `.pyc/.pyo/.so/.log`, return at most 50 matches, and explicitly say "truncated" when the limit is reached.

This is not fussiness. The workspace has a `.venv` containing more than three thousand third-party library files. Without these skips, one `grep` is enough to blow up the context.

**Every step the model gropes around costs money and context.** Rather than teaching it "don't rummage", give it something that finds the answer directly.

Then manage context: history can only be trimmed by turn

After multiple turns, history keeps growing. The current version uses `trim_messages` to trim by turn:

```python
def trim_messages(messages, keep_turns):
    if not messages:
        return messages
    sys_msg = None
    start = 0
    if messages[0].get("role") == "system":
        sys_msg = messages[0]
        start = 1
    user_idx = [i for i in range(start, len(messages)) if messages[i].get("role") == "user"]
    if len(user_idx) <= keep_turns:
        return messages
    return ([sys_msg] if sys_msg else []) + messages[user_idx[-keep_turns]:]
```

The reason is hard: a `tool` message must follow an `assistant` message that carries `tool_calls`. The API enforces this pairing. Trimming message by message easily removes the preceding assistant message while leaving the tool message behind, and the next request returns 400.

**A conversation round is a whole; you can only trim whole rounds.**

Context is not inflated by answers; it is inflated by process

Look at a real log: for the single request "count how many lines of Python code I have locally", it took five steps, and input tokens grew from 1537 to 3152.

| Step | Input tokens | What it did |
| --- | --- | --- |
| 1 | 1537 | `find . -name "*.py" | wc -l`, got 3657 files |
| 2 | 1695 | Grouped by directory; found 3631 in `.venv` |
| 3 | 2318 | Excluded `.venv`; 12,918 lines of code |
| 4 | 2694 | Sorted by file; listed the main versions |
| 5 | 3152 | Produced the conclusion |

Of the five steps, only the last two advanced the conclusion. The first two were tuition paid for the same pit.

In the same log, the raw `llm_call` lines look like this (fields trimmed):

```json
{"kind": "llm_call", "step": 1, "prompt_tokens": 1537, "completion_tokens": 132, "elapsed": 0.723, "has_tool_calls": true}
{"kind": "llm_call", "step": 5, "prompt_tokens": 3152, "completion_tokens": 274, "elapsed": 1.344, "has_tool_calls": false}
```

From 1537 to 3152, what grew was not the model's "thinking"; it was the tool output and assistant messages from the previous four steps.

## 10. Adding control commands to the Agent interaction

Once the Agent runs, the next step is "can a human adjust it on the spot?"

The current version turns common operations into slash commands:

| Command | Purpose |
| --- | --- |
| `/help` | List commands |
| `/model` | Switch model, base URL, API key |
| `/verify on\|off` | Turn objective checks on or off |
| `/stats` | Token count, elapsed time, tool calls for this session |
| `/log [N]` | The last N log entries |
| `/memory [add\|clear]` | View, append to, or clear long-term memory |
| `/clear` | Clear conversation history, keep the system message |
| `/turns N` | Keep the last N turns |
| `/tools` | List tools and sub-agent profiles |
| `/plugins` `/skills` `/mcp` | Inspect extension loading |
| `/reload` | Rescan plugins and skills |
| `/save` `/load` | Save or load a session |
| `/exit` | Exit |

These commands are not just "convenient". They move constants that were hard-coded into `state`:

```python
def handle_slash(user_input, messages, state):
    parts = user_input.strip().split(maxsplit=1)
    cmd = parts[0].lower()

    if cmd == "/turns":
        if len(parts) == 1:
            print(f"current turns kept: {state['max_turns']}")
        else:
            try:
                n = int(parts[1])
                if n >= 1:
                    state["max_turns"] = n
                    print(f"[turns kept set to {n}]")
                else:
                    print("turns must be >= 1")
            except ValueError:
                print(f"invalid number: {parts[1]}")

    elif cmd == "/memory":
        if len(parts) == 1:
            m = load_memory()
            print(f"\n=== project memory ===\n{m}\n" if m else "(memory is empty)")
        else:
            sub = parts[1].split(maxsplit=1)
            if sub[0].lower() == "add" and len(sub) > 1:
                print(append_memory(sub[1]))
                _rebuild_system_prompt(messages, state)
            elif sub[0].lower() == "clear":
                if os.path.isfile(MEMORY_FILE):
                    os.remove(MEMORY_FILE)
                _rebuild_system_prompt(messages, state)
                print("[project memory cleared]")

    return True, messages, state
```

**Turning a constant into a parameter looks small, but it is the dividing line between "usable" and "nice to use".** `max_turns` used to be hard-coded; changing it required a restart. Now `/turns 3` takes effect immediately.

The cost: one interaction improvement locks the whole platform

The model-switching wizard needs arrow keys. The current implementation uses `termios`, `tty` and `select`:

```python
import termios
import tty
import select

def read_key():
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        ch = os.read(fd, 1)
        if ch == b"\x1b":
            buf = b""
            for _ in range(4):
                r, _, _ = select.select([fd], [], [], 0.3)
                if not r:
                    break
                b = os.read(fd, 1)
                if not b:
                    break
                buf += b
                if len(buf) >= 2:
                    break
            return {b"[A": "up", b"[B": "down", b"[C": "right", b"[D": "left",
                    b"OA": "up", b"OB": "down", b"OC": "right", b"OD": "left"}.get(buf, "esc")
        if ch in (b"\r", b"\n"):
            return "enter"
        if ch == b"\x03":
            return "ctrl-c"
        if ch == b"\x04":
            return "ctrl-d"
        try:
            return ch.decode("utf-8")
        except Exception:
            return ""
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)
```

These three modules are Unix-specific. Starting with v4.2, this code fails with `ImportError` on the first line on Windows.

A small improvement to the interaction experience locked the whole thing to one platform. **This kind of cost does not appear in the same day's testing. It only appears when someone else tries to use it.**

## 11. Sub-agents: multi-agent calls

When a job is too heavy to fit in one loop, the context cannot carry it either. The current version adds a tool to the main Agent: `call_sub_agent`.

A sub-agent has four roles, and the tools available to each are hard-coded:

```python
SUB_AGENT_PROFILES = {
    "search": {
        "desc": "read-only search and analysis",
        "tools": ["grep", "find_files", "read_file", "list_dir"],
        "system": "You are the search sub-agent. Only find and analyze; do not change files. End with a one-paragraph conclusion.",
    },
    "code": {
        "desc": "read, write and modify code",
        "tools": ["grep", "find_files", "read_file", "write_file", "edit_file", "list_dir"],
        "system": "You are the coding sub-agent. Read, write and modify code. Confirm with read_file before changing anything. End with a brief description of what you did.",
    },
    "shell": {
        "desc": "execute commands",
        "tools": ["run_shell", "read_file", "list_dir"],
        "system": "You are the execution sub-agent. Run commands and report results. End with a conclusion.",
    },
    "general": {
        "desc": "all tools (including plugins, MCP and skills)",
        "tools": "ALL",
        "system": "You are the general sub-agent. You may use all tools. End with a concise conclusion.",
    },
}
```

**A profile is not a personality setting; it is a permission set.** If a search sub-agent wants to write a file, it simply does not have that tool. It is not a prompt persuading it not to write.

The sub-agent tool executor also has a dedicated guard:

```python
if func is None or name == "call_sub_agent":
    result = f"sub-agents may not call: {name}"
```

Without this line, sub-agents call sub-agents layer after layer, and the cost multiplies.

A real run: ask the search sub-agent to find `requests`

On 2026-10-28 I reran the current version and delegated "find how `requests` is used" to the search sub-agent:

```text
[step 1] calling tools: ['call_sub_agent']
┌─ sub-agent(search) started
│  task: recursively search all uses of requests under demo_project...
│  [1] list_dir
│  [1] grep
│  [2] read_file ×3 / list_dir ×2
│  [3] read_file ×2 / grep ×2
└─ sub-agent(search) done (4 steps)
[step 1] sub-agent returned → search complete; no files modified...
```

It found six uses of `requests` in four steps and never touched a write tool. The original log is at `logs/samples/subagent_rerun_20261028_224140.jsonl`.

Parallelism: a criterion that was not written correctly

A later version added parallelism: run multiple sub-agents concurrently with a thread pool.

```python
def profile_can_parallel(profile_name):
    tools = SUB_AGENT_PROFILES.get(profile_name, {}).get("tools", [])
    if tools == "ALL":
        return False
    return "run_shell" not in tools
```

There is a pitfall I did not see clearly at the time: the criterion is "**does not contain `run_shell`**", not "read-only". So `search` can run in parallel, and so can `code` — two code sub-agents modifying the same file are still allowed.

My intent was "only read-only roles may run in parallel", but the code does not say that. Afterwards you cannot tell who changed it or which version is correct.

**A rule written in a function name is not the same as a rule written into the criterion.** This is debt the current version has not paid.

* * *

**That is Part 2.** Part 3 starts with extensions: plugins / MCP / Skills, program bookkeeping, logs and memory.

**Part 1 recap:** [Designing an Agent from Scratch (Part 1)](/docs/09-ai-eng-agent-1/)

* * *

**The AI-FDE Transition Path**: for IT implementation, pre-sales and operations people who don't write code, turning existing delivery skills into AI skills. The full series has 55 articles across six modules and 53 skills.

Want to see what you're missing first? The AI-FDE skill self-assessment map scores 53 items and produces a radar chart. [The AI-FDE Transition Path · Introduction](/docs/00-intro/)

![](/media/docs/09-ai-eng-agent-2/img-01.png)
