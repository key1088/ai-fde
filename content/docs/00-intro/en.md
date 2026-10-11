## 1. Let's Start with the Conclusion

I'll give the conclusion first: in this AI wave, the people in the most danger are not the ones who "can't write code" — they are the people who **only relay messages**, the ones who don't know how to use AI. And the people with the best odds are exactly those who have spent years on the client site and know how the business actually runs — and who know how to use AI.

I've spent more than a decade on client sites: implementation, pre-sales, management, and more than a few firefights. Over the past couple of years, talking with peers, the anxiety is universal — and the more you understand the business, the heavier it gets. Sometimes you don't know where the IT industry is heading, or where to push in AI.

The reason isn't complicated. Our most valuable skill used to be "translating what the client says into something developers can understand, and translating what developers build into something the client can accept." That translation work looks like it can be eaten by AI directly. It can write requirement docs, it can write SQL, it can write a reporting deck — who needs us? I think this anxiety is useful: at least it makes you see the value of AI. But how do we actually seize this opportunity?

![](/media/docs/00-intro/img-01.png)

Everyone says AI will eat "translation" first, then move up — and that's true. The "translation" work will be eaten. But here's the reality: what AI eats first is **mental work that carries no consequences** — writing a first draft, looking something up, assembling a proposal. What is genuinely hard to eat is three things: **knowing which client requirement is a real pain point and which is an offhand remark**; **knowing what a system has to get through before it runs in the client's server room**; **knowing who should be woken up at what hour when something breaks.** What these three share is that they own the outcome.

The most typical cautionary tale I've seen: a team wired an LLM into a client's knowledge base. The demo was great, the client nodded on the spot. Three weeks after go-live, it was switched off. Not because the model was bad, but because nobody had agreed with the client in advance on "what happens when it answers wrong," and nobody had told the account manager which questions must go to a human. Technical problems were 30% of it; the other 70% was nobody taking responsibility for defining the boundary.

So how do you solve this kind of problem? There's a name for this kind of work in the industry: FDE.

## 2. What Is an FDE

**FDE (Forward Deployed Engineer)** is not a new term, but it's hot this year — especially now that AI can actually help enterprises solve problems. This work used to be called a resident engineer, or you could call it outsourced staff: stationed at the client site, working alongside the client, helping them solve the last mile. An FDE role needs T-shaped people with composite skills; it's a scarce position.

My own view: the biggest difference between an FDE and a traditional resident engineer is that the traditional resident engineer starts from the requirements document, while the FDE starts from observing the business. One passively accepts requirements; the other actively solves real problems.

So in the AI+ era, what is an AI-FDE? In one plain sentence: **the person standing on the client site who owns the outcome of the AI system (begin with the end in mind).** They are not there to write code; they are there to make sure the thing actually works in the client's environment, is actually useful, and that when it breaks, someone really has their back. You may not be able to write code, but you can use AI tools to get the job done.

## 3. What Skills Does an AI-FDE Need

What does it take to become an FDE in the AI era?

