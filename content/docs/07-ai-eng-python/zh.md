这是一篇简单的python入门教程，实际不算教程，最多算一个学习python的指南，学习了python后，可以更好的理解后续章节的内容，python代码是可以AI coding，但是一些前置的内容还需要了解一下，这样FDE才做的比较容易。

![](/media/docs/07-ai-eng-python/img-01.png)

## 一、先装对：版本选错，后面全是白折腾

我的判断是：**被 Python 劝退的人，十个里有九个不是被语法劝退的，是被环境劝退的。**

**![Python, I Love You, but these pain points hurt (badly) | by ApiHarbor | Medium](/media/docs/07-ai-eng-python/img-02.jpg)**

报错看不懂、库装不上、换台机器就跑不起来——这三件事跟你会不会写循环没有半点关系，跟你环境收不收拾有关系。

小林（虚构，我们这边新来的实施，下同）第一次跑通一条模型调用花了三天：第一天装 Python，装了两遍；第二天 pip 装不上库；第三天跑起来了，但他说不清哪一步起了作用。

这三天的成本，本来可以是半小时。

先说版本。**判断一个版本该不该用，不看它新不新，看客户和平台跟不跟得上。** 下面这张是 Python 官方的版本状态（截至 2026 年 10 月，来源 devguide.python.org/versions）：

| 版本 | 官方状态 | 首次发布 | 支持到 | 我的用法 |
| --- | --- | --- | --- | --- |
| 3.15 | bugfix（当前最新） | 2026-10 | 2031-10 | 自己试可以，别往客户环境带 |
| 3.14 | bugfix | 2025-10 | 2030-10 | 新起项目首选 |
| 3.13 | security | 2024-10 | 2029-10 | 求稳时我的默认 |
| **3.12** | **security** | **2023-10** | **2028-10** | **平台镜像里最常见** |
| 3.11 | security | 2022-10 | 2027-10 | 手上还在维护的老项目 |
| 3.10 及以下 | **end-of-life** | 2021-10 | **2026-10-01 已停** | 不要再用它起新东西 |

这张表里有两个坑，比版本号本身值钱。

第一个：**3.10 就在这个月正式停止支持。** 客户现场那台"一直好用"的机器，现在跑的是一个官方不再修漏洞的版本。这件事在金融客户的等保和供应链审查里是会被问到的——你不能只回答"它能跑"。

第二个：**3.11、3.12、3.13 已经进了 security 阶段。** 这个阶段的含义不是"过期"，而是"只修安全问题，不再提供新的安装包"。所以你今天在新机器上装到的 3.13 安装器，是它最后一个带二进制的版本。

我自己的做法两条：**一个项目锁一个版本，写在文档第一页；团队统一同一个大版本，别各装各的。** 后者看着土，但它能消掉一整类"我这儿好好的，你那儿报错"的争论。

**不要随便替换版本和更新版本，有些库依赖关系对python要求很严格。不建议使用比较新的版本，保守一些吧。**

装的时候只有一个动作必须记住：Windows 安装器第一页底部那行 **Add python.exe to PATH**，勾上。如果不勾，后面所有"命令找不到"都是它。如果不勾，也可以手工添加它，windows环境变量中增加。

python环境装完别急着写代码，先跑三条验证：

```
python --version
python -c "import sys; print(sys.executable)"
pip --version
```

第二条是关键——它打出的是**你正在用的那个 python 到底在哪**。后面所有问题，八成都靠这一条定位。Windows 上 `python` 不认就试 `py --version`（官方启动器），macOS / Linux 通常是 `python3`。

## 二、虚拟环境：一台机器上养好几个项目，互不打架

这是本篇我最想让你带走的习惯，没有之一。

![Claude vs ChatGPT 長文寫作：誰更適合寫報告、企劃書和長篇內容？](/media/docs/07-ai-eng-python/img-03.jpg)

先讲为什么。不建虚拟环境时，`pip install` 装的东西全进一个地方，那叫**主环境**（系统级或用户级）。所有项目共用它。于是会发生这种事：项目 A 要 1 版某库，项目 B 要 2 版；你为 B 升级，A 当天下午就崩——而你没动过 A 的任何一行代码。

打个比方：主环境是公司唯一的公共工具箱，谁用谁往里扔、谁用谁拿走。虚拟环境是**给每个项目发一个自己的工具箱**，配了几把、什么型号，各管各的。（最好不要使用系统自带的python，也不要使用其他应用的python安装包，要自己安装，这样就减少的了冲突。）

好在这是标准库自带的能力，Python 3.3 以后不用额外装任何东西：

