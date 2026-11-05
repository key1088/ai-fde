> 本文是「从零开始设计一个 Agent」三篇中的**中篇**。
> 本篇路线：shell 四层拦截 → 检索与上下文 → 控制权 → 子 Agent。
>
> 上篇回顾：循环跑通了，停止线装了，文件四件套也给了边界。中篇开始碰更危险的东西：命令、上下文、运行时参数和权限。

## 八、shell：把拦截装在工具那一层

文件工具解决“改文件”，shell 解决“跑命令”。后者的风险大一个量级：文件工具改的是工作区里的文件，shell 能碰整个系统。

所以 `run_shell` 不是一个 `subprocess.run` 的包装，它是四层拦截：

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
                return f"脚本包含危险调用: {t}"
        return ""
    except Exception as e:
        return f"审计失败: {e}"

def run_shell(command, timeout=30):
    cmd = command.strip()
    if not cmd:
        return "空命令"
    parts = cmd.split()
    base = os.path.basename(parts[0])
    if base not in ALLOWED:
        return f"命令 '{base}' 不在白名单中，已拒绝"
    if base in {"python", "python3"}:
        if "-c" in parts:
            i = parts.index("-c")
            code = parts[i + 1] if i + 1 < len(parts) else ""
            for t in DANGEROUS_PY:
                if t in code:
                    return f"拒绝执行: -c 代码包含 {t}"
        for p in parts[1:]:
            if not p.startswith("-") and os.path.isfile(_safe_path(p)):
                d = _audit(p)
                if d:
                    return f"拒绝执行: {d}"
    if base not in SAFE_CMDS:
        print(f"\n⚠️  执行: {cmd}")
        if input("允许？(y/n)").strip().lower() != "y":
            return "用户拒绝执行"
    try:
        r = subprocess.run(cmd, shell=True, cwd=WORKSPACE,
                           capture_output=True, text=True, timeout=timeout)
        out = (r.stdout + r.stderr)[:3000]
        rc_note = f"\n[退出码 {r.returncode}]"
        return (out if out else "（无输出）") + rc_note
    except subprocess.TimeoutExpired:
        return f"超时（>{timeout}s）\n[退出码 -1]"
    except Exception as e:
        return f"执行失败: {e}\n[退出码 -1]"
