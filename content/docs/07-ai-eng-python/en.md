This is a simple Python beginner tutorial. It's not really a tutorial—at most a guide to learning Python. After learning Python, you can better understand the content of the following chapters. Python code can be written with AI coding, but you still need to understand some prerequisite material, which makes it easier for an FDE to do the work.

![](/media/docs/07-ai-eng-python/img-01.png)

## 1. Install It Right First: Pick the Wrong Version and Everything After Is Wasted Effort

My view: **of the ten people who get driven away by Python, nine aren't driven away by the syntax — they're driven away by the environment.**

**![Python, I Love You, but these pain points hurt (badly) | by ApiHarbor | Medium](/media/docs/07-ai-eng-python/img-02.jpg)**

Errors you can't read, libraries that won't install, a project that won't run on another machine — none of these three has anything to do with whether you can write a loop. They have to do with whether you've sorted out your environment.

Xiao Lin (fictional; a new implementation engineer on our side, same below) took three days to get a model call working the first time: day one installing Python, installed it twice; day two pip wouldn't install libraries; day three it ran, but he couldn't say which step had actually made the difference.

The cost of those three days could have been half an hour.

Versions first. **To judge whether a version is usable, don't look at how new it is — look at whether the customer and the platform can keep up with it.** The table below is the official Python version status (as of October 2026, source devguide.python.org/versions):

| Version | Official status | First release | Supported until | How I use it |
| --- | --- | --- | --- | --- |
| 3.15 | bugfix (current latest) | 2026-10 | 2031-10 | Fine to try yourself, don't take it into a customer environment |
| 3.14 | bugfix | 2025-10 | 2030-10 | First choice for new projects |
| 3.13 | security | 2024-10 | 2029-10 | My default when I want stability |
| **3.12** | **security** | **2023-10** | **2028-10** | **Most common in platform images** |
| 3.11 | security | 2022-10 | 2027-10 | Old projects I'm still maintaining |
| 3.10 and below | **end-of-life** | 2021-10 | **ended 2026-10-01** | Don't use it to start anything new |

There are two traps in this table that are worth more than the version numbers themselves.

First: **3.10 officially went end-of-life this month.** That machine at the customer site that "has always worked" is now running a version the official team no longer patches for vulnerabilities. This comes up in classified-protection (MLPS) and supply-chain reviews at financial customers — you can't just answer "it runs."

Second: **3.11, 3.12 and 3.13 have already entered the security phase.** That phase doesn't mean "expired"; it means "security fixes only, no new installers." So the 3.13 installer you download onto a new machine today is the last version of it that ships with binaries.

Two things I do myself: **lock one version per project and write it on the first page of the doc; have the team standardize on the same major version instead of everyone installing their own.** The latter looks crude, but it eliminates an entire class of "it works fine on my machine, it errors on yours" arguments.

**Don't casually swap or upgrade versions — some libraries have very strict Python requirements in their dependency chains. I don't recommend using very new versions; be conservative.**

There's only one thing you must remember during install: on the first page of the Windows installer, at the bottom, the line **Add python.exe to PATH** — check it. If you don't, every "command not found" later traces back to it. If you don't check it, you can also add it manually by adding it to the Windows environment variables.

Once the Python environment is installed, don't rush to write code — run three checks first:

```
python --version
python -c "import sys; print(sys.executable)"
pip --version
```

The second one is the key — it prints **where the python you're actually using lives**. Eight out of ten problems later get located with this one command. On Windows, if `python` isn't recognized, try `py --version` (the official launcher); on macOS / Linux it's usually `python3`.

## 2. Virtual Environments: Hosting Several Projects on One Machine Without Conflicts

This is the habit I most want you to take away from this article, bar none.

![Claude vs ChatGPT long-form writing: which is better for reports, proposals, and long-form content?](/media/docs/07-ai-eng-python/img-03.jpg)

First, why. If you don't create a virtual environment, everything installed by `pip install` goes into one place, called the **main environment** (system-level or user-level). All projects share it. So this happens: project A needs version 1 of some library, project B needs version 2; you upgrade for B, and A breaks that same afternoon—even though you didn't touch a single line of A's code.

An analogy: the main environment is the company's only shared toolbox—whoever uses it throws things in, whoever uses it takes things out. A virtual environment is **giving each project its own toolbox**, with however many tools and whatever models it needs, each managed separately. (Best not to use the system's built-in Python, and don't use the Python installers bundled with other applications—install your own. This reduces conflicts.)

Fortunately, this is a capability built into the standard library; since Python 3.3 you don't need to install anything extra:

