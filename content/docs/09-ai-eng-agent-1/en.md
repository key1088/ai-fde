> This is **Part 1** of the three-part series "Designing an Agent from Scratch", covering the first seven sections of the design.
> The route: what an Agent is → the big picture → the minimal loop → stop lines → observability → the four file tools.
> Part 2 starts with shell; Part 3 covers extensions, bookkeeping and acceptance.

## 1. An Agent is a piece of software that lets the model act

There is exactly one thing the model can do by itself: **give it some text, and it continues with more text.**

It cannot see files on your server, press buttons in your system, or query your database. If you ask "is this credit application's material complete?", it can only guess from what you pasted into the prompt — and it can guess very convincingly.

An Agent is a layer of software around the model that gives it three things:

| What it gives | What it is | What happens without it |
| --- | --- | --- |
| Hands | A set of tools: read files, call APIs, run commands | It can talk but not act |
| Back-and-forth | A loop: do one step, inspect the result, decide the next step | It can take one step, and if that step is wrong, it stays wrong |
| A way to stop | Exit conditions: when the task is done, and when it must stop | It cannot stop |

**One sentence: an Agent is the piece of code that turns the model from "talking" into "doing".**

What can it do? Concretely:

- A relationship manager asks "what is still missing from this credit application?" It calls three APIs and lists the missing items. The need exists only as APIs; there is no ready-made screen.

- A batch of policy documents must be re-filed under a new directory structure. It reads them, decides where each belongs, moves them, and writes a change record.

- After a code change, it runs the tests itself. If they fail, it reads the logs and tries again until they pass, or until it hits a limit and stops.


It is just as important to say what it cannot do. These three points matter more than the capabilities:

1. **It does not understand the business better than you do.** Business rules live in your policy documents, API contracts and approval standards, not in the model. The Agent applies the rules; it does not invent them for you.

2. **It does not guarantee correctness; it guarantees traceability.** The certainty it provides is "every step left a trace", not "the conclusion is right".

3. **It should not touch actions that require one hundred percent certainty.** Transfers, deductions, bulk deletes — write those as fixed code branches. Do not let it decide on the spot.


## 2. The difference between an Agent and an agent application

When most people say "agent" today, they mean an **agent application**: on platforms such as Coze, Dify or Bailian, you pick a model, attach a knowledge base, wire a few flows, add a chat box, and hit publish. A business user can build one after two days of training.

The Agent in this article is not that. It lives one layer below.

An analogy: **an agent application is the whole car; an Agent is the engine.**

Low-code platforms sell the whole car — it drives, and it comes with a speed limiter. For most business needs, the whole car is enough. But you will eventually hit three cases: you need to connect an intranet system the platform cannot reach; you need to add your own interlock before a dangerous action; or you need to explain to the customer exactly what it did at every step. The whole car does not let you change those three things.

Compare them side by side:

| Dimension | Agent application | The Agent designed in this article |
| --- | --- | --- |
| What it is | A product you open and use | A runtime that another program can call |
| Who uses it | End users, humans | Another program, or a larger system |
| Who sets the boundary | The platform sets it; you arrange things inside the box | You set it; wherever you write it is where it applies |
| What it looks like | A UI, an entry point, a publish button | A function `run_agent_turn(messages)` |
| Main risks | Wrong answers, broken flows, poor experience | Changing the wrong thing, failing to stop, inability to investigate afterwards |
| How to investigate an incident | Read the conversation history | Read the tool-call log of every step |
| Who builds it | Business users can build one | Someone who can read code |

So what exactly are we designing? Concretely:

**We are designing the loop, plus three layers of brakes around it.** The loop can be described in one sentence: call the model; the model says it wants to call a tool; execute the tool; put the result back into history; call the model again; stop when it no longer asks for a tool, or when it hits a limit.

The loop itself is a few dozen lines. The hard part is making it survive in production. The next dozen sections are all about patching the holes in this loop.