```
# 在项目目录里建一个，名字习惯叫 .venv
python -m venv .venv

# Windows 激活
.venv\Scripts\activate

# macOS / Linux 激活
source .venv/bin/activate
```

激活成功的标志是命令行前面多了一个 `(.venv)`。不信它，就用第一条验证命令：`python -c "import sys; print(sys.executable)"`，路径应该指到你项目目录下那个 `.venv`。

四条纪律，都是踩出来的：

- • **每开一个新项目，第一件事是建 venv，不是写代码。**

- • **`pip install` 之前先看 `(.venv)` 在不在。** 忘了激活就装，东西全进主环境，等于白建。

- • **`.venv` 不进版本库。** 里面几百兆文件全是本机路径，提交上去只会害人。写进 `.gitignore`。

- • **`.venv` 不能复制到别的机器用。** 目录里的路径是写死的。换机器就重建，重建靠依赖清单，不靠复制目录。


一个现场专属的坑：**Debian / Ubuntu 上 `python -m venv` 会报 ensurepip 不可用。** 不是你的错，那个发行版把它拆成了单独的包，`apt install python3-venv` 装上就行。

## 三、装库：先解决连不连得上，再解决装哪个版本

装库在现场永远分两种情况，做法完全不同。

**第一种，机器能出网。** 一行就够：

```
pip install openai
```

国内直连官方源经常慢到超时，换国内镜像是常规操作，不用觉得走偏门：

```
pip install openai -i https://pypi.tuna.tsinghua.edu.cn/simple
```

嫌每次敲麻烦，就配成默认（用户级配置，一台机器配一次）：

```
pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
```

**第二种，机器不能出网——这才是我们的主战场。** 金融机构内网不给外网，就只能在外网机器上把包装好再拷进去。标准两步：

```
# 在有网的机器上：把包和它的全部依赖下到 wheels 目录
pip download -d ./wheels -r requirements.txt

# 拷进内网机器后：断网安装
pip install --no-index --find-links=./wheels -r requirements.txt
```

这里有个非常容易翻车的地方，一句话说清：**`pip download` 默认只下"当前这台机器、当前这个 Python 版本"能用的包。**

所以打包机和目标机不一致时（最典型：你在 Windows + 3.13 上打包，客户是 Linux + 3.11），必须显式指定目标平台，并且加上 `--only-binary=:all:`：

```
pip download -d ./wheels -r requirements.txt \
  --platform manylinux2014_x86_64 \
  --python-version 311 \
  --implementation cp \
  --abi cp311 \
  --only-binary=:all:
```

最后那句不是可选项：只要有一个包没有现成的轮子（wheel）、只能靠源码编译，它就让 pip 当场报错，而不是悄悄塞给你一个在客户机房编译不出来的源码包。我宁可它在我机器上报错。

依赖清单从哪来？在干净的虚拟环境里装完你需要的包之后：

```
pip freeze > requirements.txt
```

一句提醒：`freeze` 会把**所有**包都写进去，包括你没直接装、只是被别的包带进来的。所以要在干净的 venv 里做，否则清单里会混进一堆无关的东西。版本号**要锁死**——不锁的话，三个月后同一份清单装出来的是另一套东西。

还有个只在企业网出现的问题：**SSL 证书报错。** 公司网络做了中间人解密，pip 不认你们的根证书，于是报证书验证失败。这不是网络坏了。可以让 pip 临时信任那个源（`--trusted-host`），也可以把企业根证书装进 pip 的信任链——后者更正规，前者更快。这件事要在开工前解决，别等交付前一晚。

## 四、学习python的不同方式

想系统学，和想查一段文档，是两件事。混在一起选，通常两头都做不好，所以分开放。

**先说"学"的。** 唯一标准不是有名没名，是**每节后面有没有练习、练习能不能自己验对错**。**一定要干中学。**

推荐python官方的教程，官方永远是第一手学习的资料：https://docs.python.org/zh-cn/3.15/tutorial/index.html

如果感觉对翻译或者语境不太容易理解，也可以学习一下教程：

| 课程 | 性质 | 练习形式 | 我的用法 |
| --- | --- | --- | --- |
| **廖雪峰 Python 教程** liaoxuefeng.com/books/python/ | 个人 · 中文 · 免费 | 每节后有练习题，答案在文末 | 查漏补缺，讲得直白 |
| **菜鸟教程 Python 3** runoob.com/python3/python3-tutorial.html | 商业站点 · 中文 · 免费 | 网页里能直接运行代码 | 只想立刻试一行时用它 |