```
# Create one in the project directory, conventionally named .venv
python -m venv .venv

# Windows activation
.venv\Scripts\activate

# macOS / Linux activation
source .venv/bin/activate
```

The sign of successful activation is a `(.venv)` at the front of the command line. If you don't trust it, use the first verification command: `python -c "import sys; print(sys.executable)"`—the path should point to the `.venv` under your project directory.

Four rules, all learned the hard way:

- • **Every time you start a new project, the first thing is to create a venv, not to write code.**

- • **Before `pip install`, check whether `(.venv)` is there.** If you forget to activate and install anyway, everything goes into the main environment—equivalent to having built nothing.

- • **`.venv` does not go into version control.** The hundreds of megabytes of files inside are all local paths; committing them only harms others. Put it in `.gitignore`.

- • **`.venv` cannot be copied to another machine.** The paths inside the directory are hard-coded. When you change machines, rebuild it—rebuild from the dependency list, not by copying the directory.

One field-specific pitfall: **on Debian / Ubuntu, `python -m venv` reports that ensurepip is unavailable.** That's not your fault—that distribution split it into a separate package; just install it with `apt install python3-venv`.

## 3. Installing packages: first make sure you can connect, then decide which version to install

On site, installing packages always falls into two cases, and the approach is completely different.

**Case one: the machine can reach the internet.** One line is enough:

```
pip install openai
```

Directly connecting to the official source from mainland China is often so slow that it times out, so switching to a domestic mirror is standard practice — no need to feel like you're doing something shady:

```
pip install openai -i https://pypi.tuna.tsinghua.edu.cn/simple
```

If typing it every time is a hassle, set it as the default (user-level config, set once per machine):

```
pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
```

**Case two: the machine cannot reach the internet — this is our main battleground.** Financial institution intranets don't allow external access, so you have to install the packages on a machine with internet access and then copy them in. The standard two steps:

```
# On a machine with network access: download the package and all its dependencies into the wheels directory
pip download -d ./wheels -r requirements.txt

# After copying to the intranet machine: install offline
pip install --no-index --find-links=./wheels -r requirements.txt
```

There's a very easy place to trip up here, and one sentence explains it: **`pip download` by default only downloads packages that work on "this machine, this Python version."**

So when the packaging machine and the target machine don't match (the most typical: you package on Windows + 3.13, and the client is Linux + 3.11), you must explicitly specify the target platform and add `--only-binary=:all:`:

```
pip download -d ./wheels -r requirements.txt \
  --platform manylinux2014_x86_64 \
  --python-version 311 \
  --implementation cp \
  --abi cp311 \
  --only-binary=:all:
```

That last part is not optional: if even one package has no prebuilt wheel and can only be compiled from source, it makes pip fail on the spot, rather than quietly handing you a source package that can't be compiled in the client's data center. I'd rather it fail on my machine.

Where does the dependency list come from? After installing the packages you need in a clean virtual environment:

```
pip freeze > requirements.txt
```

One reminder: `freeze` writes **all** packages into the list, including ones you didn't install directly but that were pulled in by other packages. So do it in a clean venv, otherwise the list will be mixed with a bunch of irrelevant stuff. Version numbers **must be pinned** — if you don't pin them, the same list will install a different set of things three months later.

There's also a problem that only shows up on enterprise networks: **SSL certificate errors.** The company network does man-in-the-middle decryption, pip doesn't recognize your root certificate, and so it reports certificate verification failure. This doesn't mean the network is broken. You can have pip temporarily trust that source (`--trusted-host`), or install the enterprise root certificate into pip's trust chain — the latter is more proper, the former is faster. This needs to be resolved before work starts, not the night before delivery.

## 4. Different Ways to Learn Python

Systematically learning something and looking up a piece of documentation are two different things. Choosing while mixing the two together usually means doing neither well, so keep them separate.

**First, the "learning" side.** The only criterion isn't whether it's famous or not—it's **whether there are exercises after each section, and whether you can check your own answers**. **You must learn by doing.**

I recommend the official Python tutorial; the official source is always the first-hand learning material: https://docs.python.org/zh-cn/3.15/tutorial/index.html

If you find the translation or context a bit hard to follow, you can also study these tutorials:

| Course | Nature | Exercise format | How I use it |
| --- | --- | --- | --- |
| **Liao Xuefeng's Python Tutorial** liaoxuefeng.com/books/python/ | Individual · Chinese · Free | Exercises after each section, answers at the end | Filling gaps, explained plainly |
| **Runoob Python 3** runoob.com/python3/python3-tutorial.html | Commercial site · Chinese · Free | Run code directly in the page | When I just want to try a line immediately |