## 3. The big picture first: one loop, three layers of brakes

Before we take the code apart, look at the overall structure of the current version.

It is not a "very smart Agent". It is **a loop that has been fenced in**. From the outside in, there are six layers:

| Layer | Problem it solves | Current implementation |
| --- | --- | --- |
| Loop layer | How one turn runs and when it stops | `run_agent_turn`, `max_steps=8` |
| Tool layer | What it can and cannot do | Four file tools, `run_shell`, `grep`, `find_files`, plugins, MCP, Skills |
| Boundary layer | What happens if it breaks something | `_safe_path`, `SAFE_CMDS`, human confirmation, timeouts, sub-agent profiles |
| Context layer | What happens when history gets too long | `trim_messages`, `[:3000]`, `max_results` |
| State layer | How the runtime is adjusted | `messages`, `state`, slash commands, model configuration |
| Acceptance layer | How you know it actually finished | `facts` / `check_before_answer`, jsonl logs, `AGENT.md` |

Of the six layers, three are the brakes that actually stop accidents:

| Brake | Where it is installed | What it is |
| --- | --- | --- |
| Tool-layer brake | Where the model cannot see | Path boundary, command allowlist, script audit, human confirmation, timeout |
| State-layer brake | In the loop and context | Step limit, per-turn trimming, single-output truncation, sub-agent permissions |
| Acceptance-layer brake | Before the final answer | Program bookkeeping, objective checks, per-call logs, long-term memory |

**"Do not delete files" written in the system prompt is a request, not a brake.** The model can ignore it, and it often does — not because it is malicious, but because it reinterprets that sentence every time. Something that actually stops it must live where the model cannot see or change it.

## 4. The minimal loop: one `run_agent_turn`

First make the loop run. The core function in the current version is `run_agent_turn`. With logging, bookkeeping and sub-agent branches removed, the skeleton looks like this:

```python
def run_agent_turn(client, model, messages, state, max_steps=8, verbose=True):
    for step in range(1, max_steps + 1):
        stream = client.chat.completions.create(
            model=model, messages=messages, tools=TOOLS,
            tool_choice="auto", stream=True,
        )

        content = ""
        acc = {}
        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta.content:
                print(delta.content, end="", flush=True)
                content += delta.content
            for tc in delta.tool_calls or []:
                i = tc.index
                acc.setdefault(i, {"id": "", "name": "", "arguments": ""})
                if tc.id:
                    acc[i]["id"] = tc.id
                if tc.function:
                    if tc.function.name:
                        acc[i]["name"] = tc.function.name
                    if tc.function.arguments:
                        acc[i]["arguments"] += tc.function.arguments

        # No tool calls → it thinks it is done
        if not acc:
            messages.append({"role": "assistant", "content": content})
            return content

        tcs = [acc[i] for i in sorted(acc)]
        messages.append({
            "role": "assistant", "content": content or None,
            "tool_calls": [
                {"id": t["id"], "type": "function",
                 "function": {"name": t["name"], "arguments": t["arguments"]}}
                for t in tcs
            ],
        })

        for t in tcs:
            result = execute_tool_call(t)
            messages.append({
                "role": "tool", "tool_call_id": t["id"], "content": str(result),
            })

    return "(reached max steps, task not completed)"
```

Four things in this code cannot be omitted:

**First, the assistant's `tool_calls` must be written back to history exactly as received.** Do not write only `content`. The next turn needs it to know what it just asked to call.

**Second, every `tool_call` must have a corresponding `tool` message.** The `tool_call_id` must match. One missing message or one wrong id and the API returns 400. This constraint will bite again when we trim history later.

**Third, the exit condition is "no longer asks for tools".** When the model stops returning `tool_calls`, we consider it done. The rule is simple, but it hands the "when to stop" decision to the model — which is why there must be a `max_steps` outside.