再说"查"的。 下面这几页是工具，不是教材，用到才翻。

当然现在最好的解决问题工具就是AI了，查阅问题的时候，最好不要启动网络搜索，因为网络会污染数据，或者指定让AI去官方社区去查询方案。

| 官方文档 | 语言 | 查什么 | 对应本篇 |
| --- | --- | --- | --- |
| Python 官方教程 第 12 章「虚拟环境和包」 docs.python.org/zh-cn/3/tutorial/venv.html | 中文 | 全章，篇幅不长 | 二、三 |
| venv 库文档 docs.python.org/zh-cn/3/library/venv.html | 中文 | 「创建虚拟环境」+ 参数表 | 二 |
| 安装 Python 模块 docs.python.org/zh-cn/3/installing/index.html | 中文 | 讲清 pip 与 venv 的关系 | 三 |
| pip 用户指南 / pip download pip.pypa.io/en/stable/user\_guide/ · cli/pip\_download/ | 英文 | requirements、平台参数 | 三 |
| 清华 PyPI 镜像帮助 mirrors.tuna.tsinghua.edu.cn/help/pypi/ | 中文 | 照抄配置命令 | 三 |
| 「错误和异常」 docs.python.org/zh-cn/3/tutorial/errors.html | 中文 | Traceback 怎么读 | 四 |

## 五、第一次跑起来：编辑器、命令行、一段报错

环境齐了，接下来是"跑起来"。这一步有个特别隐蔽的坎：**你装的东西没错，但用的解释器不是它。**

**![Bug report. Magnifying glass for bugs in computer software program. Bug report. Computer Virus Protection. Tracker Tool on Website. Flat Cartoon Vector Illustration, icon Stylish abstract design landing page](/media/docs/07-ai-eng-python/img-04.jpg)**

**第一件，让编辑器认这个 `.venv`。** 装 VS Code 加官方 Python 扩展，按 `Ctrl+Shift+P` 输入 `Python: Select Interpreter`，选项目目录下 `.venv\Scripts\python.exe` 那个。选错的症状特别典型：命令行里明明装好了，编辑器里一片红波浪线说 import 找不到——不是库没装，是编辑器拿的是另一个 Python。

**第二件，用一种固定的方式运行。** 编辑器右上角那个三角，或者终端里 `python demo.py`（前提：在项目目录，且 `.venv` 已激活）。别用双击文件那种方式，出错窗口一闪就没了，什么都看不到。

**脚本里的相对路径，是相对"你在哪个目录敲命令"，不是相对脚本放在哪。** 写 `open("data.csv")`，找的是当前目录那个。在 A 目录跑通、换到 B 目录报文件不存在，八成是这个原因。要取脚本自身位置，用 `Path(__file__).parent`。

**第三件，读报错。** 这是本篇最省时间的一条技能。那一大坨不是让你从第一行读的：

```
Traceback (most recent call last):
  File "D:\proj\demo.py", line 12, in <module>
    from openai import OpenAI
ModuleNotFoundError: No module named 'openai'
```

读法三条：

1.  1. **从最后一行往上读。** 最后一行说的是"什么错"——这里是没有 `openai` 这个库，要么没装，要么装在别的解释器里了。

2.  2. **往上找第一处你自己的文件。** 中间那些 `site-packages\...` 是别人的代码，先跳过；`File "D:\proj\demo.py", line 12` 才是你要动的地方。

3.  3. **看它给的定位。** Python 3.11 起会直接标出表达式里具体哪一段出错，不用自己数括号。


常见的三种报错，处理方式完全不同：

| 报错 | 什么意思 | 你先查什么 |
| --- | --- | --- |
| `ModuleNotFoundError` | 找不到库 | 解释器选对没有、`pip list` 里有没有它 |
| `UnicodeDecodeError` | 编码不对 | 读文件加 `encoding="utf-8"`；Windows 默认是 GBK |
| `KeyError` / `IndexError` | 取的东西不存在 | 上游数据变了，不是语法错 |

前两种是环境问题，第三种是数据问题。这个分类有用：**环境问题你自己能修，数据问题得回去找给数据的人。**

## 六、看懂一段陌生代码，只看五处

前四节把环境和运行弄通了，这节开始读代码。

![Code Review for AI-Generated Code: 2026 Standards | metacto](/media/docs/07-ai-eng-python/img-05.jpg)

我不要求你从空白文件写起。**我要求你拿到任何一段 Python，五分钟内能说出它干了什么、从哪儿改。** 方法一条：不看细节，先找五处。

