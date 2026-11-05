> 本文是「从零开始设计一个 Agent」三篇中的**下篇**。
> 本篇路线：扩展 → 程序记账 → 日志与记忆 → 验收标准与坑 → 版本附录。
> 上篇把闭环和文件四件套跑通，中篇把命令、上下文、控制和权限补上。下篇解决最后三件事：工具怎么扩展、怎么证明它真的干完了、出事之后怎么查。

## 十二、扩展：插件、MCP、Skills

工具不够用，但不该继续往主程序里堆。当前版本给了三种扩展方式，分别解决三种“谁来维护”的问题。

插件：本机一个 .py

扫 `tools/` 目录，每个 `.py` 只要提供 `TOOL_DEF` 和 `run`，就自动挂成工具：

```python
def scan_and_load_plugins(verbose=True):
    # 节选：省略 TOOL_DEF 类型、重名、run 可调用等检查
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
            print(f"  [插件] 加载失败 {fn}: {e}")
            continue
        if not hasattr(mod, "TOOL_DEF") or not hasattr(mod, "run"):
            continue
        name = mod.TOOL_DEF.get("name")
        if not name or name in BUILTIN_TOOL_MAP:
            continue
        result[name] = {"def": mod.TOOL_DEF, "run": mod.run, "file": fn}
    return result
```

加载失败不崩，打印原因跳过——一个坏插件不该带走整个 Agent。

MCP：另一个进程，按标准协议说话

MCP 的后台线程专门跑 asyncio 事件循环，主线程通过 `run_coroutine_threadsafe` 投过去、等结果：

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

为什么不直接在主线程里 `asyncio.run`？因为主线程自己有一套同步的对话循环，两边抢事件循环会死锁。

真实日志里，一次 MCP 查询是这样：

```json
{"ts": 1793194714.657, "kind": "mcp_call", "server": "sqlite", "tool": "list_tables", "elapsed": 0.007, "result_preview": "users"}
{"ts": 1793194715.738, "kind": "mcp_call", "server": "sqlite", "tool": "query", "elapsed": 0.018, "result_preview": "(2,)"}
{"ts": 1793194717.515, "kind": "mcp_call", "server": "sqlite", "tool": "query", "elapsed": 0.004, "result_preview": "(1, 'Alice', 30)\n(2, 'Bob', 25)"}
```

三次调用、三步，日志里能直接看到 MCP 进程返回了什么：先列表，再数行数，最后拉全表验证。

Skills：一份 SKILL.md，本质是提示词

扫 `skills/` 下的 `SKILL.md`，解析开头的 `---` 元信息，正文当提示词用：

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

`use_skill` 把正文和附加文件清单返回给模型，让模型自己按步骤做。它不改代码，只改提示词。

三者怎么选

| 方式 | 是什么 | 谁维护 | 什么时候用 |
| --- | --- | --- | --- |
| 插件 | 本机一个 `.py`，写 `TOOL_DEF` 和 `run()` | 你 | 只有你用得上的工具 |
| MCP | 另一个进程，按标准协议说话 | 别人 | 已有系统要包出来给多个应用用 |
| Skills | 一份 `SKILL.md`，本质是提示词 | 运营 / 业务 | 步骤多、但不改代码的流程 |

这个排序不是按先进程度，是按**改动成本**。插件改一次要重启，MCP 改一次要改对方，Skills 改一次改个文本。能用 Skills 解决的别写插件。

## 十三、程序记账：让“它说完成了”变成“程序能证明”

前面所有刹车都是“你不许”，这一节换方向：**程序自己记账，答题前先检查。**

```python
def check_before_answer(facts):
    warnings = []

    # 检查 1：改了 .py 但没验证
    if facts["modified_py"] and not facts["ran_test"]:
        files = sorted(facts["modified_py"])[:3]
        more = " 等" if len(facts["modified_py"]) > 3 else ""
        warnings.append(
            f"你修改了 Python 文件 {files}{more}，但没有跑任何测试或导入验证。"
            f"建议用 run_shell 跑 pytest 或 python -c 验证。"
        )

    # 检查 2：shell 失败被忽略
    if facts["shell_failures"]:
        fails = facts["shell_failures"][:2]
        warnings.append(
            f"以下命令执行失败但未被处理：{fails}。请处理错误或说明原因。"
        )

    return warnings
```

