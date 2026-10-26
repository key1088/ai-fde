## 1. What Is Context

Context is the surrounding information. How should we understand it? People with a technical background get it fairly easily, but for those without one it can be quite hard to grasp. It can also be called the surrounding circumstances.

And how should we understand those circumstances? For example, Xiao Wang and Xiao Ming are chatting, and Xiao Wang tells a joke. Xiao Ming hears it and bursts out laughing. Xiao Liang sees this and is curious, so he asks them why they are laughing. Xiao Wang tells Xiao Liang the whole story behind the joke, and Xiao Liang starts laughing too. The content they talk about among themselves is the Context, the surrounding information.

## 2. The Relationship Between Prompt and Context

A prompt is the input text—generally, a prompt refers to the content of a single output; if mapped onto humans, it is the content of one interaction (Xiao Wang says something to Xiao Ming). A prompt is one interaction's content within the Context; it can be a single sentence or a passage.

![](/media/docs/03-ai-eng-context/img-01.png)

The real formation of Context starts at ②, that is, from the first sentence, accumulating and increasing context through ③ and ④, and ending the conversation at ⑤, when the two people leave.

The difference between humans and large models in conversation: **humans have memory, while large models have no memory—whatever you say to the AI, it only remembers the sentence you just said to it.**

## 3. Context and Large Models

As just mentioned, a large model only remembers what you just said—it has no automatic, persistent chat memory. So how do you interact with a large model multiple times? How does DeepSeek's chat do it? You can't just ask one question, get one answer, and be done, right?

Here's how it works: when you say your second sentence, the program sends "the content of your first sentence" + "the content of the model's first answer" + "the content of your second sentence" all together to the large model.

And for the third sentence? The program sends "the content of your first sentence" + "the content of the model's first answer" + "the content of your second sentence" + "the content of the model's second answer" + "the content of your third sentence" all together to the large model.

The fourth, fifth, sixth, Nth—all the same. Sentences 1 through N plus the model's answers—that's the Context. See the figure below to get a better sense of what Context means.

![](/media/docs/03-ai-eng-context/img-02.png)

Every time you interact with the large model, all the previous chat information is sent to it, so the model knows what's been discussed—like a snowball rolling and getting bigger and bigger. Is there an upper limit to a large model's context? Of course there is. For example: according to DeepSeek's official documentation, as of October 2026.

| Model | Maximum context window | Maximum output length |
| --- | --- | --- |
| DeepSeek-V4-Pro | 1,048,576 Tokens (about 1M) | 393,216 Tokens |
| DeepSeek-V4-Flash | 1,048,576 Tokens (about 1M) | 393,216 Tokens |

So here's the question: **what exactly is a Token?**

A Token is the basic unit a large model uses when processing text. One Chinese character may correspond to one or more Tokens; an English word may also be split into multiple Tokens. What determines how it's split—does even a single English word get split? That's determined by the tokenizer the large model uses and its vocabulary.

The snowball keeps growing. What if it exceeds the maximum context window? If it really does, the large model can't handle it—it throws an error and gives up.

## 4. Conversation Compression

When designing a product, the context size is always planned so that it does not exceed the model's maximum context window. When an interactive conversation is about to exceed the threshold set in the product design, the program compresses the model's conversation, having the model summarize the previous Context content and extract it into a summary. This summary then becomes the Context, and the size of the Context is reduced.

Besides compression, there are many other ways to reduce the size of the Context.

1) Truncation

Once the set limit is exceeded, the earliest conversation is discarded.

Example: keep only the most recent 200 messages; when a new message comes in, the earliest message is deleted.

![](/media/docs/03-ai-eng-context/img-03.png)

2) History Filtering

Based on rules or relevance, pick out the historical information related to the current question.

Example: when the user asks about database selection, keep only the earlier content that discussed databases.

3) Retrieval

Store historical information and look it up when needed, rather than sending all of it to the model every time.

Example: when the user asks "What database did we settle on earlier?", the program finds the relevant content from the history records.

4) Summarization / State Extraction

Condense a large amount of conversation into brief key information.

Example: summarize multiple rounds of discussion as "Tech stack: Spring Boot + MySQL; current task: optimize query performance."

5) Hierarchical Memory

Store information in layers, and use content from different layers as needed.

