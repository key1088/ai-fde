## 1. If You Can't Say Why a Prompt Is Better, You Haven't Changed Anything

My judgment is simple: **when you've changed a prompt, if you can't say clearly "what got better and by how much," then you haven't really changed it.**

**[In the previous piece we established that the model will definitely be wrong, and that its failures follow patterns](/docs/01-ai-eng-llm/).** This piece is about how to talk to it. The order of these two matters: only once you know where it fails do you know what to constrain in the prompt. Do it the other way around — start by learning a pile of "universal templates" — and what you learn is sentence patterns, not judgment.

![](/media/docs/02-ai-eng-prompt/img-01.png)

## 2. Why This Deserves Its Own Article

The prompt is the one place in an AI project that "**anyone can change, but nobody owns**." Developers can change it, product can change it, and a client who glances at it twice can suggest "add a line telling it not to make things up." Changing it costs nothing, so it gets changed most often — and most easily turns into an accident scene. There's no version control, and the same prompt behaves differently across models.

I once hit a real problem: a policy Q&A had been live for a month when the client said "it's been less stable than before lately." We searched all around — the model hadn't changed, the knowledge base hadn't moved — and finally found that three days earlier someone had changed one line in the prompt, adding "try to give the user a complete and detailed answer." The person meant well; the effect was that the model started forcing complete answers even where it had no material. Nobody remembered making the change, because there was no record.

So what I want is not "writing a good prompt" — it's **making the prompt traceable**. Anyone can adjust the wording, but changes must leave a trace and have a before/after comparison. That's why I compare it to code: does code only need to run? No — it needs to be reviewable, rollback-able, regression-testable.

Prompts are very basic in LLM applications, and also very important. In knowledge-base scenarios and in agent scenarios, the prompt has to be designed up front.

**Some people say that as large models keep iterating, prompts no longer matter much.** That's half right. It's true that as models get smarter, the prompt doesn't need to describe as much — for example, you no longer need to define a role — but the task description remains indispensable.

## 3. What a Prompt Is

Let's look again at what a prompt is. To understand prompts you first need one core point: **an LLM is fundamentally a model that predicts the next token given the context, and a prompt is the input we use to tell the model what problem to handle, what requirements to follow, and what information to base its answer on.**

A prompt is not a mysterious incantation, and it's not just the sentence you type in. It's the interaction interface between a person and a large language model, and an important means of controlling the model's behavior.

A prompt is the input information given to a large language model, used to guide the model toward generating the expected output.

![](/media/docs/02-ai-eng-prompt/img-02.png)

## 4. How to Write a Prompt, Again

You need to treat the large model as a **new colleague who just joined**. A new colleague has just come on board — how do you best assign work? How do you explain the role's responsibilities? You probably wouldn't use one sentence. You wouldn't say to a smart new hire, "just do a good job," and that's it, ha.

You'd explain four things clearly:

| Element | What to write | What happens if you omit it |
| --- | --- | --- |
| **Who it is, where the boundary is** | You are a bank policy Q&A assistant; you only answer policy-related questions | It takes on whatever the user talks about, even making things up about the weather |
| **What to do, in what steps** | First judge whether it's within the material; if not, say plainly that there's nothing | With no material it fills in its own |
| **How to give it the material** | Clearly mark "the following is retrieved policy text; the answer may only come from here" | It can't tell which part is material and which is the question |
| **What the output looks like, and when to shut up** | Fixed format + must cite sources + a fixed refusal line when nothing hits | Random format; refusal depends on its mood |

Of these four, the last is the easiest to miss and the most valuable. Emphasize to the model: **if you don't know, say you don't know.** The refusal condition is the core of the prompt. For the four classes of guaranteed failure from the previous piece, the fallback action is mostly written here.

## 5. How to Manage a Prompt, Again

**1. Keep prompts in files, not only in the platform's input box.** Change it in the platform and it's overwritten — who changed it, and when, can't be found. Put it in a file and into version control, just like code. Record each interaction's prompt yourself and refine it repeatedly.

**2. Write one line of record per change.** It doesn't need to be long; four fields are enough:

| Field | Example content |
| --- | --- |
| Time / person | 2026-09-28 / Xiaolin |
| What changed | Output-constraint section adds "when nothing hits, always reply with the fixed line" |
| Why | Client feedback: with no material the model still fabricated clauses |
| Expected impact | Refusal rate up, fabrication complaints down |

**3. Prepare a regression set of twenty to thirty questions.** Not many, but it must cover the four classes of guaranteed failure, plus a few "most common in the business" ordinary questions. The process: run it before the change and save the results, run it after the change, and look only at the questions whose results changed — how many got better, how many got worse, and which ones.

**When testing a prompt, always clear the previous session** — otherwise it easily pollutes the model's parsing. Why it pollutes the model is explained in detail in the next chapter.

My own experience: out of twenty questions, usually three to five will move, and among those there's always one or two that got worse. When you see one got worse, either change it back or accept the trade-off and write it down. **Being able to say "this change made class A better and class B worse, and I chose the former" — that's professional. Saying "it feels better" is not.**

## 6. What Counts as Knowing It

- You can produce the time, reason and impact of the last three prompt changes on this project.
- When the client asks "why is this answer different from last time," you have a record to check, not a guess.
- You have a fixed regression set, and you run it before and after every prompt change.

Two self-check questions: where are your prompts stored now? If they're in the platform's input box, that's the same as having no version control. Can you produce twenty regression questions within five minutes? If not, the next change is a gamble.

**Hands-on task** (do it in this section, don't wait for "someday"): export your project's main prompt from the platform, save it as a file, build the four-field change log above, then assemble twenty regression questions (four for each of the four failure classes, plus four of the most common ordinary questions).

This can be done in an afternoon, and once it's done the project has the property of being "maintainable" for the first time.

## 7. Pitfalls

**More examples is not better.** Examples pull the model toward the shape of the examples. I once did something dumb: to stabilize the output format I stuffed in four examples, all four with the same phrasing, and the result was that it learned to recognize only that phrasing — switch to another and the format falls apart. Examples should cover different phrasings; two or three is plenty. Otherwise you leave the model not knowing which to choose — don't make it guess what you mean.

**Don't stuff a pile of business rules into the prompt.** By the fifth rule you can't change anything, because changing one might affect the other four. Scenarios with many rules should use retrieval — put the rules in a knowledge base and let it fetch them on demand. That's for the two RAG pieces later.

**Lines like "you are a professional senior expert" are basically useless.** They don't change the model's probability distribution, they just consume tokens (because today's models are already smart). And tokens genuinely cost money — which is the subject of the next piece: context is a scarce resource, and we have to spend it carefully.

* * *

**《The AI-FDE Transition Path》**: written for IT implementation / pre-sales / operations people who don't write code, to "AI-ify" the delivery skills they already have. 55 articles in all, six domains, 53 skills.

Want to see what you're missing first? The AI-FDE skill self-assessment map: rate 53 skills, get a radar chart. [The AI-FDE Transition Path · Introduction](/docs/00-intro/)
