## 1. First, What RAG Is

Let's break the term down first, because it's been made out to be far too mysterious. RAG does just one thing: it lets the model take an open-book exam.

The model is normally on a closed-book exam—it can only answer from what it memorized during training. If it remembers, it answers nicely. When it doesn't remember clearly, it won't say "I don't know"—it keeps making things up in the same tone, and the made-up answer flows smoothly, with all the punctuation in the right place. That's why when you ask it about the details of some bank's internal policy, it can give you a passage that reads exactly like the real thing but is a regulation that doesn't exist at all.

An open-book exam is different: 1) you ask a question, the system first goes through your materials and finds the relevant pages, 2) it hands those pages to the model along with the question, 3) it has the model put it into plain language based on those pages and tell you which page the source is on—and if it can't find it, have it say "I don't know."

The three letters of RAG map exactly to three steps:

| Letter | Original word | In plain terms | Who's doing the work | Dependency |
| --- | --- | --- | --- | --- |
| R | Retrieval | Go find the relevant passages in your documents | The program finds them, not the model | Depends on the program, the vector store |
| A | Augmented | Stuff the found passages into the question and hand them over together | Assembly, pure engineering work | Depends on the LLM |
| G | Generation | The model turns these materials into plain language | This step is the model | Depends on the LLM |

So RAG isn't about making the model smarter; it's about making the model make things up less, giving the LLM something to base its answer on.

![](/media/docs/04-ai-eng-rag/img-01.png)

This is the one sentence I most want non-technical colleagues to remember—it determines everything that follows: since most of the work is done by retrieval, when the answer is wrong, suspect the retrieval steps first, not the model.

Why do customers like banks almost have to go this route? Three reasons, all very practical:

Policies change. The travel expense standard this year isn't the same as next year, and after it changes you can't wait for the model to relearn everything. With RAG, you just upload the new document into the store and it can answer with the new version the next second.

There must be sources. When the customer asks "on what grounds did you answer that," you need to be able to point to the exact chapter and article in the original text. An answer without a source is, in the compliance department's eyes, no answer at all.

Materials don't leave the premises. Internal policies can't be handed over to an outside model for training, but they can be retrieved within your own environment.

## 2. Why RAG Is Needed

When people talk about RAG, they usually mean a knowledge base, but real RAG refers to the application of knowledge base retrieval + LLM.

Can't we just use a large model alone? Why do we also need a knowledge base?

As we said in the previous chapter, a large model does not actively store conversation information. Every conversation requires sending the previous conversation to it before it knows what you are talking about.

[The AI-FDE Transition Path · AI Engineering 03-Context-Engineering](/docs/03-ai-eng-context/)