I built an AI-FDE assessment page (with AI's help). You can use it to assess your own AI-FDE level and see what score you get.

Assessment site: https://ai-fde.dev/

You can also scan the QR code (press and hold, then scan to jump to the assessment site).

![](/media/docs/00-intro/img-02.png)

In the assessment I broke the AI-FDE role into six domains and 53 skills, each with a target level and a "what counts as knowing it." I didn't make these up — I worked backwards from what a client site demands and what client business needs demand.

The six domains of AI-FDE:

- Business Discovery
- AI Engineering
- Software Engineering
- Enterprise Integration
- Operations Engineering
- Delivery & Communication

![](/media/docs/00-intro/img-03.png)

The 53 skills of AI-FDE:

![](/media/docs/00-intro/img-04.png)

How are the 53 skills distributed across the six domains? Mainly AI Engineering, Business Discovery and Operations Engineering.

| Domain | Skills | Question it answers |
| --- | --- | --- |
| **Business Discovery** | **8** | **Should we do this scenario at all, and what is it worth** |
| **AI Engineering** | **16** | **What each stage of the model pipeline does, and how to locate a failure** |
| **Software Engineering** | 8 | How to plug into existing systems; how to accept someone else's work |
| **Enterprise Integration** | 7 | The hard gates: identity, permissions, audit, data staying in-house |
| **Operations Engineering** | **6** | **How it stays alive after go-live: observable, accountable, recoverable** |
| Delivery & Communication | 8 | POC, demo, docs, compliance, fallbacks, handover |

## 4. How to Become an AI-FDE

Based on the AI-FDE self-assessment map, I'll write at least one article for every skill to help people understand and learn it — at least 55 articles in all (including the intro and a closing piece). That's a big project.

55 sounds scary, but among them, the ones that truly require you to write code — you can count on one hand... well, maybe two hands, ha. Most of it is judgment and business-process ability.

The order above is the **capability map**. It answers "what does this role actually need to know." It is not the learning order.

I reordered a **fast path** by how quickly it pays off, and this series will be published in that order (subject to adjustment along the way):

| Batch | Domain | Why it goes first |
| --- | --- | --- |
| **Batch 1** | **AI Engineering (16)** | **The foundation. Without the pipeline, in Business Discovery you can't even judge "can this be done"** |
| **Batch 2** | **Operations Engineering (6)** | **Home turf for ops people; fastest to monetize; build confidence first** |
| **Batch 3** | **Business Discovery (8)** | **Once you know the technical boundary, you know what to ask** |
| Batch 4 | Software Engineering (8) | Makes your skills more professional; about applying, not grammar |
| Batch 5 | Enterprise Integration (7) | If it can't get into the enterprise's processes, everything before is wasted |
| Batch 6 | Delivery & Communication (8) | Deliver on site with more ease; serve the client better |

The three most important capabilities: an AI-FDE must master AI Engineering; next is Operations Engineering, because once you've put AI into a client's environment you must first guarantee it won't disrupt their business. With those two foundations, you can move into "Business Discovery," optimizing AI capability based on the enterprise's current situation — an "intelligent upgrade," if you like.

The last three: Software Engineering makes you more professional, so you can serve clients better and serve bigger clients; Enterprise Integration is about how to embed into business processes inside large enterprises; Delivery & Communication lets you deliver calmly on site.

## 5. What the Docs Look Like

This series follows a uniform format: "article title + AI-FDE Transition Path + module name + number." For example:

"First, Understand Exactly Where the Model Will Always Fail | AI-FDE Transition Path · AI Engineering 01"

That means it is article #1 of the AI Engineering volume. I don't use a global running number, because a reader who joins midway sees "article 39" with no frame of reference, and if a volume gets a new chapter later, the global numbers would all have to shift.

## 6. Who This Series Is For, and How It's Written

First, it's written for myself — to organize the content of my daily work and have a place to look back on it. Second, if my articles can help someone else, even better; the internet has always been about sharing.

With that second goal in mind, I try not to write anything too technical, so more people can understand it — people who **basically don't write code** but have real clients and projects: implementation, pre-sales, operations, project managers, who want to add FDE skills.

The series' stance is low-code first; code only as far as "can read it, can change it."

One more thing to flag: the clients, projects and names that appear in this series are **all fictional** — I can't write about real clients' project details, and you shouldn't treat the fictional numbers as industry benchmarks. Any numbers used will be marked "example numbers, only to demonstrate the algorithm, not a commitment."

## 7. A Few Honest Words to Finish

Reading all 55 articles won't automatically make you an AI-FDE. It gives you a map and a set of self-check standards. What actually transforms you is taking one real project and running all these skills through it. **Don't wait until you've learned everything to start — do it, and check yourself against the map along the way.**

* * *

If you can't find your direction, don't know what to do, and don't know what you like — take Lei Jun's advice: "If you don't know what you like, just start doing something, and you'll find it as you go."

I hope we can all find something we like, something we can do for the long term. Let's get moving. Subscriptions and shares are welcome.

**《The AI-FDE Transition Path》**: written for IT implementation / pre-sales / operations people who don't write code, to "AI-ify" the delivery skills they already have. 55 articles in all, six domains, 53 skills, at least one article per skill.
