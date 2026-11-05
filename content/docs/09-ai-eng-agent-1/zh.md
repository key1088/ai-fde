> 本文是「从零开始设计一个 Agent」三篇中的**上篇**，覆盖设计主线的前七节。
> 本篇路线：Agent 是什么 → 全貌 → 最小闭环 → 停止线 → 观察 → 文件四件套。
> 中篇从 shell 开始，下篇讲扩展、记账与验收。

## 一、Agent 是让模型能动手的一段程序

模型自己能做的事只有一件：**给它一段文字，它接下一段文字。**

它看不见你服务器上的文件，按不了你系统里的按钮，也查不了你的数据库。你问它“这笔授信的材料齐了没有”，它只能根据你贴给它的内容猜，而且猜得还挺像那么回事。

Agent 就是在模型外面套的一层程序，给它三样东西：

| 给的 | 是什么 | 缺了会怎样 |
| --- | --- | --- |
| 手 | 一组工具：读文件、查接口、跑命令 | 只能说，不能做 |
| 来回 | 一个循环：做完一步看结果，再决定下一步 | 只能做一步，错了也只能错到底 |
| 收手 | 退出条件：什么时候算完，什么时候必须停 | 停不下来 |

**一句话：Agent 是让模型从“说”变成“做”的那段代码。**

它能干什么，具体一点：

- 客户经理问“这笔授信的材料还缺什么”，它去调三个接口，把缺的几项列出来——这个需求只有接口，没有现成页面

- 一批制度文件要按新目录重新归档，它自己读、判断该放哪、移动、写一条变更记录

- 一段代码改完，它自己跑测试，失败了自己看日志再改，直到通过，或者撞上限停下来


也要说清它干不了什么，这三条比能干更要紧：

1. **它不会更懂业务。** 业务规则在你的制度文件、接口约定、审批口径里，不在模型里。Agent 只是把规则用起来，不是替你想规则。

2. **它不保证正确，只保证可查。** 它能给的确定性是“每一步都留了痕”，不是“结论一定对”。

3. **它不该碰要求百分之百确定的动作。** 转账、扣款、批量删除这类，写成固定的代码分支，不要交给它现场判断。


## 二、Agent 与智能体应用的区别

现在市面上说的“智能体”，多数指的是**智能体应用**：在扣子、Dify、百炼这类平台上，选个模型、配个知识库、串几条流程、挂一个对话框，点发布，就是一个应用。业务人员培训两天就能搭出来一个。

这一篇要设计的 Agent 不是这个，它在下面一层。

打个比方：**智能体应用是整车，Agent 是发动机。**

低代码平台卖的是整车——能开，还替你装了限速。你要做的业务，八成用整车就够了。但总会撞上三种情况：要接一个平台接不进的内网系统、要在危险动作前面加自己的拦截、要跟客户解释清楚“它每一步到底干了什么”。这三种，整车都不给你改。

对照着看：

| 维度 | 智能体应用 | 这一篇设计的 Agent |
| --- | --- | --- |
| 是什么 | 一个打开就能用的产品 | 一段能被程序调用的运行时 |
| 谁在用 | 最终用户，人 | 另一个程序，或一个更大的系统 |
| 边界谁定 | 平台定好，你在框里编排 | 你定，写在哪就管到哪 |
| 长什么样 | 有界面、有入口、有发布按钮 | 一个函数 `run_agent_turn(messages)` |
| 主要风险 | 答不准、流程断、体验差 | 改错东西、停不下来、事后查不出原因 |
| 出事怎么查 | 翻对话记录 | 翻每一步的工具调用日志 |
| 谁来做 | 业务人员也能搭 | 要能读代码 |

所以这一篇设计的是什么，说具体：

**我们设计的是那个循环，以及循环外面的三层刹车。** 循环一句话就写完了——调模型，模型说要调工具，执行工具，把结果塞回历史，再调模型，直到它不再要工具，或者撞上上限。

这个循环几十行就能写出来。难的是让它能在生产里待住，后面十几节，全在补这个循环的漏洞。

## 三、先看全貌：一个循环，三层刹车

在拆代码之前，先看现在这个版本的整体结构。

它不是一个“很聪明的 Agent”，而是一个**被围起来的循环**。从外到内，分六层：

| 层 | 解决的问题 | 当前实现 |
| --- | --- | --- |
| 循环层 | 一轮怎么跑、什么时候停 | `run_agent_turn`、`max_steps=8` |
| 工具层 | 能做什么、不能做什么 | 文件四件套、`run_shell`、`grep`、`find_files`、插件、MCP、Skills |
| 边界层 | 改坏了怎么办 | `_safe_path`、`SAFE_CMDS`、人工确认、超时、子 Agent profile |
| 上下文层 | 历史太长怎么办 | `trim_messages`、`[:3000]`、`max_results` |
| 状态层 | 运行时怎么调 | `messages`、`state`、斜杠命令、模型配置 |
| 验收层 | 怎么知道它真干完了 | `facts` / `check_before_answer`、jsonl 日志、`AGENT.md` |