Example: recent conversations go in the current context, important project decisions are stored separately, and old materials are retrieved when needed.

6) Sliding Window

Keep only the most recent stretch of conversation; as new content comes in, old content gradually moves out.

Example: always keep the most recent 10 rounds of conversation. This can be seen as one way of implementing truncation.

7) Token Budgeting

Allocate token quotas to different kinds of content so that no single part takes up too much space.

Example: limit the length of retrieved materials and reserve space for the current question and the model's answer.

8) External Memory and Persistent Storage

Save important information to a database or file, and retrieve it when needed.

Example: save the project's tech stack, business rules and key decisions, and read them on demand in later conversations.

## 5. Hallucinations in Large Models

When your Context grows larger and larger, the information described in the Context increases, and when a large model reads data without rules, it may no longer be able to find the key points. A bit described here, a bit described there, and the large model starts to hallucinate—this is one of the reasons large models produce hallucinations.

When your Context grows larger and larger, you enable the large model's session compression feature, condensing a large amount of content into a short segment of session. Do you think the condensed data can still preserve the original meaning? Isn't it the case that the large model has hallucinated here too? This is also one of the reasons large models produce hallucinations.

Therefore, improper context management and distortion from session compression can both increase the risk of large models producing incorrect answers or hallucinations.

## 6. Memory in Large Models

Memory — as we said earlier, Context is the information a large model can see when generating its current response. But if we send all historical conversations to the large model every time, not only does it consume a large number of Tokens, we also need to send every previous conversation to the large model for it to remember the earlier content.

So here's the question: if we don't put all historical conversations into the Context, how does the large model remember earlier information?

This is where Memory comes in.

For example, in one conversation you tell the AI: "I'm developing a Spring Boot project, the database is MySQL, and the JDK version is 17."

A few days later, you start a new session and ask: "Help me optimize the query performance of this project."

If the AI can remember the earlier project background, it can answer directly based on that information without making you introduce it all over again.

So how is this information stored?

In real applications, memory is usually **not** the large model automatically and permanently saving all conversations. Instead, the application extracts important information and saves it to history records, a database, or other storage. It could be an MD file, a JSON file, or some database data.

When later conversations need this information, it is retrieved, put into the current Context, and sent to the large model.

For example, the workbuddy you use records your memory. Even when you open a new task, it sends your personal preferences along with the question to the large model, which reduces time cost.

## 7. What Is Context Engineering?

After reading the previous sections, you may have realized that context management is not just about sending chat history to a large model.

We need to consider: which information should be kept, which should be removed, how to compress historical conversations, how to store memory, and when to retrieve information from a knowledge base.

If these tasks are not done well, even a highly capable large model may give wrong answers due to missing key information, confused context, or distorted historical information.

Therefore, we need to design these tasks as an engineering discipline—this is Context Engineering.

In practical applications, context engineering usually needs to consider the following aspects:

**Information sources:** System instructions, user input, historical conversations, memory, knowledge bases, and tool execution results.

**Information filtering:** Determine which information is relevant to the current task and avoid irrelevant content interfering with the model.

**Information management:** Truncate, summarize, and compress historical conversations to control the size of the context.

**Information retrieval:** When needed, obtain relevant information from knowledge bases, databases, or historical records.

**Context assembly:** Organize the filtered information reasonably and then send it to the large model.

Moreover, context engineering is especially important in RAG and Agent product design, as it directly affects product quality.

**The large model determines what the model can do, while context engineering largely determines whether it can obtain the correct information in a specific task and bring its capabilities into full play.**

## 8. Context Is Money

Both input and output are billed by token, and every request has to carry the entire context again. A 5,000-token system prompt, called 10,000 times, is 50 million tokens. At the level of a single stage, this cost is invisible; once you scale up, the bill amount is the most eye-catching line. As compute increases, this cost should get cheaper and cheaper—as cheap as bandwidth.

* * *

**"The AI-FDE Transition Path"**: written for IT implementation / pre-sales / operations people who don't write code, to "AI-ify" the delivery capabilities they already have. 55 articles in the series, 53 skills across six modules.

Want to first see what you're missing: the AI-FDE Skills Self-Assessment Map, 53 items scored, producing a radar chart. [The AI-FDE Transition Path · Introduction](/docs/00-intro/)