| 看哪 | 找什么 | 通常长什么样 |
| --- | --- | --- |
| ① 入口 | 从哪开始跑 | 文件末尾的 `if __name__ == "__main__":` |
| ② 配置 | 地址、密钥、模型名从哪来 | `os.environ.get(...)`，或开头几行的大写变量 |
| ③ 调用 | 跟外面打交道的地方 | `client.chat.completions.create(...)` 这类 |
| ④ 出错 | 失败怎么处理 | `try` / `except`，以及重试几次 |
| ⑤ 结果 | 算完落在哪 | 写文件、写库，或者只 `print` |

按这五处扫一遍，两百行的脚本主干就出来了，剩下的都是枝叶。

下面这段能直接跑（虚构场景：信贷材料初审助手；参数为示例，按你的项目替换）。我压到了最短，但五处全在：

```
"""信贷材料初审助手：最小可跑版本（示例口径，按项目替换参数）"""
import json, os, sys, time
from openai import OpenAI

# ② 配置：全部从环境变量取，密钥不写在代码里
API_KEY = os.environ.get("DEMO_API_KEY")
BASE_URL = os.environ.get("DEMO_BASE_URL", "https://api.deepseek.com")
MODEL = os.environ.get("DEMO_MODEL", "deepseek-chat")
LOG = os.environ.get("DEMO_LOG", "runs.jsonl")

PROMPT = """你是信贷材料初审助手。只输出 JSON，不要任何解释。
字段：missing(缺失材料列表), risk(风险点列表), citation(依据原文), confidence(0-1)
材料：
{material}
"""

def parse(raw: str) -> dict:
    """模型爱在 JSON 外面套 Markdown 围栏，先剥掉再解析"""
    text = raw.strip()
    if text.startswith("```"):
        text = text[3:].lstrip("`")
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
        text = text.rstrip("`").strip()
    return json.loads(text)

def validate(d: dict) -> dict:
    """④ 不合规就当场抛，不往下传"""
    if not isinstance(d.get("citation"), str) or not d["citation"].strip():
        raise ValueError("citation 不能为空")
    c = float(d.get("confidence", -1))
    if not 0 <= c <= 1:
        raise ValueError(f"confidence 越界: {c}")
    return {"missing": d.get("missing", []), "risk": d.get("risk", []),
            "citation": d["citation"].strip(), "confidence": c}

def main() -> int:
    if not API_KEY:
        print("缺少 DEMO_API_KEY，已退出", file=sys.stderr)
        return 2
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)   # ③ 调用
    material = "营业执照、近三年审计报告、法人身份证复印件、授权委托书"
    for i in range(3):                                    # ④ 重试，有上限
        try:
            resp = client.chat.completions.create(
                model=MODEL, temperature=0,
                messages=[{"role": "user",
                           "content": PROMPT.format(material=material)}],
                timeout=30,
            )
            result = validate(parse(resp.choices[0].message.content))
            break
        except Exception as e:
            print(f"第 {i+1} 次失败: {type(e).__name__}: {e}", file=sys.stderr)
            if i == 2:
                return 1
            time.sleep(pow(2, i))
    with open(LOG, "a", encoding="utf-8") as f:           # ⑤ 结果：一行一次调用
        f.write(json.dumps({"result": result}, ensure_ascii=False) + "\n")
    print(result)
    return 0

if __name__ == "__main__":      # ① 入口
    sys.exit(main())
```

这段的设计取舍，就是前面几篇一直在讲的东西：配置外置、解析要容错、校验要当场炸（`validate` 存在的唯一理由，是把"静默的错误"变成"当场报错"）、重试有上限且带退避、每次调用留一行痕迹。

**读懂这五处就够了。** 至于语法要怎么系统学到"够用"，那是软件工程卷的事；这一篇只管它在 AI 链路里的用法。

**顺带把"网络编程"这四个字拆开。** 有人问我要不要学网络编程。我的答案是：**不用学网络编程，但要会发一个请求。**

这两件事差得很远。socket、协议、并发是写服务端那批人的事；你干的是**调别人给好的接口**——模型 API、行内系统、第 08 讲那个服务，动作都一样：发出去，看回来。

现场排查我固定成一个顺序：**先用 curl 打一遍，再怀疑代码。** 打不通，问题在网络、地址或密钥；能通了，才轮到代码。

```
curl -X POST https://api.deepseek.com/chat/completions \
  -H "Authorization: Bearer $DEMO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"说一句话"}]}'