六层里，真正能挡住事故的是三层刹车：

| 刹车 | 装在哪 | 具体是什么 |
| --- | --- | --- |
| 工具层刹车 | 模型看不见的地方 | 路径边界、命令白名单、脚本审计、人工确认、超时 |
| 状态层刹车 | 循环和上下文里 | 步数上限、按轮裁剪、单条输出截断、子 Agent 权限 |
| 验收层刹车 | 最终回答之前 | 程序记账、客观检查、逐次日志、长期记忆 |

**写在系统提示词里的“不要删除文件”是请求，不是刹车。** 模型可以不听，而且它经常不听——不是它坏，是它每次都在重新理解这句话。真正拦得住的东西，必须写在模型看不见、也改不了的地方。

## 四、最小闭环：一个 run_agent_turn

先把循环跑通。当前版本的核心函数叫 `run_agent_turn`，去掉日志、记账、子 Agent 分支之后，骨架是这样：

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

        # 没有工具调用 → 它认为说完了
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

    return "（达到最大步数，未完成任务）"
```

这段代码里有四个不能省的东西：

**第一，assistant 的 `tool_calls` 必须原样写回历史。** 不能只写 `content`。下一轮模型要靠这个知道自己刚才要调什么。

**第二，每个 `tool_call` 必须有一条对应的 `tool` 消息。**`tool_call_id` 要对上。少一条、错一个 id，接口直接 400。这个约束在后面裁剪历史时还会再咬一次。

**第三，退出条件是“不再要工具”。** 模型不再返回 `tool_calls`，就认为它说完了。这个判断很简单，但它把“什么时候停”交给了模型——所以外面必须有 `max_steps`。

**第四，`max_steps` 是保险丝，不是刹车。** 它只保证电路烧了之后会断，不保证不烧。八步挡得住死循环，挡不住“在错误方向上有条不紊地跑八步”。

为什么必须有循环

如果只调两次模型：第一次让它决定调什么工具，执行完，第二次直接要答案——第二次请求里没有 `tools`，它就没法根据第一次的结果再要工具。

任务只要依赖上一步的结果，就会断在那里。循环不是重复，是**再决定一次的机会**。

## 五、停止线：别只装一个步数上限

“会停”比“会做”难。

当前版本装了几个刹车，但没装全。先把现状摊开：

| 刹车 | 当前实现 | 状态 |
| --- | --- | --- |
| 步数 | `max_steps=8`；子 Agent `SUB_AGENT_MAX_STEPS=6` | 有 |
| 工具超时 | `run_shell` 默认 30s；MCP 调用 60s | 有 |
| 墙钟 | 没有整轮 deadline | 债 |
| 花费 | 没有 Token / 金额预算 | 债 |
| 重复 | 没有同工具、同参数的重复检测 | 债 |

步数上限是唯一一个“不管模型怎么想，跑满就停”的硬条件。它很重要，但只解决“转多久”，不解决“往哪转”。

一个八步的循环，可以很有条理地做八件错事。现场更常见的事故不是死循环，是**方向错了还跑得很顺**。

所以完整的停止线至少要有四道：

- **步数**：一轮最多几步；子 Agent 单独设

- **墙钟**：一轮最多多少秒，超了就返回，不管模型还想不想继续

- **花费**：一轮最多多少 Token 或多少钱，超了就停

- **重复**：同一个工具、同一组参数连续出现 N 次，直接判死


当前版本只有第一道和工具级超时。后三道是明确的债，不能因为文章写了就当成已经有了。

一个最小的墙钟补法，不需要改模型：

```python
deadline = time.time() + 120
for step in range(1, max_steps + 1):
    if time.time() > deadline:
        return "（超过本轮时限，已停止）"
    ...
