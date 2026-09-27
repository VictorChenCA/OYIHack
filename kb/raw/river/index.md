# Train LLMs and agents with River

River is an API for training and serving large language models (LLMs). Use
supervised fine-tuning (SFT) to teach models from examples, and reinforcement
learning (RL) to improve how they reason, use tools, and complete tasks.
Distillation transfers capabilities from stronger or better-informed teachers
into the model you want to deploy.

This handbook teaches you how to build effective LLM applications and agents:
choose a learning signal, prepare data or environments, run experiments,
evaluate the results, and deploy the trained model. You control the learning
loop in Python; River runs the training and inference.

<div class="docs-paths">
<a href="/quickstart/"><span class="docs-path-label">Start building ↗</span><strong>Make your first request</strong><span>Connect to River and generate a response.</span></a>
<a href="/guides/sft-concepts/"><span class="docs-path-label">Learn SFT ↗</span><strong>Learn from examples</strong><span>Teach the model what a good response looks like.</span></a>
<a href="/guides/rl-concepts/"><span class="docs-path-label">Learn RL ↗</span><strong>Learn from rewards</strong><span>Let the model try, score its work, and update it.</span></a>
</div>

## From an LLM to an agent

An LLM generates a response from a context: a prompt, a conversation, or
observations from an environment. Its **weights** shape the probabilities of
what it generates. Sampling produces a response using those weights; training
updates the weights to change the model's behavior.

An **agent** uses an LLM in a loop to work through a task. The model can choose
a tool call, your program executes it, and the result becomes context for the
next decision. For example, a coding agent might inspect a file, edit it, run
tests, and use the failures to decide what to try next. Its performance depends
on the model, the tools and context you provide, and how you run that loop.

<figure class="docs-learning-figure">
<div class="docs-flow">
<div><strong>Your context</strong><small>A question, a conversation, or observations from an environment.</small></div>
<span aria-hidden="true">→</span>
<div class="docs-model"><strong>LLM</strong><small>Sample a response. Update its weights from examples or rewards.</small></div>
<span aria-hidden="true">→</span>
<div><strong>A response</strong><small>Text, reasoning, or a tool call that you can inspect and evaluate.</small></div>
</div>
<figcaption>For an agent, tool results and new observations feed back into the context for the next model response. Training changes the model that makes those decisions.</figcaption>
</figure>

A better prompt changes the context for one request. Training changes the model
that will respond to future requests. A **checkpoint** saves a version of those
trained weights so you can evaluate it, resume training, or deploy it.

## Choose your learning signal

| Method | Learning signal | A useful starting point |
| --- | --- | --- |
| Supervised fine-tuning (SFT) | Desired responses paired with inputs | You can show what good work looks like. |
| Reinforcement learning (RL) | Scores for generated responses or interactions | You can reliably judge the outcome. |
| Distillation | Teacher demonstrations or token probabilities | A stronger model, specialist, or extra context can supply better supervision. |

SFT and RL can be used together. SFT can establish a response format or initial
behavior; RL can improve outcomes through experience. Start with a baseline
measurement so you know whether either approach helped.

## Find your path

- **Get a result:** [Quickstart](/quickstart/) → [first SFT run](/guides/sft/)
  or [first RL run](/guides/rl-sync/).
- **Understand the API:** [How the API works](/guides/api-basics/) introduces
  model instances, sampling, and training updates.
- **Understand the methods:** [Learning from examples](/guides/sft-concepts/) →
  [Learning from rewards](/guides/rl-concepts/) → [Tools and environments](/guides/rl-tools/).
- **Run a larger experiment:** [Asynchronous training](/guides/rl-async/) →
  [Policy versions](/guides/rl-policies/) → [Evaluation and recovery](/guides/rl-checkpoints/).
- **Transfer capabilities:** [Distillation overview](/guides/distillation/) covers
  smaller students, self-distillation, and combining specialists.
- **Serve your model:** [Save weights](/guides/checkpoints/) →
  [Deploy and serve](/guides/deployments/).

The chapters assume familiarity with LLMs, agents, and Python. They introduce
SFT and RL through worked examples, then explain the objectives, data formats,
and tradeoffs behind the code. Knowledge of transformer architecture or
distributed training is not a prerequisite.

If you already train models, go directly to [loss functions](/guides/losses/),
[token-level RL updates](/guides/rl-primitives/), or
[policy versions and trajectory control](/guides/rl-policies/). These chapters
cover details such as loss normalization, token alignment, and policy staleness
that affect the experiment. The [Python reference](/python-api/) provides the
exact method signatures, defaults, and API contracts.