**Fourth, `max_steps` is a fuse, not a brake.** It guarantees that the circuit breaks after it burns, not that it will not burn. Eight steps stops an infinite loop; it does not stop "methodically doing the wrong thing eight times".

Why a loop is necessary

If you only call the model twice: the first call decides which tool to use, you execute it, and the second call asks for the answer directly — the second request has no `tools`, so it cannot ask for another tool based on the first result.

Any task that depends on the previous step's result breaks there. The loop is not repetition; it is **another chance to decide**.

## 5. Stop lines: don't install only a step limit

"Knowing when to stop" is harder than "knowing how to do".

The current version has several brakes, but not all of them. Here is the honest state:

| Brake | Current implementation | Status |
| --- | --- | --- |
| Steps | `max_steps=8`; sub-agent `SUB_AGENT_MAX_STEPS=6` | Present |
| Tool timeout | `run_shell` defaults to 30s; MCP calls 60s | Present |
| Wall clock | No per-turn deadline | Debt |
| Cost | No token or money budget | Debt |
| Repetition | No detection of the same tool with the same arguments | Debt |

The step limit is the only hard condition that says "no matter what the model thinks, stop when you reach the limit". It matters, but it only solves "how long it runs", not "which direction it runs in".

An eight-step loop can methodically do eight wrong things. The more common incident in the field is not an infinite loop; it is **going in the wrong direction very smoothly**.

A complete stop-line setup needs at least four brakes:

- **Steps:** how many steps per turn; set a separate limit for sub-agents.

- **Wall clock:** how many seconds per turn. Return when exceeded, regardless of whether the model wants to continue.

- **Cost:** how many tokens or how much money per turn. Stop when exceeded.

- **Repetition:** the same tool with the same arguments appears N times in a row; declare it dead.


The current version has only the first and tool-level timeouts. The other three are explicit debt. Just because an article describes them does not mean they exist.

The smallest wall-clock patch does not require changing the model:

```python
deadline = time.time() + 120
for step in range(1, max_steps + 1):
    if time.time() > deadline:
        return "(turn deadline exceeded; stopped)"
    ...
```

Repetition detection is similar: keep a table of `(name, arguments)` before executing a tool. Reject on the second consecutive hit; end the turn on the third.

## 6. Observability: make sure you can see it first

When an Agent misbehaves, eighty percent of the time is spent on "I don't know what it just did".

The current version has three layers of observability:

**The first layer is streaming.** With `stream=True`, every character the model emits is printed. It is not there to look like a typewriter; it distinguishes three very different situations: "the network is slow", "the model is thinking", and "the tool is stuck".

**The second layer is `verbose`.** Every tool call prints a line:

```text
[step 1] calling tools: ['list_dir', 'read_file']
[step 1] list_dir → [FILE] add.py  (67 bytes) ...
[step 1] read_file → print("Hello China")
[step 2] calling tools: ['edit_file', 'write_file']
[step 2] edit_file → modified sandbox/hello.py
[step 2] write_file → wrote sandbox/note.md (5 chars)
```

These four lines are far more useful than the words "done". They tell you: it first looked at the directory, then read the file, then modified one file and wrote a new one.

**The third layer is `/log` and `/stats`.** `/log` lists the jsonl log in reverse chronological order. `/stats` shows the token count, elapsed time and tool-call count for the current session. The logging section expands on this.

Single-step: a debugging switch that never made it into the main line

Early on I built a single-step mode: after each step, it waits for the user to press Enter, and the user can continue, abort or turn single-step off.

It was useful, but it never entered the main line. The reason is that it only affects debugging, not capability; and putting it into sub-agents, parallelism and logging makes the main flow much more complicated.

The current version uses `verbose` + `/log` instead. If you really need to inspect step by step, you can port `_step_pause` from the v2.3 side branch. It is not complex: one `input()` call, plus handling to fill in the missing `tool` message when the user aborts.

## 7. The four file tools: `read_file` / `write_file` / `edit_file` / `list_dir`