```

重复检测也一样，在工具执行前记一张 `(name, arguments)` 的表，连续命中两次就拒绝，第三次就结束本轮。

## 六、观察：先让自己看得见

Agent 出问题的时候，百分之八十的时间是花在“不知道它刚才干了什么”上。

当前版本有三层观察：

**第一层是流式。**`stream=True`，模型每吐一个字就打印。它不是为了看着像打字机，是为了区分“网络慢”“模型在思考”“工具卡住”这三种完全不同的情况。

**第二层是 `verbose`。** 每次工具调用打印一行：

```text
[step 1] 调用工具: ['list_dir', 'read_file']
[step 1] list_dir → [FILE] add.py  (67 bytes) ...
[step 1] read_file → print("Hello China")
[step 2] 调用工具: ['edit_file', 'write_file']
[step 2] edit_file → 已修改 sandbox/hello.py
[step 2] write_file → 已写入 sandbox/note.md（5 字符）
```

这四行比“已完成”三个字有用得多。它告诉你：它先看了目录，再读了文件，然后同时改了文件、写了新文件。

**第三层是 `/log` 和 `/stats`。**`/log` 把 jsonl 日志按时间倒着列出来，`/stats` 看本次会话的 Token、耗时、工具调用次数。日志那一节会展开。

单步：一个没有进主线的调试开关

早期我做过一个单步模式：每跑完一步停下来，等人敲回车，可以继续、中止、关闭单步。

它有用，但没进主线。原因是它只影响调试，不影响能力；而把它塞进子 Agent、并行、日志这些循环里，会让主流程复杂很多。

当前版本用 `verbose` + `/log` 代替它。如果你确实需要一步一步看，可以把 `_step_pause` 从 v2.3 那个旁支搬过来——它不复杂，核心就是一次 `input()`，加一个中止时补齐 `tool` 消息的处理。

## 七、文件四件套：read_file / write_file / edit_file / list_dir

Agent 一旦能碰文件，风险就从“说错话”变成“改坏了”。

所以这一节的第一件事不是加工具，是**先画圈，圈住唐长老**：

```python
WORKSPACE = os.path.abspath(os.getcwd())

def _safe_path(path: str) -> str:
    """把相对路径拼到工作区，并防止越界"""
    full = os.path.abspath(os.path.join(WORKSPACE, path))
    if not full.startswith(WORKSPACE + os.sep) and full != WORKSPACE:
        raise ValueError(f"路径越界，只能在 {WORKSPACE} 内操作: {path}")
    return full