`facts` 里只有三个字段：改过哪些 `.py`、有没有跑过测试、哪些命令退出码非 0。这些不是模型自己报的，是执行工具时顺手记下来的：

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
        if "[退出码 " in r:
            try:
                tag = r.split("[退出码 ")[-1].split("]")[0].strip()
                if int(tag) != 0:
                    facts["shell_failures"].append(cmd[:60])
            except Exception:
                pass
```

为什么这条比前面所有拦截都重要？因为前面那些失败，多数还能靠上限和拦截挡住，只有一种挡不住——**它干完了，还觉得自己干对了**。改了五个文件、一次没跑、然后说“已完成”。这种交付到了客户手里才炸，而且炸的时候你说不清是哪一步错的。

真实运行：检查真的会拦

2026-10-28 复跑当前版本，让它把 `sandbox/hello.py` 里的 `Hello Agent` 改成 `Hello Pi`，并明确说“不要跑任何命令”。

它改完、读回确认，然后准备收尾时，客观检查把它拦住了。下面是节选：

```text
已完成：`sandbox/hello.py` 中的 `print("Hello Agent")` 已改成 `print("Hello Pi")`，仅修改了这一处，未执行任何命令。

  [验证检查] 发现问题，让 Agent 继续修正 （第 1/2 次）:
    - 你修改了 Python 文件 ['sandbox/hello.py']，但没有跑任何测试或导入验证。

我的结论没有变化，这里需要你做一个决定。
你明确说“不要跑任何命令”，所以我没有执行 run_shell...
```

这是一个很好的例子，说明两件事：

1. **检查是按事实触发的，不是按模型的自述。** 模型说“已完成”没用，`facts` 里 `modified_py` 非空、`ran_test` 为假，就会触发。

2. **检查会和人的明确指令冲突。** 用户说“不要跑命令”，检查说“必须跑测试”。当前版本把这个冲突交给模型解释，没有程序层的“本次豁免”机制。这是债。


这个检查还很粗

`ran_test` 是按命令字符串判断的，不是按结果。更糟的是：**命令被用户拒绝，也会被记成“跑过”**。

在另一次四件套运行里，它想用 `python sandbox/hello.py` 验证，但确认环节被拒绝，`ran_test` 仍然被置为真，检查就没有再拦。

所以这个检查的价值是“有比没有强”，不是“它已经可靠”。下一步至少要补三件事：

- 只把退出码为 0 的命令算作验证

- 区分“跑了测试”和“跑了一个脚本”

- 给用户一个显式的“本次跳过验证”开关


日志原文在 `logs/samples/verify_rerun_20261028_224113.jsonl`。

## 十四、日志与记忆：出事能查，下次能记

日志的最小单位是一次工具调用

当前版本的日志是 jsonl，每发生一件事写一行：

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

事件类型不多：

| kind | 什么时候写 | 关键字段 |
| --- | --- | --- |
| `session_start` | 会话开始 | `model`、`base_url`、`workdir` |
| `llm_call` | 每次模型调用 | `step`、`prompt_tokens`、`completion_tokens`、`elapsed` |
| `tool_call` | 每次工具执行 | `name`、`args_preview`、`result_preview`、`elapsed` |
| `mcp_call` | 每次 MCP 调用 | `server`、`tool`、`elapsed`、`result_preview` |
| `sub_agent_start` / `sub_agent_end` | 子 Agent 首尾 | `profile`、`task`、`elapsed` |
| `assistant_final` | 最终回答 | `text` |
| `session_end` | 会话结束 | `llm_calls`、`tool_calls`、`mcp_calls`、Token 汇总 |

**日志的最小单位是一次工具调用，不是一次会话。** 这条如果不做，出事之后你只看到“最后是错的”，中间一片空白，那种日志等于没有。

一份真实日志里，5 步统计任务还原成终端视图是这样：

```text
[step 1] run_shell → 3657
 27469 total
[退出码 0]

[step 2] run_shell → 3631 ./.venv
...
[step 3] run_shell → 12918
[退出码 0]

[step 4] run_shell → 12918 total
  1766 ./Tiny-Agent-v8.0.py
  1560 ./Tiny-Agent-v7.0.py
  ...