Now the "lookup" side. The pages below are tools, not textbooks—flip to them only when you need them.

Of course, the best problem-solving tool now is AI. When looking things up, it's best not to enable web search, because the web pollutes the data—or specify that the AI should query the official community for solutions.

| Official documentation | Language | What to look up | Corresponds to this article |
| --- | --- | --- | --- |
| Python Official Tutorial Chapter 12 "Virtual Environments and Packages" docs.python.org/zh-cn/3/tutorial/venv.html | Chinese | The whole chapter, not long | II, III |
| venv library docs docs.python.org/zh-cn/3/library/venv.html | Chinese | "Creating virtual environments" + parameter table | II |
| Installing Python Modules docs.python.org/zh-cn/3/installing/index.html | Chinese | Clarifies the relationship between pip and venv | III |
| pip User Guide / pip download pip.pypa.io/en/stable/user\_guide/ · cli/pip\_download/ | English | requirements, platform parameters | III |
| Tsinghua PyPI mirror help mirrors.tuna.tsinghua.edu.cn/help/pypi/ | Chinese | Copy the config commands as-is | III |
| "Errors and Exceptions" docs.python.org/zh-cn/3/tutorial/errors.html | Chinese | How to read a Traceback | IV |

## 5. Getting It Running for the First Time: Editor, Command Line, and an Error Message

With the environment set up, the next step is "getting it running." There's a particularly sneaky pitfall here: **what you installed is fine, but the interpreter being used isn't it.**

**![Bug report. Magnifying glass for bugs in computer software program. Bug report. Computer Virus Protection. Tracker Tool on Website. Flat Cartoon Vector Illustration, icon Stylish abstract design landing page](/media/docs/07-ai-eng-python/img-04.jpg)**

**First, make the editor recognize this `.venv`.** Install VS Code plus the official Python extension, press `Ctrl+Shift+P`, type `Python: Select Interpreter`, and choose the one at `.venv\Scripts\python.exe` under the project directory. The symptoms of choosing wrong are very typical: it's clearly installed in the command line, but the editor is full of red squiggles saying the import can't be found—it's not that the library isn't installed, it's that the editor is using a different Python.