```

`../../` 走不出去，`/etc/passwd` 也走不出去。四个文件工具全部先过这一道。

**给工具之前先给它画边界，顺序不能反。** 先给工具、后加限制，中间那段窗口就是事故窗口。

四个工具，各管一件事

| 工具 | 参数 | 作用 | 什么时候用 | 主要风险 |
| --- | --- | --- | --- | --- |
| `read_file` | `path` | 读 UTF-8 文件全文 | 知道路径，先看内容 | 大文件会撑爆上下文 |
| `write_file` | `path`、`content` | 新建或整体覆盖 | 新文件、整段重写 | 会静默覆盖原文件 |
| `edit_file` | `path`、`old_text`、`new_text` | 精确替换一处 | 改已有文件的一小段 | 空白字符不匹配、匹配到多处 |
| `list_dir` | `path="."` | 列目录，带类型和大小 | 先看目录结构 | `.venv` 这类目录会刷屏 |

四个工具的实现都不长，但每个都藏着一个设计决定：

```python
def read_file(path):
    try:
        with open(_safe_path(path), "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"读取失败: {e}"

def write_file(path, content):
    try:
        full = _safe_path(path)
        parent = os.path.dirname(full)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(full, "w", encoding="utf-8") as f:
            f.write(content)
        return f"已写入 {path}（{len(content)} 字符）"
    except Exception as e:
        return f"写入失败: {e}"

def edit_file(path, old_text, new_text):
    try:
        full = _safe_path(path)
        with open(full, "r", encoding="utf-8") as f:
            content = f.read()

        if old_text not in content:
            return f"未找到要替换的内容: {old_text[:50]}..."

        if content.count(old_text) > 1:
            return f"找到 {content.count(old_text)} 处匹配，请提供更精确的 old_text"

        with open(full, "w", encoding="utf-8") as f:
            f.write(content.replace(old_text, new_text))
        return f"已修改 {path}"
    except Exception as e:
        return f"编辑失败: {e}"

def list_dir(path="."):
    try:
        full = _safe_path(path)
        if not os.path.isdir(full):
            return f"不是目录: {path}"
        lines = []
        for item in sorted(os.listdir(full)):
            fp = os.path.join(full, item)
            if os.path.isdir(fp):
                lines.append(f"[DIR]  {item}/")
            else:
                lines.append(f"[FILE] {item}  ({os.path.getsize(fp)} bytes)")
        return "\n".join(lines) if lines else "（空目录）"
    except Exception as e:
        return f"列目录失败: {e}"
```

每个工具的关键点

**`read_file` 只负责读，不负责判断该不该读。** 它把整个文件原样返回。文件小的时候很好用，文件大的时候会直接把上下文吃掉。当前版本还没有做截断，这是债；生产里应该加 `max_bytes` 或按行截断，并在返回里明确写“已截断”。

**`write_file` 是覆盖，不是追加。** 它会把原文件整个替换掉，只在“新建文件”或“整段重写”时用。改已有文件的一小段，必须用 `edit_file`。这个区分不是洁癖——`write_file` 一旦被模型用来“改一行”，它很可能把整个文件写成它记得的样子，原来的内容就没了。

**`edit_file` 的核心是“唯一匹配”。** 找不到 `old_text`，拒绝；找到多处，也拒绝。它宁可让模型重试，也不猜“你想改哪一处”。这是四件套里最重要的一个刹车。

**`list_dir` 只给结构，不给内容。** 它返回 `[DIR]` / `[FILE]` 和文件大小，让模型先知道“有什么”，再决定“读哪个”。当前版本没有跳过 `.venv`、`__pycache__`，目录一大就会刷屏；这是下一个要补的洞。

什么时候用哪个

- 不知道文件在哪：先 `grep` 或 `find_files`

- 知道路径，先看内容：`read_file`

- 新建文件、整段重写：`write_file`

- 改已有文件的一小段：`edit_file`

- 先看目录结构：`list_dir`


这五个动作覆盖了“找、看、建、改、列”，也正好是文件操作的最小闭环。工具不是越多越好，先把这五个的边界写清楚。

真实运行：一次把四件套走完

2026-10-28 复跑当前版本，让它按顺序做四件事：列目录、读文件、改一行、新建文件。

```json
{"ts": 1793198120.316, "kind": "tool_call", "name": "list_dir", "args_preview": "{\"path\": \"sandbox\"}", "result_preview": "[FILE] add.py  (67 bytes)\n[FILE] hello.log  (12 bytes)\n[FILE] hello.py  (126 bytes)", "elapsed": 0.0}
{"ts": 1793198120.316, "kind": "tool_call", "name": "read_file", "args_preview": "{\"path\": \"sandbox/hello.py\"}", "result_preview": "#!/usr/bin/env python3\n# -*- coding: utf-8 -*-\n\n\ndef main():\n    print(\"Hello China\")\n\n\nif __name__ == \"__main__\":\n    main()\n", "elapsed": 0.0}
{"ts": 1793198121.78, "kind": "tool_call", "name": "edit_file", "args_preview": "{\"path\": \"sandbox/hello.py\", \"old_text\": \"    print(\\\"Hello China\\\")\", \"new_text\": \"    print(\\\"Hello Agent\\\")\"}", "result_preview": "已修改 sandbox/hello.py", "elapsed": 0.0}
{"ts": 1793198121.781, "kind": "tool_call", "name": "write_file", "args_preview": "{\"path\": \"sandbox/note.md\", \"content\": \"done\\n\"}", "result_preview": "已写入 sandbox/note.md（5 字符）", "elapsed": 0.0}
```

还原成终端视图：

```text
> 先 list_dir sandbox，再 read_file sandbox/hello.py，然后 edit_file 把 Hello China 改成 Hello Agent，最后 write_file 新建 sandbox/note.md

[step 1] list_dir → [FILE] add.py (67 bytes) / hello.log (12 bytes) / hello.py (126 bytes)
[step 1] read_file → print("Hello China")
[step 2] edit_file → 已修改 sandbox/hello.py
[step 2] write_file → 已写入 sandbox/note.md（5 字符）
[step 3] read_file → print("Hello Agent")
[step 4] read_file → done
```

四个动作，四次工具调用，日志里每一步都能对上。改完它还自己读回确认了一遍——这不是提示词让它做的，是 `read_file` 这个工具让“确认”变得便宜。

日志原文在 `logs/samples/files_rerun_20261028_223517.jsonl`。

这一节留下的债

- `read_file` 没有大小上限，遇到大文件会吃上下文

- `list_dir` 没有跳过 `.venv` / `__pycache__`，目录一大就刷屏

- `write_file` 的覆盖风险靠提示词约束，没有程序层的“改前备份”

- `edit_file` 对空白字符敏感，模型改缩进时容易匹配失败


这四条都不是“再加一个工具”能解决的，得在实现里补参数和边界。

* * *

**上篇到这里。** 中篇从 shell 开始：白名单、脚本审计、人工确认、超时；然后是检索与上下文、运行时控制、子 Agent 权限。

* * *

**《AI-FDE 转型之路》**：写给不写代码的 IT 实施 / 售前 / 运维，把已有的交付能力「AI 化」。全系列 55 篇，六大模块 53 项技能。

想先看看自己缺什么：AI-FDE 技能自评地图，53 项打分，出一张雷达图。[AI-FDE 转型之路 · 开篇](/zh/docs/00-intro/)

![](/media/docs/09-ai-eng-agent-1/img-01.png)
