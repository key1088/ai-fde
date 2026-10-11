## 1. The First Thing Is Not Learning to Tune the Model

In AI delivery, the first thing to learn is not how to tune the model, and not which vendor's model to pick. It's what the model can do, what it cannot do, and where it tends to fail. **You have to know the model's capabilities and its boundaries.**

**I think this is the single highest-ROI thing in the whole AI Engineering volume.** Spend two hours and you save two months of rework later. The client won't give you credit for which model you used; they'll dock you for one wrong answer. The success of this role never depends on the best performance — it depends on the worst.

## 2. What AI Actually Is

In one sentence:

> **AI (Artificial Intelligence) is fundamentally a class of technology that lets machines gain perception, understanding, generation, prediction, decision-making and execution abilities through data, models and algorithms.**

Breaking it down further:

**AI ≠ a specific piece of software, and AI ≠ LLM.**

You can think of it like this:

```
Artificial Intelligence
│
├── Perception
│   ├── Computer vision
│   ├── Speech recognition
│   └── Multimodal
│
├── Understanding & reasoning
│   ├── Machine learning
│   ├── Deep learning
│   └── LLM
│
├── Generation
│   ├── Text
│   ├── Image
│   ├── Audio
│   └── Video
│
└── Action
    ├── Agent
    ├── Tool calling
    └── Automated execution
```

## 3. So What Is an LLM?

**LLM = Large Language Model.**

> **An LLM is a type of model within AI responsible for "language and knowledge processing."**

Mainstream LLMs, domestic and international, include:

> OpenAI's GPT series, Anthropic's Claude series, Google's Gemini series, Meta's Llama series — and in China, Alibaba's Qwen, DeepSeek, Moonshot's Kimi, Zhipu's GLM, ByteDance's Doubao, Baidu's Ernie, and more.

Their core ability is not "knowing the answer." It is:

> **Predicting the most likely next piece of content given the context, and forming a statistical representation of language, knowledge, code and problem patterns across a very large number of parameters.**

The essence of an LLM is just predicting the next word — it's always predicting; the prediction just becomes what you read as the answer.

> **"The capital of China is ___" — the next word with the highest weight is probably "Bei," then "jing."**

![](/media/docs/01-ai-eng-llm/img-01.png)

## 4. An LLM Is Not Looking Up an Answer

Many people's default mental model of a large model is a "smart search box" — you ask, it goes to a database, finds it, and reads it back. That model is wrong, and dangerously so.

What it's actually doing is more like **letting someone who has read a great many books answer from memory**: you ask a question, and based on the characters so far, they work out the most probable next character by probability, then keep writing. They have indeed read a lot, so they are often right — but they are **completing**, not **looking up**.

Where's the difference? A lookup that finds nothing will say "there's nothing." Completion will not say "there's nothing." **When it can't remember clearly, it makes something up in the right tone — fluently, with correct punctuation, reading more like the truth than the truth.** That is where hallucinations come from. The model isn't broken; this is just how it works.

![](/media/docs/01-ai-eng-llm/img-02.png)

Once you understand this, one judgment follows naturally: **anything that depends on "precise facts" cannot use a bare model.** Either you give it material (retrieval — covered later), or you give it a path to shut up when it can't answer (refusal), or you admit this scenario shouldn't be done at all.

These need to be solved with tools — with agents, skills, and MCP interfaces.

## 5. The Four Classes of Guaranteed Failure

I group failures into four classes. I didn't invent them; I reverse-engineered them from several hundred wrong answers in a policy Q&A project, and the hit rate is high.

![](/media/docs/01-ai-eng-llm/img-03.png)

| Class | Recognition signal | Example | What to do |
| --- | --- | --- | --- |
| **Timeliness** | The answer depends on "what happened recently" | A policy revised this month, the latest listed interest rate, yesterday's announcement | Must connect to retrieval or an external data source; can't rely on model memory |
| **Proprietary long tail** | Internal system names, product codes, department abbreviations, in-house jargon | "Who maintains module ZX07 in the credit system?" | Put it in a knowledge base and align terminology; refuse when it can't answer |
| **Numbers & computation** | Involves arithmetic, statistics, cross-table aggregation | "How many transactions in these three quarters combined?" | Let a tool do the math; don't let the model produce the number |
| **Multi-hop & out of scope** | Needs to chain three or more sources, or the sources simply don't contain it | "Per Article 3 of Policy A, does this go through Process B or Process C?" | Split into multiple steps; when the material doesn't contain it, say so plainly |

I'd suggest memorizing the recognition signals — more useful than memorizing concepts. On a client site you have only tens of seconds to judge; being able to say immediately "this one is proprietary long tail, we need a terminology table first" beats going back to look it up.

One lesson of my own, by the way. Early on, doing policy Q&A, after the first version went live the client complained it "answers inaccurately." My first reaction was that the model was bad and I wanted to switch to a bigger one. Later we laid the wrong answers out and classified them, and found that nearly half were document-parsing problems — tables cut apart, scanned pages OCR'd with the wrong numbers. That belongs to later articles, but here's the lesson up front: **seeing "answers are inaccurate" and reaching for a bigger model is the most expensive, least effective first reaction.**

## 6. What Counts as Knowing It

My own bar is two things:

1. Give me any business scenario, and within thirty seconds I can say which class it most likely falls into, and what the fallback action is.
2. I can articulate clearly "which questions should be refused" instead of forcing an answer. The cost of forcing an answer is far higher than refusing: once a client catches one fabrication, they won't believe the next ten correct answers either.

Three self-check questions — if you can't answer them, go back and read again:

- The client asks "will your thing make things up?" How do you answer? Just saying "we optimized it" isn't enough; you need to say which classes you refuse and what path a refusal takes.
- In the project you're on, roughly what share of questions hit the "timeliness" class? (Example numbers, for estimation only: in policy Q&A it's usually between 20% and 40%; calibrate per project.)
- Does your system currently have a "refuse" action? Or does it always have to spit out something?

## 7. Hands-On Task

Pull the last twenty real user questions from your Q&A system, classify them into the four classes above, count how many fall into each, and mark the share that "should actually have been refused."

This takes less than half an hour, but it's the foundation of everything you optimize later. If you can't even tell where the errors are, changing the prompt, swapping the model, and adding retrieval are all guesswork. When you're done you'll find the classification is often very different from your impression — I assumed it was mostly a timeliness problem, but proprietary long tail actually ranked first.

## 8. Pitfalls

**Don't judge correctness by how confident the tone sounds.** A model's fluency and its accuracy are basically unrelated — the smoother the answer, the more dangerous, because people don't go and verify it. My habit now: any answer containing a specific number, date, or clause number, I check the cited source.

**Don't ask the model "are you sure?"** Ask it to self-rate its confidence and you'll mostly get polite modesty or baffling overconfidence — neither is useful. Real confidence comes from retrieval hits, format validation, rule validation — external mechanisms, not the model's own word.

**Don't treat the four classes as "problems to eliminate."** They can't be eliminated. What you need is a definite handling path for each: add material where you can, refuse where you should, hand off to a human where you should. Admit it will be wrong, then design what happens when it is — that's delivery.

* * *

**《The AI-FDE Transition Path》**: written for IT implementation / pre-sales / operations people — and anyone else — who don't write code, to "AI-ify" the delivery skills they already have. 55+ articles, six domains, 53 skills.

Want to see what you're missing first? The AI-FDE skill self-assessment map: rate 53 skills, get a radar chart. [The AI-FDE Transition Path · Introduction](/docs/00-intro/)