A large model is a static black box. Once training is complete, its knowledge data is fixed. A large model's knowledge reserve mainly comes from the corpus given to it during training. Of course, it definitely does not know the news after training ended, and it knows even less about your company's internal information (because it was not given your company's internal data during training).

For example: the date of Deepseek's training data (ask about it on the web version)

![](/media/docs/04-ai-eng-rag/img-02.png)

Caption: Screenshot of the Deepseek web page

Knowledge is updated every day, but large models are not updated every day. So what should be done? Do we really need to train the large model once a day? NO, NO, NO—the cost of that training is too high. This is where the knowledge base comes in. The large model is a static black box, and the knowledge base is dynamic incremental data. For a large model to learn new knowledge, besides training, it can load the knowledge base in real time.

A knowledge base can be thought of as a larger Prompt, a larger Context. The knowledge base can be updated at any time, and it is also data that the enterprise can see. Private and sensitive data can be placed in the knowledge base, so there is no need to retrain the model, and the large model can still be used to process the enterprise's own data.

When the knowledge base is small, the entire knowledge base can be sent to the large model, letting the model load it as Context and then converse with it. When the knowledge base data is especially large, the entire knowledge base cannot be sent. You need to first retrieve the data you need, then send "the data you retrieved" + "your question" to the large model, and let the model generate the result you want.

Small tip: The Deepseek, Qwen, GPT, and Gemini we use every day are all general-purpose large models. Some models target vertical domains, including Baichuan Intelligence's Baichuan, JD Health's Jingyi Qianxun, and Huawei Cloud's Pangu large model. Vertical models contain data specific to the industry, which makes the large model's knowledge richer and more flexible.

## 3. The Most Important Knowledge Points of RAG

After the user asks a question, split the user's question, use the split questions to retrieve from the knowledge base, then send the retrieved content + the user's question to the large model, and the large model handles the question for you. The real difficulty now is the quality of knowledge base retrieval. If the corresponding content can be retrieved, current large models can answer the question better. If no data can be retrieved, or the retrieved data is poor, no matter how good the model is, it cannot solve your problem. For general questions, the large model + the data retrieved from the knowledge base can be handled normally. But there are some technical terms and domain-specific knowledge that general large models do not know, and in such cases there is no way to answer; the technical terms and domain-specific knowledge need to be sent to the large model together, which can solve this kind of problem. This is also why some companies specifically train large models for vertical domains.

![](/media/docs/04-ai-eng-rag/img-03.png)

## 4. Where RAG Is Used

Now that we've covered what it is, let's talk about where it's used. Based on the criterion of "customers will actually pay for it," I've listed five types—all of which I or peers have done (projects and clients are fictional examples, used only to illustrate the method):

| Scenario | Typical question | Why it fits | What to watch |
| --- | --- | --- | --- |
| Policy / regulation Q&A | "What's the lodging standard for travel" "How many approval levels does this need" | Many documents, fast updates, must cite sources | Versioning: old and new documents sit in the same repository; answering with the old one is an incident |
| Initial review of business materials | "What's missing from this credit material" "Are there contradictions in the clauses" | Rules are clear, can be turned into a checklist | It can only "flag," not "judge"; final review must stay with a human |
| Customer service / agent assistance | "How is this product charged" | Scripts must be consistent; agents shouldn't make things up | Wrong answers get screenshotted by customers; the script library must be maintained separately |
| Internal IT / ops knowledge base | "How was this error handled last time" | Veteran experience gets captured; no need to find someone every time | Poor records mean garbage in, garbage out |
| Contract / official document clause lookup | "What does this contract say about liability for breach" | Flipping through long documents manually is slow; machines locate fast | Long documents get split easily, chopping clauses apart—better to keep overlap |

Conversely, these four categories should not be forced onto RAG (this point matters more than the table above, because the pitfalls all come from "assuming it can do everything"):

1) Things that require precise calculation.

Amount totals, transaction counts, cross-table differences—the model's arithmetic is unreliable. These should be computed by the system; the model is only responsible for explaining the results clearly.

2) Things that require real-time data.

Current balance, current queue length, today's exchange rate—RAG retrieves static documents. These should go through APIs, and the results then handed to the model.

3) Things that require horizontal aggregation across dozens of documents.

One retrieval only brings back a few passages—not enough room for dozens of documents. Either structure the data into a database first, or break it into multiple rounds.

4) Things whose answers simply aren't in any document.

Matters that rely on experiential judgment—retrieval finds nothing, so the model makes things up—and this time it makes them up with particular confidence.

To wrap up in one sentence: RAG suits cases where "the answer is written in some document, but it's slow for people to find." Anything that doesn't meet this criterion—don't start with it.

## 5. What Platform to Use for RAG

Now that we've covered what it is and where it's used, the next question is naturally "what to build it with." My take: the trap in platform selection isn't "who has the most features," it's "which constraint can't you avoid." Use the process of elimination to filter platforms.

There are roughly three paths:

Path one: open-source self-hosting. Find a server, install it yourself, and all data stays in your hands. Suited to intranet, strong compliance, and scenarios that need long-term operations.

| Platform | One-line positioning | Who it suits | What to watch |
| --- | --- | --- | --- |
| Dify | The most all-around: knowledge base + visual workflows + multi-model access | Teams that need custom flows and integration with other systems | Complex document parsing is average; needs someone to operate it |
| RAGFlow | Strongest document parsing: scanned files, tables, multi-column layouts all handled | Hard-nut documents like contracts, reports, manuals | High hardware requirements, high tuning threshold |
| MaxKB | Out of the box, interface designed for business users | Departments with few technical staff that want to get running fast | Weaker deep customization |
| FastGPT | Mature knowledge-base Q&A, good at cleaning Q&A pairs | External-facing Q&A, standard FAQs | Newer versions shift focus to agents; large-document parsing isn't a strength |
| AnythingLLM | Desktop-grade, runs on a personal computer | Figuring it out yourself first, building a prototype | Weak Chinese handling and permission system; not suited to strict compliance scenarios |

Path two: large and mid-size vendor platforms. Cloud vendors offer public cloud products that work out of the box. They also support private deployment and personalized customization for different scenarios. Common customer choices:

| Platform | One-line positioning | Who it suits |
| --- | --- | --- |
| Volcano HiAgent | Multi-tenant + complete evaluation and monitoring system, rich private deployment experience | Large groups managing applications across multiple departments |
| Alibaba Cloud Bailian | Tongyi series foundation, integrated with Alibaba Cloud products | Those already on Alibaba Cloud |
| Tencent Cloud ADP | Integrated with WeCom and Tencent Meeting, supports private and hybrid cloud | Those wanting to put Q&A into employees' daily communication tools |
| Baidu Qianfan | Strong Chinese semantic retrieval, supports private deployment and Xinchuang adaptation | Strong compliance, Xinchuang adaptation, knowledge-intensive scenarios |
| Products from leading IT companies in various industries | Personalized product customization based on requirements, closer to the industry | Suited to enterprises with in-house R&D capability |

When selecting, I only look at four hard constraints. These four were sorted out only after getting burned:

1) Can it run on the intranet.

When a client says "must be intranet," this one alone eliminates half the options—no room for negotiation, don't count on changing it later.

2) Can it pass domestic localization and Xinchuang requirements.

If the client specifies chips, operating systems, or databases, the platform must be able to adapt, or acceptance will get stuck here later.

3) Can it print out the intermediate retrieval results.

This one is the easiest to overlook, but it directly determines whether the work in Section 4 can be done—a platform where you can't see intermediate results is like asking you to fix the pipes blindfolded.

4) Can the data be exported and taken away as a whole.

Whether documents, vectors, and configurations can be exported determines whether, three years from now, switching platforms is a move or a rebuild.

One practical piece of advice to finish: don't spend two weeks on selection. My approach is to first use Dify to get one chain working end to end (documents go in, questions come out, sources can be clicked open). Once it works, you'll know what you actually need; then selection takes a week. Conversely, people who select first and act later often find, after choosing, that the thing can't chew through their batch of documents at all.

I previously wrote a set of Dify usage tutorials you can refer to (of course, Dify isn't just a knowledge base). Click the link below to view the Dify hands-on tutorials.

[Dify Hands-on Tutorials](https://mp.weixin.qq.com/mp/appmsgalbum?__biz=MjM5MDMwMTQ0Nw==&action=getalbum&album_id=4495053795147841541#wechat_redirect)

One more thing that must be said: a platform can't save bad data. The same batch of messy scanned files won't be answered accurately on any platform—the document side of things will be covered separately later.

For non-complex business scenarios, choosing a low-code development platform is enough to meet the requirements. But truly complex business still needs a high-code platform, requiring custom code to meet business requirements. Most scenarios actually running complex business today require customized development.

## 6. What to Do When the Answers Are Inaccurate

When the answers are inaccurate, don't doubt the model first. My judgment is this: when a client says "the answers are inaccurate," seven or eight times out of ten the problem isn't in the model segment—it's in the steps before the model is called (you can read the RAG principles in Section II in detail).

In the second month after Hengxin Bank's intelligent policy Q&A went live, Director Wang sent over screenshots of several wrong answers and said, "Is this model not quite up to it?" (The following clients and projects are fictional examples, used only to illustrate the method.) The first reaction of Lao Zhou on our team was the same as most people's: try swapping in a bigger model.

I stopped him. Not because swapping models is useless, but because at that point we still didn't know where the error was—if it got a few right after the swap, we wouldn't know why it got them right; and if it was still wrong, the only move left would be "swap another one." And swapping models is the most expensive option: you have to re-integrate, re-test, and re-run the client's evaluation.

The first thing you should actually do is split the pipeline open and find the broken segment.

Here's an analogy. Something's wrong with the tap water in your house—it could be the water plant, it could be the pipes, or it could be the tank on the roof. You wouldn't start by replacing the water plant—you'd first fill a glass and look, to see whether the problem is "it never arrived" or "it arrived but has impurities."

Knowledge base Q&A is also a pipe. From document to answer, it goes through seven segments:

1) parsing → 2) chunking → 3) vectorization → 4) retrieval → 5) reranking → 6) generation → 7) citation tracing

The first four segments determine "whether the correct material gets brought up." The fifth determines "what rank the correct material lands at." The sixth determines "whether it can answer correctly given the material." The seventh determines "whether the client trusts it."

Most people treat these seven segments as a black box: input a question, see whether the final answer that comes out is right. If the answer is wrong, all they do is swap the model—but the model is only the sixth segment. If you pin the problems from all seven segments on it, it really is being wronged.

Here's a very low-effort triage step, and the one I most want you to remember: print out the intermediate results. Specifically, add a step after Lecture 04—every answer also displays "the passages of original text retrieved this time." With this step, you can cut the pipeline in half in one shot:

The material contains the correct answer, but the final answer is wrong → the problem is in reranking or generation (segments five and six)

The material doesn't contain the correct answer at all → the problem is in the first four segments, and has nothing to do with the model

This step can be done right in the debugging interface, without changing code. Every time I take over a project with "inaccurate answers," the first thing I do is require that it be turned on.

## 7. A Troubleshooting Reference Table

This is the thing I took away with me. When you get a batch of wrong answers, classify them one by one against this table:

| Symptom | Suspect stage | Verification action |
| --- | --- | --- |
| The answer is completely off-topic, as if discussing a different policy | Parsing / chunking | Take keywords from the answer and search the full original text to see if that passage can be found — if not, it never made it into the store |
| On-topic, but details are wrong (clause numbers, amounts, dates) | Chunking / retrieval | Print the top K returned chunks and check whether the correct one is among them and what rank it holds; if it's fourth or fifth, it's basically not contributing |
| The correct material is indeed in the top ranks, but the answer is still wrong | Reranking / generation | Manually move the correct chunk to first place and rerun; if it answers correctly, it's a ranking problem — if it's still wrong, it's a generation problem |
| The answer is right, but the client won't accept it | Citation traceability | Check whether a source is returned and whether it points to this chunk; an answer with no source is as good as no answer in the eyes of financial clients |
| It falls apart when the question is rephrased | Embedding / query rewriting | Ask the same question three different ways and see whether the hits are stable; poor performance on colloquial phrasing is a common weakness |

I use this table a lot, because it translates "the answers aren't accurate" — a description you can't act on — into "what to verify next."

One dose of realism: in the projects I've worked on, classifying against this table usually puts the bulk in the first two stages (parsing and chunking) (example figures, for illustration only: most projects are above forty percent, and a few reach sixty). That's also why the next lecture singles out document parsing.

## 8. What Counts as Knowing It

A client sends you a screenshot of a wrong answer, and within five minutes you can say, "I suspect it's paragraph X — here's how we verify."

In your project's backend, you can see "which paragraphs of source text were retrieved this time." If you can't see that, you're debugging inside a black box.

You can produce a pie chart of the classification results: how much of the error comes from the first four paragraphs, how much from the later ones. If you can't give that ratio, you haven't done triage yet.

One self-check question: when you debug right now, are you looking at the final answer, or at those intermediate paragraphs of material? People who only look at the final answer are fixing the pipes blindfolded.

Hands-on task: first find the platform and build out the pipeline. Then pull the last twenty wrong answers from your project, classify each one against the table above, and count how many fall into each category. When you're done, you'll find that the top one usually isn't the one you expected.

## 9. Pitfalls

Skipping diagnosis and going straight to optimization. The most common waste: changing the prompt, adjusting temperature, adding hints without classifying first. After the change it looks a bit better, but what actually happened is you rescued one category and made another worse—and you don't know which category.

Only looking at the top-ranked chunk. What the model actually read is the truth. Print the top five chunks and look—you'll often find the correct answer sitting at position four: it did find it, it just ranked too low.

Treating "hit rate" as the only metric. The term "hit rate" means completely different things to different people: some mean retrieval hit, some mean answer correctness. Align on definitions before discussing metrics, otherwise at acceptance time the two sides aren't talking about the same thing at all.

In the end, RAG applications are engineering work with quick wins and high marginal cost for later improvements. The applications everyone builds end up with similar results. If you want 10% more quality than others, that takes another round of effort.

To squeeze out that extra 10% on RAG, the focus is: at the data layer, do structure-aware chunking, quality-tiered routing, and metadata; at the retrieval layer, use hybrid retrieval, RRF, reranking, and query rewriting to improve ranking quality; at the generation layer, add answerability judgment, faithfulness constraints, and citation tracing; at the evaluation layer, do stage decomposition, failure attribution, and a feedback loop. Prioritize investment in chunking, metadata, reranking, and stage-level evaluation. This part needs to be handed to the R&D team—it's not FDE work.

The next lecture digs further: since the first two stages account for the bulk, we'll focus specifically on the first stage—document parsing.

* * *

"The AI-FDE Transition Path": written for non-coding IT implementation / pre-sales / operations people, to "AI-ify" the delivery skills you already have. 55 articles in the series, 53 skills across six modules.

Want to see what you're missing first: AI-FDE Skills Self-Assessment Map, score 53 items, get a radar chart. [The AI-FDE Transition Path · Introduction](/docs/00-intro/)