[step 5] 最终回答：26 个文件，共 12,918 行
```

这一场会话写了 19 行日志。没有日志时，你只能看到最后一行；有日志，5 步都在。

| 没有日志 | 有日志 |
| --- | --- |
| 只看到最后一句“26 个文件，共 12,918 行” | 5 步、6 次工具调用、每步 Token 和耗时 |
| 不知道它为什么查了 `.venv` | 能看到第 2 步先统计目录，第 3 步才排除 |
| 出事后只能重跑 | 直接翻到出错那一步 |

记忆：只记约定，不记结论

`remember` 工具把内容写进 `AGENT.md`，下次开新会话自动拼进 system 提示词：

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
                f.write("# 项目记忆\n")
            ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
            f.write(f"\n## {ts}\n{content.strip()}\n")
        return f"已记入 {os.path.basename(MEMORY_FILE)}"
    except Exception as e:
        return f"记忆写入失败: {e}"
```

启动时：

```python
memory = load_memory()
if memory:
    base += "\n\n## 项目记忆（来自 AGENT.md）\n" + memory
```

2026-10-28 复跑当前版本，让它记两条新约定：

```text
> 记住：这个项目部署用 docker compose，日志用 loguru
[step 1] 调用工具: ['remember', 'remember']
[step 1] remember → 已记入 AGENT.md
[step 1] remember → 已记入 AGENT.md
AI: 已记住两条项目约定：1. 部署使用 docker compose 2. 日志使用 loguru
```

对应的两条 `tool_call` 原始行：

```json
{"ts": 1793194732.658, "kind": "tool_call", "name": "remember", "args_preview": "{\"content\": \"部署使用 docker compose\"}", "result_preview": "已记入 AGENT.md", "elapsed": 0.0}
{"ts": 1793194732.658, "kind": "tool_call", "name": "remember", "args_preview": "{\"content\": \"日志使用 loguru\"}", "result_preview": "已记入 AGENT.md", "elapsed": 0.0}
```

另一次会话里，同样的约定已经在 `AGENT.md` 里，它先 `read_file` 确认，没有再写一遍——日志里能看到这一步。

记忆只记两类东西：**约定**和**偏好**——这个项目用 pytest、代码风格用 black。不记结论。上一轮跑出来的数据、临时判断的答案，记进去就是给下一轮埋雷，它会拿三天前的结论回答今天的问题，而且理直气壮。

日志原文在 `logs/samples/logging_20260929_190304.jsonl`（5 步统计）和 `logs/samples/memory_rerun_20261028_213850.jsonl`（remember）。

## 十五、验收标准与坑

三条标准，每条都能当场做：

1. **说得出三个上限**：步数、墙钟、花费各是多少。说不出来就是没有。

2. **演示一次“它停下来了”**，不是跑成功的场景。会跑成功不算本事。

3. **能指出它上一次为什么停**：翻得出日志里那一步。翻不出来，你就是在黑盒里养宠物。


当前版本的自查表

| 项 | 现状 | 风险 |
| --- | --- | --- |
| 步数上限 | `max_steps=8`，子 Agent 6 | 有，但只挡死循环 |
| 墙钟 | 无整轮 deadline | 跑很久也停不下来 |
| 花费 | 无 Token / 金额预算 | 一次会话可能烧穿 |
| 重复检测 | 无 | 同工具同参数可以一直转 |
| `read_file` 截断 | 无 | 大文件吃上下文 |
| `list_dir` 过滤 | 不跳 `.venv` / `__pycache__` | 目录一大就刷屏 |
| 并行判据 | 只排除 `run_shell` | `code` 子 Agent 也能并行改文件 |
| `ran_test` | 按命令字符串判断 | 命令被拒绝也会记成“跑过” |
| 平台 | `termios` / `tty` | Windows 从 v4.2 起跑不了 |
| MCP | 依赖 `python3` 和 `mcp` 包 | 没激活 venv 时连不上 |

这张表不是自我否定，是给下一步排优先级。**能说清楚哪里没做到，比假装全都做到了强。**

四个坑

**坑一：只看演示，不看失败。** 厂商演示永远走最顺的路径。验收时问三条：任务说不清时它怎么办、工具挂了怎么办、答案是错的时候它有办法知道吗。第三条答不上来的，前面两条基本也是碰运气。