```

四层分别是：

1. **白名单**：`base` 不在 `ALLOWED`，直接拒。`rm`、`mv`、`dd` 根本没有进入执行的机会。

2. **脚本审计**：`python xxx.py` 先读脚本内容，出现 `os.remove`、`shutil.rmtree`、`subprocess`、`eval(`、`socket.` 就拒。

3. **人工确认**：只读命令免确认，`python`、`git`、`npm` 这类要输入 `y`。

4. **超时 + 截断**：默认 30 秒，输出只留前 3000 字符。


为什么审计的理由是“留痕”，不是“安全”

那个黑名单挡不住真正的攻击。`python` 可以做任何事，一个没列进去的库调用就能绕过。

它真正挡的是：**模型自己写一段脚本，把痕迹擦掉**。`os.remove`、`shutil.rmtree`、`subprocess` 这些一旦进了脚本，你事后很难从日志里还原它到底干了什么。拦的理由是保留可查性，不是把它当成安全沙箱。

真实日志：一次 ls

2026-10-28 复跑 ，让它用 `run_shell` 执行 `ls -1`：

```json
{
  "ts":1793194692.762,
"kind":"tool_call",
"name":"run_shell",
"args_preview":"{\"command\": \"ls -1\"}",
"result_preview":"AGENT.md\ndemo.db\ndemo_project\nlogs\nmcp_servers.json\nmy_sqlite_server.py\nREADME.md\nrequirements.txt\nsandbox\nskills\ntools\nversions\nVERSIONS.md\n\n[退出码 0]",
"elapsed":0.003
}
```

这一行能回答四个问题：执行了什么、返回了什么、花了多久、退出码是多少。

那次模型先说“12 个条目”，下一句又改成 13 个——工具明明返回了 13 行。日志不解决判断错误，但能让你看见它是在哪一步数错的。

**工具层负责拦，日志层负责留痕，两件事不能互相替代。**

日志原文在 `logs/samples/shell_rerun_20261028_213810.jsonl`。

## 九、检索与上下文：先让它找得到，再让它记得住

先给检索，别让它一个目录一个目录翻

模型不知道文件在哪。你让它“找一下哪里用了这个配置项”，它会一个目录一个目录地 `list_dir`，再一个个 `read_file`，读三个文件上下文就满了。

`grep` 和 `find_files` 解决的就是这个：

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
                                    return "\n".join(matches) + f"\n...(超过 {max_results} 条，已截断)"
                except Exception:
                    continue
        return "\n".join(matches) if matches else f"未找到 '{keyword}'"
    except Exception as e:
        return f"搜索失败: {e}"
```

几个细节是踩出来的：跳过所有以 `.` 开头的目录、跳过 `__pycache__`、跳过 `.pyc/.pyo/.so/.log`、最多返回 50 条、到上限就明说“已截断”。

不是洁癖。工作区里有个 `.venv`，里面躺着三千多个三方库文件。没有这几条跳过，一次 grep 的结果足够把上下文撑爆。

**模型摸索的每一步都在花钱和占上下文。** 与其教它“别乱翻”，不如给它一个能直接翻到的东西。

再管上下文：历史只能按轮裁

多轮对话接起来之后，历史会一直长。当前版本用 `trim_messages` 按轮裁：

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

原因很硬：一条 `tool` 消息必须跟在带 `tool_calls` 的 `assistant` 消息后面，接口认这个配对。按条裁，很容易把前面那条 assistant 裁掉、把 tool 留下，下一次请求直接 400。

**一圈对话是一个整体，裁只能整轮裁。**

上下文不是被答案撑大的，是被过程撑大的

拿一份真实日志看：一句“统计一下我本地 py 代码有多少行”，它走了 5 步，输入 Token 从 1537 涨到 3152。

| 步 | 输入 Token | 这一步干了什么 |
| --- | --- | --- |
| 1 | 1537 | `find . -name "*.py" | wc -l`，得到 3657 个文件 |
| 2 | 1695 | 按目录分布，发现 `.venv` 里有 3631 个 |
| 3 | 2318 | 排除 `.venv` 后，代码 12918 行 |
| 4 | 2694 | 按文件排序，列出主要版本 |
| 5 | 3152 | 给出结论 |

5 步里，真正推进结论的是后两步；前两步都在为同一个坑付学费。

同一份日志里，`llm_call` 的原始行是这样（字段有删减）：

```json
{"kind": "llm_call", "step": 1, "prompt_tokens": 1537, "completion_tokens": 132, "elapsed": 0.723, "has_tool_calls": true}
{"kind": "llm_call", "step": 5, "prompt_tokens": 3152, "completion_tokens": 274, "elapsed": 1.344, "has_tool_calls": false}
```

从 1537 到 3152，涨的不是模型的“思考”，是前面四步的工具输出和 assistant 消息。

## 十、Agent交互时增加控制指令

Agent 跑起来之后，下一步是“人能不能当场调它”。

当前版本把常用操作都做成了斜杠命令：

| 命令 | 作用 |
| --- | --- |
| `/help` | 命令清单 |
| `/model` | 换模型、Base URL、API Key |
| `/verify on|off` | 开关客观检查 |
| `/stats` | 本次会话的 Token、耗时、工具调用次数 |
| `/log [N]` | 最近 N 条日志 |
| `/memory [add|clear]` | 查看、追加、清空长期记忆 |
| `/clear` | 清空对话历史，保留 system |
| `/turns N` | 保留最近 N 轮 |
| `/tools` | 列出工具和子 Agent profile |
| `/plugins` `/skills`  `/mcp` | 看扩展加载情况 |
| `/reload` | 重新扫描插件和技能 |
| `/save` `/load` | 存读会话 |
| `/exit` | 退出 |

这些命令的意义不只是“方便”。它们把原本写死在代码里的常量搬进了 `state`：

```python
def handle_slash(user_input, messages, state):
    parts = user_input.strip().split(maxsplit=1)
    cmd = parts[0].lower()

    if cmd == "/turns":
        if len(parts) == 1:
            print(f"当前保留轮数: {state['max_turns']}")
        else:
            try:
                n = int(parts[1])
                if n >= 1:
                    state["max_turns"] = n
                    print(f"[保留轮数已设为 {n}]")
                else:
                    print("轮数必须 >= 1")
            except ValueError:
                print(f"无效数字: {parts[1]}")

    elif cmd == "/memory":
        if len(parts) == 1:
            m = load_memory()
            print(f"\n=== 项目记忆 ===\n{m}\n" if m else "（记忆为空）")
        else:
            sub = parts[1].split(maxsplit=1)
            if sub[0].lower() == "add" and len(sub) > 1:
                print(append_memory(sub[1]))
                _rebuild_system_prompt(messages, state)
            elif sub[0].lower() == "clear":
                if os.path.isfile(MEMORY_FILE):
                    os.remove(MEMORY_FILE)
                _rebuild_system_prompt(messages, state)
                print("[已清空项目记忆]")

    return True, messages, state
```

**把常量变成参数，这个动作看着小，它是“能用”和“好用”的分界。**`max_turns` 原来写死在代码里，改一次要重启；现在 `/turns 3` 当场生效。

代价：一个交互改进，锁死一个平台

换模型向导要读上下键，当前实现用了 `termios`、`tty`、`select`：

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

这三个模块是 Unix 专有的。从 v4.2 起，这套代码在 Windows 上第一行就 `ImportError`。

一个交互体验上的小改进，把整套东西锁死在一个平台上。**这类代价不会在当天的测试里出现，只会在别人拿去用的时候出现。**

## 十一、子 Agent：多Agent调用

一件事太重，一个循环里塞不下，上下文也扛不住。当前版本给主 Agent 加了一个工具：`call_sub_agent`。

子 Agent 有四种角色，每种能用的工具是写死的：

```python
SUB_AGENT_PROFILES = {
    "search": {
        "desc": "只读搜索分析",
        "tools": ["grep", "find_files", "read_file", "list_dir"],
        "system": "你是搜索子 Agent。只查找和分析，不改文件。最后用一段话给结论。",
    },
    "code": {
        "desc": "读写修改代码",
        "tools": ["grep", "find_files", "read_file", "write_file", "edit_file", "list_dir"],
        "system": "你是编码子 Agent。负责读写和修改代码。改前先 read_file 确认。最后简要说明做了什么。",
    },
    "shell": {
        "desc": "执行命令",
        "tools": ["run_shell", "read_file", "list_dir"],
        "system": "你是执行子 Agent。运行命令并报告结果。最后总结结论。",
    },
    "general": {
        "desc": "通用全部工具（含插件、MCP、技能）",
        "tools": "ALL",
        "system": "你是通用子 Agent。可以用所有工具完成任务。最后给出简洁结论。",
    },
}
```

**profile 不是性格设定，是权限。** 一个 search 子 Agent 想写文件，它根本没有那个工具可用——不是靠提示词劝它别写。

子 Agent 的工具执行处还专门挡了一行：

```text
if func is None or name == "call_sub_agent":
    result = f"子 Agent 不允许调用: {name}"
```

没有这一行，子 Agent 会一层层叫下去，费用是成倍往上翻的。

真实运行：让 search 子 Agent 找 requests

2026-10-28 复跑当前版本，让它把“找 requests 用法”派给 search 子 Agent：

```text
[step 1] 调用工具: ['call_sub_agent']
┌─ 子Agent(search) 启动
│  任务: 在 demo_project 目录下递归搜索所有使用 requests 的位置...
│  [1] list_dir
│  [1] grep
│  [2] read_file ×3 / list_dir ×2
│  [3] read_file ×2 / grep ×2
└─ 子Agent(search) 完成（4 步）
[step 1] 子Agent 返回 → 搜索完成，未修改任何文件...
```

它 4 步找到 6 处 `requests` 用法，没有碰任何写工具。日志原文在 `logs/samples/subagent_rerun_20261028_224140.jsonl`。

并行：一个没有写对的判据

同一版后来加了并行：用线程池同时跑多个子 Agent。

```python
def profile_can_parallel(profile_name):
    tools = SUB_AGENT_PROFILES.get(profile_name, {}).get("tools", [])
    if tools == "ALL":
        return False
    return "run_shell" not in tools
```

这里有一个当时没看清的坑：判据是“**不含 `run_shell`**”，不是“只读”。所以 `search` 能并行，`code` 也能并行——两个 code 子 Agent 同时改同一个文件，照样放行。

我当时的本意是“只有只读角色允许并行”，但代码里没这么写。事后你查不出来是谁改的、哪一个版本是对的。

**规则写在函数名里，不等于写进了判据。** 这是当前版本还没修的债。

* * *

**中篇到这里。** 下篇从扩展开始：插件 / MCP / Skills、程序记账、日志与记忆。

**上篇回顾：**[从零开始设计一个 Agent（上篇）](/zh/docs/09-ai-eng-agent-1/)

* * *

**《AI-FDE 转型之路》**：写给不写代码的 IT 实施 / 售前 / 运维，把已有的交付能力「AI 化」。全系列 55 篇，六大模块 53 项技能。

想先看看自己缺什么：AI-FDE 技能自评地图，53 项打分，出一张雷达图。[AI-FDE 转型之路 · 开篇](/zh/docs/00-intro/)

![](/media/docs/09-ai-eng-agent-2/img-01.png)