```

Python 里对应三行（`pip install requests`）：

```
import requests
resp = requests.post(url, headers=headers, json=body, timeout=30)
print(resp.status_code, resp.json())
```

只有两件事必须记住。**超时一定要设**——`requests` 默认不设超时，对方不吭声，程序就永远挂着，客户现场连日志都看不到。**看状态码分责任**：2xx 成了；4xx 是你的问题（401 密钥、403 权限、404 地址、429 限流）；5xx 是对方的问题。这句话在客户会上定责特别有用——别说"接口报错了"，说"它返回 500，是那边的问题"。

## 七、让 AI 改代码，但验收权必须在你手里

现在你手上有环境、有依赖清单、有一段能跑的东西。日常最常发生的不是"从零写"，而是"这段得改一下"。

先说清范围：这里讲的是**你手上那几十行、改一两处**的活；把一整个需求交给 Coding Agent 去做，是第 11 讲的事，要求完全不同。

AI 现在确实很能干。但我要说的不是它能干什么，是**你怎么让它改，以及改完你怎么知道它没改坏。**

先给它够用的上下文，四样东西，缺一样它就开始猜：

1.  1\. 这段代码是干什么的（一句话）

2.  2. **完整的报错**，从 `Traceback` 第一行到最后一行，不是截一张图

3.  3\. 你刚改了什么（很多时候问题就在这儿，它得知道）

4.  4\. 你的环境：Python 版本、操作系统、关键库的版本


然后守三条硬规矩：

- • **一次只改一件事。** 一句话里塞五个需求，它会给你一段全都动了、但哪一处都不敢确认的东西。

- • **它给的代码必须你自己跑一遍。** 跑不过就再问；跑过了也只是第一步——再看结果对不对。

- • **它让你装的库，先看清是什么。** 这是供应链问题，不是技术问题。金融客户过审时会问"这个包谁维护、有没有漏洞"。


看它给的改动，我只问三个问题：**它删掉了什么？它新加了什么依赖？它有没有把我的配置改成写死的？** 三个都答得出来，这段改动才算过。

有个反例必须点名：**AI 非常爱给代码加一层"把所有异常都吞掉"的 try / except。** 加上之后报错真的消失了，但问题一点没解决——它只是把"看得见的错"变成了"看不见的错"。在普通项目里这叫偷懒，在金融系统里这叫事故：**你以为跑通了，其实数据一直是错的。**

那什么算会了？五条，都能当场验：

1.  1\. 换一台干净的机器，你能按自己写下的步骤把环境装起来，不靠回忆。

2.  2\. 你能说清 `python` 指向哪个解释器，以及为什么必须是 `.venv` 里那个。

3.  3\. 客户内网没有外网，你能把依赖打成一个包带进去，装得上。

4.  4\. 拿到别人的代码，你能在两分钟内指出配置、调用、异常处理分别在哪。

5.  5\. AI 给你一段改动，你能说出它动了哪三处，并且自己跑通、结果对。


**动手任务**：挑一个你今天就要用的库（比如某个模型的 SDK），走一遍完整流程——建 venv、装库、`freeze` 出清单、换一个新目录按清单重建一次。重建成功那一刻，你才算真的会了。

## 八、坑

**不建虚拟环境，直接全局装。** 这是所有环境问题的源头。当时看不出代价，它在两周后另一个项目上结算。

**用已经停止支持的版本起新项目。** 3.10 及以下全停了。客户环境里跑着，那是历史包袱，要标出来；新项目还选它，是给自己埋雷。

**Windows 上读文件不写 `encoding`。** 系统默认 GBK，碰到 UTF-8 的文件就抛 `UnicodeDecodeError`。`open(path, encoding="utf-8")` 是必写项，读 CSV、Excel 一个道理。这条在现场出现的频率，比所有语法错误加起来都高。

**离线包只在自己机器上打。** 打包机和目标机的操作系统、Python 版本、CPU 架构只要有一项不同，装上去就可能失败。用 `--platform` 加 `--only-binary=:all:` 提前暴露，别到了机房才发现。

**版本管理一定要上**。让AI写代码时，一定要进行版本管理，不然会将你之前的工程进行重构了，还找不到回退的方式。推荐使用git。

**让 AI 改完就直接用。** 改完不跑，或者跑完不看结果，等于把验收权交出去了。这个岗位上，验收权是你最后的价值。

* * *

**《AI-FDE 转型之路》**：写给不写代码的 IT 实施 / 售前 / 运维，把已有的交付能力「AI 化」。全系列 55 篇，六大模块 53 项技能。

想先看看自己缺什么：AI-FDE 技能自评地图，53 项打分，出一张雷达图。[AI-FDE 转型之路 · 开篇](/zh/docs/00-intro/)