**坑二：把“自由规划”当能力指标。** 在银行客户那儿，**可预测比聪明值钱**。客户能接受一个不灵活但每次行为一致的系统，接受不了偶尔天才、偶尔发疯的系统。

**坑三：日志只留最终结果。** 出事之后你只看到“最后是错的”，中间一片空白。日志的最小单位是一次工具调用，不是一次会话。

**坑四：以为装了步数上限就安全了。** 这一篇从头到尾就在说这件事。上限管的是“转多久”，管不了“往哪转”。

**坑五：把规则写进函数名，没写进判据。**`profile_can_parallel` 名字读起来像“只让只读角色并行”，实际判据只是“不含 `run_shell`”，`code` 子 Agent 照样能并行改文件。名字不是刹车，判据才是。

附录：版本演进表

正文不按版本讲，但版本链是证据。它回答的是“这段能力第一次出现在哪一版”，不是“读者要照着写二十遍”。

| 版本 | 文件 | 补了什么 |
| --- | --- | --- |
| v1.0 | `v1.0_loop.py` | 两工具 + 循环 + 步数上限 |
| v1.1 | `v1.1_no_loop.py` | 拆掉循环做对照 |
| v2.0 | `v2.0_loop_back.py` | 循环装回，退出条件写进代码 |
| v2.1 | `v2.1_multi_turn.py` | 会话状态提到函数外 |
| v2.2 | `v2.2_single_exec_stream.py` | 一次执行一个工具 + 流式 |
| v2.3 | `v2.3_step_mode.py` | 单步暂停（旁支，未进主线） |
| v3.0 | `v3.0_file_tools.py` | 文件四件套 + 工作区边界 |
| v3.1 | `v3.1_shell_guard.py` | shell 白名单 / 审计 / 确认 / 超时 |
| v3.2 | `v3.2_search.py` | `grep` / `find_files` |
| v4.0 | `v4.0_context_trim.py` | 按轮裁剪历史 |
| v4.1 | `v4.1_slash_commands.py` | 斜杠命令，常量挪进 state |
| v4.2 | `v4.2_model_wizard.py` | 模型选择向导；引入 termios |
| v5.0 | `v5.0_sub_agent.py` | 子 Agent，profile 即权限 |
| v5.1 | `v5.1_sub_agent_parallel.py` | 只读任务并行（判据没写对） |
| v6.0 | `v6.0_plugins.py` | 插件：`tools/` 自动挂载 |
| v6.1 | `v6.1_mcp.py` | MCP：后台事件循环 + 同步调用 |
| v6.2 | `v6.2_skills.py` | Skills：`SKILL.md` 当提示词 |
| v7.0 | `v7.0_verify_facts.py` | 程序记账 + 回答前检查 |
| v8.0 | `v8.0_logging.py` | jsonl 日志 + `/stats``/log` |
| v9.0 | `v9.0_memory.py` | 长期记忆 `AGENT.md` |

完整代码、九份真实日志、插件 / Skills / MCP 示例都在 Gitee仓库：

```text
https://gitee.com/key1088/tiny-agent
```

从零开始设计一个Agent的教程就到此为止了，内容还是比较多，本来想着简单了解Agent的原理，但是发展Agent太重要了，不知不觉就写多了。

这些文章对于FDE工程师了解Agent是足够了。但是如果要做Agent开发，那就需要再进行深入的研究了，这块后续有机会可以再总结。

* * *

## 三篇回链：

**上篇：**[**从零开始设计一个 Agent（上篇）**](/zh/docs/09-ai-eng-agent-1/)

**中篇：**[**从零开始设计一个 Agent（中篇）**](/zh/docs/09-ai-eng-agent-2/)

* * *

**《AI-FDE 转型之路》**：写给不写代码的 IT 实施 / 售前 / 运维，把已有的交付能力「AI 化」。全系列 55 篇，六大模块 53 项技能。

想先看看自己缺什么：AI-FDE 技能自评地图，53 项打分，出一张雷达图。[AI-FDE 转型之路 · 开篇](/zh/docs/00-intro/)

![](/media/docs/09-ai-eng-agent-3/img-01.png)