**Second, run it in one fixed way.** The triangle in the top-right corner of the editor, or `python demo.py` in the terminal (provided you're in the project directory and `.venv` is activated). Don't use the double-click-the-file approach—the error window flashes and disappears, and you see nothing.

**Relative paths in a script are relative to "which directory you typed the command in," not to where the script is located.** Writing `open("data.csv")` looks for the one in the current directory. If it runs fine in directory A but reports file not found in directory B, that's almost certainly the reason. To get the script's own location, use `Path(__file__).parent`.

**Third, read the error.** This is the most time-saving skill in this article. That big blob isn't meant to be read from the first line:

```
Traceback (most recent call last):
  File "D:\proj\demo.py", line 12, in <module>
    from openai import OpenAI
ModuleNotFoundError: No module named 'openai'
```

Three ways to read it:

1.  **Read from the last line upward.** The last line says "what the error is"—here it's that there's no `openai` library, either not installed or installed in a different interpreter.

2.  **Go upward and find the first occurrence of your own file.** The `site-packages\...` lines in the middle are someone else's code, skip them for now; `File "D:\proj\demo.py", line 12` is where you need to make changes.

3.  **Look at the location it gives.** Starting with Python 3.11, it directly marks which specific part of the expression is wrong, so you don't have to count parentheses yourself.

The three common errors have completely different handling approaches:

| Error | What it means | What to check first |
| --- | --- | --- |
| `ModuleNotFoundError` | Can't find the library | Whether the interpreter is chosen correctly, whether it's in `pip list` |
| `UnicodeDecodeError` | Wrong encoding | Add `encoding="utf-8"` when reading the file; Windows defaults to GBK |
| `KeyError` / `IndexError` | The thing you're getting doesn't exist | Upstream data changed, not a syntax error |

The first two are environment problems, the third is a data problem. This classification is useful: **you can fix environment problems yourself, but data problems require going back to whoever provided the data.**

## 6. Understanding Unfamiliar Code: Look at Only Five Places

The first four sections got the environment and execution working. This section starts on reading code.

![Code Review for AI-Generated Code: 2026 Standards | metacto](/media/docs/07-ai-eng-python/img-05.jpg)

I'm not asking you to write from a blank file. **I'm asking that, given any piece of Python, you can say within five minutes what it does and where to change it.** One method: don't look at details, find five places first.

| Where to look | What to find | What it usually looks like |
| --- | --- | --- |
| ① Entry point | Where execution starts | `if __name__ == "__main__":` at the end of the file |
| ② Config | Where addresses, keys, model names come from | `os.environ.get(...)`, or uppercase variables in the first few lines |
| ③ Calls | Where it talks to the outside | Things like `client.chat.completions.create(...)` |
| ④ Errors | How failures are handled | `try` / `except`, and how many retries |
| ⑤ Results | Where the output lands | Writing a file, writing a database, or just `print` |

Scan these five places and the backbone of a two-hundred-line script is out; the rest is branches and leaves.

The following runs directly (fictional scenario: a credit material preliminary review assistant; parameters are examples, replace with your project's). I compressed it to the shortest, but all five places are present:

```
"""Credit material preliminary review assistant: minimal runnable version (example conventions, replace parameters per project)"""
import json, os, sys, time
from openai import OpenAI

# ② Configuration: everything taken from environment variables, keys not written in code
API_KEY = os.environ.get("DEMO_API_KEY")
BASE_URL = os.environ.get("DEMO_BASE_URL", "https://api.deepseek.com")
MODEL = os.environ.get("DEMO_MODEL", "deepseek-chat")
LOG = os.environ.get("DEMO_LOG", "runs.jsonl")

PROMPT = """You are a credit material preliminary review assistant. Output only JSON, no explanations.
Fields: missing (list of missing materials), risk (list of risk points), citation (source text), confidence (0-1)
Materials:
{material}
"""

def parse(raw: str) -> dict:
    """The model likes to wrap JSON in Markdown fences, strip them before parsing"""
    text = raw.strip()
    if text.startswith("```"):
        text = text[3:].lstrip("`")
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
        text = text.rstrip("`").strip()
    return json.loads(text)

def validate(d: dict) -> dict:
    """④ Throw immediately if non-compliant, don't pass it down"""
    if not isinstance(d.get("citation"), str) or not d["citation"].strip():
        raise ValueError("citation cannot be empty")
    c = float(d.get("confidence", -1))
    if not 0 <= c <= 1:
        raise ValueError(f"confidence out of range: {c}")
    return {"missing": d.get("missing", []), "risk": d.get("risk", []),
            "citation": d["citation"].strip(), "confidence": c}

def main() -> int:
    if not API_KEY:
        print("Missing DEMO_API_KEY, exiting", file=sys.stderr)
        return 2
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)   # ③ Call
    material = "Business license, audit reports for the past three years, copy of legal representative's ID card, power of attorney"
    for i in range(3):                                    # ④ Retry, with a limit
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
            print(f"Attempt {i+1} failed: {type(e).__name__}: {e}", file=sys.stderr)
            if i == 2:
                return 1
            time.sleep(pow(2, i))
    with open(LOG, "a", encoding="utf-8") as f:           # ⑤ Result: one line per call
        f.write(json.dumps({"result": result}, ensure_ascii=False) + "\n")
    print(result)
    return 0

if __name__ == "__main__":      # ① Entry point
    sys.exit(main())
```

The design trade-offs in this snippet are exactly what the previous articles have been discussing: config externalized, parsing must be fault-tolerant, validation must blow up on the spot (the only reason `validate` exists is to turn "silent errors" into "immediate errors"), retries have a cap and backoff, and every call leaves a one-line trace.

**Understanding these five places is enough.** As for how to systematically learn syntax to a "good enough" level, that's the software engineering volume's job; this article only covers its use in the AI chain.

**While we're at it, let's unpack the phrase "network programming."** Someone asked me whether they should learn network programming. My answer: **you don't need to learn network programming, but you do need to be able to send a request.**

These two things are far apart. Sockets, protocols, concurrency are for the people writing server-side code; what you do is **call interfaces someone else has provided**—model APIs, in-house systems, the service from Lecture 08, the action is the same: send it out, see what comes back.

On-site troubleshooting, I fix on one order: **hit it with curl first, then suspect the code.** If it doesn't go through, the problem is the network, the address, or the key; only once it goes through does it come down to the code.

```
curl -X POST https://api.deepseek.com/chat/completions \
  -H "Authorization: Bearer $DEMO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"Say one sentence"}]}'
```

In Python that's three lines (`pip install requests`):

```
import requests
resp = requests.post(url, headers=headers, json=body, timeout=30)
print(resp.status_code, resp.json())
```

Only two things must be remembered. **Always set a timeout**—`requests` doesn't set one by default; if the other side says nothing, the program hangs forever, and at the client site you can't even see a log. **Read the status code to assign responsibility**: 2xx means success; 4xx is your problem (401 key, 403 permission, 404 address, 429 rate limit); 5xx is their problem. This sentence is especially useful for assigning responsibility in client meetings—don't say "the interface errored," say "it returned 500, that's their side's problem."

## 7. Let AI Change the Code, but You Must Hold the Acceptance Authority

Now you have an environment, a dependency list, and something that runs. What happens most often day to day isn't "writing from scratch"—it's "this part needs a change."

Let's be clear about scope first: this is about **those few dozen lines you have in hand, changing one or two spots**; handing an entire requirement to a Coding Agent is the topic of Lecture 11, and the requirements are completely different.

AI is genuinely capable now. But what I want to talk about isn't what it can do—it's **how you get it to make changes, and how you know it hasn't broken anything after the change.**

First, give it enough context—four things, and if any one is missing, it starts guessing:

1.  1\. What this code does (one sentence)

2.  2. **The complete error**, from the first line of the `Traceback` to the last, not a screenshot

3.  3\. What you just changed (a lot of the time the problem is right here, and it needs to know)

4.  4\. Your environment: Python version, operating system, versions of key libraries

Then hold three hard rules:

- • **Change only one thing at a time.** Cram five requirements into one sentence, and it'll give you something that touched everything but that you can't confidently confirm any single part of.

- • **You must run the code it gives you yourself.** If it doesn't run, ask again; if it runs, that's only the first step—then check whether the result is correct.

- • **Before installing any library it tells you to install, see clearly what it is.** This is a supply-chain issue, not a technical one. When going through approval with financial clients, they'll ask "who maintains this package, and does it have vulnerabilities?"

When looking at the change it gives, I only ask three questions: **What did it delete? What new dependencies did it add? Did it turn my configuration into hardcoded values?** Only when you can answer all three does this change pass.

One counterexample must be called out: **AI loves to add a try / except layer to code that "swallows all exceptions."** Once added, the error really does disappear, but the problem isn't solved at all—it just turns a "visible error" into an "invisible error." In an ordinary project this is called laziness; in a financial system this is called an incident: **you think it's running, but the data has been wrong all along.**

So what counts as having learned it? Five points, all verifiable on the spot:

1.  1\. On a clean machine, you can set up the environment following the steps you wrote down, without relying on memory.

2.  2\. You can explain clearly which interpreter `python` points to, and why it must be the one in `.venv`.

3.  3\. The client's intranet has no external network—you can package the dependencies into a single bundle, bring it in, and get it installed.

4.  4\. Given someone else's code, you can point out within two minutes where the configuration, the calls, and the exception handling are.

5.  5\. Given a change from AI, you can say which three places it touched, and you can run it yourself with correct results.

**Hands-on task**: Pick a library you'll use today (say, some model's SDK) and go through the full process—create a venv, install the library, `freeze` out the list, then switch to a new directory and rebuild once according to the list. The moment the rebuild succeeds is the moment you've truly learned it.

## 8. Pitfalls

**Not creating a virtual environment and installing globally instead.** This is the source of all environment problems. The cost isn't visible at the time; it comes due two weeks later on another project.

**Starting a new project on a version that's already end-of-life.** 3.10 and below are all EOL. If it's running in a customer environment, that's legacy baggage—flag it; but choosing it for a new project is planting a landmine for yourself.

**Not specifying `encoding` when reading files on Windows.** The system default is GBK, so any UTF-8 file throws `UnicodeDecodeError`. `open(path, encoding="utf-8")` is mandatory—same for reading CSV and Excel. This comes up on-site more often than all syntax errors combined.

**Building offline packages only on your own machine.** If the build machine and target machine differ in OS, Python version, or CPU architecture—even one of them—the install can fail. Use `--platform` plus `--only-binary=:all:` to surface problems early, rather than discovering them once you're in the server room.

**Version control is a must.** When you have AI write code, you absolutely must use version control—otherwise it will refactor your existing project and you'll have no way to roll back. Git is recommended.

**Using AI's changes directly after they're made.** Not running them after the change, or not checking the results after running, means handing over your acceptance authority. In this role, acceptance authority is your last remaining value.

* * *

**《The AI-FDE Transition Path》**: Written for IT implementation / pre-sales / operations people who don't write code, to make their existing delivery skills "AI-ified." 55 articles in the series, 53 skills across six modules.

Want to see what you're missing first: AI-FDE Skills Self-Assessment Map, 53 items scored, producing a radar chart. [The AI-FDE Transition Path · Introduction](/docs/00-intro/)