Once an Agent can touch files, the risk shifts from "saying the wrong thing" to "breaking something".

So the first thing in this section is not adding tools; it is **drawing a fence around the Tang Monk first**:

```python
WORKSPACE = os.path.abspath(os.getcwd())

def _safe_path(path: str) -> str:
    """Join a relative path to the workspace and prevent escapes."""
    full = os.path.abspath(os.path.join(WORKSPACE, path))
    if not full.startswith(WORKSPACE + os.sep) and full != WORKSPACE:
        raise ValueError(f"Path escapes the workspace; only {WORKSPACE} is allowed: {path}")
    return full
```

`../../` cannot get out. `/etc/passwd` cannot get out. All four file tools pass through this check first.

**Draw the boundary before giving the tool. The order cannot be reversed.** Give the tool first and add limits later, and the window in between is the accident window.

Four tools, one job each

| Tool | Arguments | Purpose | When to use it | Main risk |
| --- | --- | --- | --- | --- |
| `read_file` | `path` | Read a full UTF-8 file | You know the path and want to see the content | A large file blows up the context |
| `write_file` | `path`, `content` | Create or overwrite the whole file | New file, full rewrite | Silently overwrites the original |
| `edit_file` | `path`, `old_text`, `new_text` | Replace exactly one occurrence | Change a small part of an existing file | Whitespace mismatch; multiple matches |
| `list_dir` | `path="."` | List a directory with types and sizes | Inspect the directory structure first | Directories such as `.venv` flood the output |

None of the four implementations is long, but each hides a design decision:

```python
def read_file(path):
    try:
        with open(_safe_path(path), "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"read failed: {e}"

def write_file(path, content):
    try:
        full = _safe_path(path)
        parent = os.path.dirname(full)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(full, "w", encoding="utf-8") as f:
            f.write(content)
        return f"wrote {path} ({len(content)} chars)"
    except Exception as e:
        return f"write failed: {e}"

def edit_file(path, old_text, new_text):
    try:
        full = _safe_path(path)
        with open(full, "r", encoding="utf-8") as f:
            content = f.read()

        if old_text not in content:
            return f"text to replace not found: {old_text[:50]}..."

        if content.count(old_text) > 1:
            return f"found {content.count(old_text)} matches; provide a more precise old_text"

        with open(full, "w", encoding="utf-8") as f:
            f.write(content.replace(old_text, new_text))
        return f"modified {path}"
    except Exception as e:
        return f"edit failed: {e}"

def list_dir(path="."):
    try:
        full = _safe_path(path)
        if not os.path.isdir(full):
            return f"not a directory: {path}"
        lines = []
        for item in sorted(os.listdir(full)):
            fp = os.path.join(full, item)
            if os.path.isdir(fp):
                lines.append(f"[DIR]  {item}/")
            else:
                lines.append(f"[FILE] {item}  ({os.path.getsize(fp)} bytes)")
        return "\n".join(lines) if lines else "(empty directory)"
    except Exception as e:
        return f"list failed: {e}"
```

The key point of each tool

**`read_file` only reads; it does not decide whether reading is appropriate.** It returns the entire file as-is. That is fine for small files; a large file eats the context directly. The current version has no truncation. That is debt. In production, add `max_bytes` or line-based truncation, and state clearly in the return value that it was truncated.

**`write_file` overwrites, it does not append.** It replaces the whole file and should only be used for "new file" or "full rewrite". To change a small part of an existing file, use `edit_file`. This distinction is not fussiness: once the model uses `write_file` to "change one line", it may write the entire file from memory and the original content is gone.

**The core of `edit_file` is "unique match".** If `old_text` is not found, reject. If it is found multiple times, reject. It would rather make the model retry than guess "which one you meant". This is the most important brake among the four tools.

**`list_dir` gives structure, not content.** It returns `[DIR]` / `[FILE]` and file sizes, so the model first learns "what exists" and then decides "what to read". The current version does not skip `.venv` or `__pycache__`; a large directory floods the output. That is the next hole to fix.

When to use which

- You don't know where the file is: use `grep` or `find_files` first.

- You know the path and want to see the content: `read_file`.

- Create a file or rewrite the whole thing: `write_file`.

- Change a small part of an existing file: `edit_file`.

- Inspect the directory structure first: `list_dir`.


These five actions cover "find, read, create, change, list", which is exactly the minimal loop of file operations. More tools are not better. First make the boundaries of these five clear.

A real run: going through all four tools once

On 2026-10-28 I reran the current version and asked it to do four things in order: list the directory, read a file, change one line, create a new file.

```json
{"ts": 1793198120.316, "kind": "tool_call", "name": "list_dir", "args_preview": "{\"path\": \"sandbox\"}", "result_preview": "[FILE] add.py  (67 bytes)\n[FILE] hello.log  (12 bytes)\n[FILE] hello.py  (126 bytes)", "elapsed": 0.0}
{"ts": 1793198120.316, "kind": "tool_call", "name": "read_file", "args_preview": "{\"path\": \"sandbox/hello.py\"}", "result_preview": "#!/usr/bin/env python3\n# -*- coding: utf-8 -*-\n\n\ndef main():\n    print(\"Hello China\")\n\n\nif __name__ == \"__main__\":\n    main()\n", "elapsed": 0.0}
{"ts": 1793198121.78, "kind": "tool_call", "name": "edit_file", "args_preview": "{\"path\": \"sandbox/hello.py\", \"old_text\": \"    print(\\\"Hello China\\\")\", \"new_text\": \"    print(\\\"Hello Agent\\\")\"}", "result_preview": "modified sandbox/hello.py", "elapsed": 0.0}
{"ts": 1793198121.781, "kind": "tool_call", "name": "write_file", "args_preview": "{\"path\": \"sandbox/note.md\", \"content\": \"done\\n\"}", "result_preview": "wrote sandbox/note.md (5 chars)", "elapsed": 0.0}
```

Restored as a terminal view:

```text
> First list_dir sandbox, then read_file sandbox/hello.py, then edit_file to change Hello China to Hello Agent, and finally write_file to create sandbox/note.md

[step 1] list_dir → [FILE] add.py (67 bytes) / hello.log (12 bytes) / hello.py (126 bytes)
[step 1] read_file → print("Hello China")
[step 2] edit_file → modified sandbox/hello.py
[step 2] write_file → wrote sandbox/note.md (5 chars)
[step 3] read_file → print("Hello Agent")
[step 4] read_file → done
```

Four actions, four tool calls, every step traceable in the log. After editing, it read the file back to confirm. That was not prompted; the `read_file` tool makes confirmation cheap.

The original log is at `logs/samples/files_rerun_20261028_223517.jsonl`.

Debt left by this section

- `read_file` has no size limit; a large file eats the context.

- `list_dir` does not skip `.venv` / `__pycache__`; a large directory floods the output.

- `write_file`'s overwrite risk is constrained only by prompts; there is no program-level "back up before change".

- `edit_file` is sensitive to whitespace; when the model changes indentation, matching often fails.


None of these four can be solved by "adding another tool". They require adding parameters and boundaries in the implementation.

* * *

**That is Part 1.** Part 2 starts with shell: allowlists, script audits, human confirmation, timeouts; then retrieval and context, runtime controls, and sub-agent permissions.

* * *

**The AI-FDE Transition Path**: for IT implementation, pre-sales and operations people who don't write code, turning existing delivery skills into AI skills. The full series has 55 articles across six modules and 53 skills.

Want to see what you're missing first? The AI-FDE skill self-assessment map scores 53 items and produces a radar chart. [The AI-FDE Transition Path · Introduction](/docs/00-intro/)

![](/media/docs/09-ai-eng-agent-1/img-01.png)
