# Learning from examples

Supervised fine-tuning (SFT) trains an LLM to produce responses like the examples
you provide. You choose the demonstrations and which parts of them contribute
to learning. River computes the training updates.

By the end of this chapter, you should be able to explain what the loss measures,
why we mask prompts, and why a lower training loss does not prove a better model.
For executable code, follow [Your first SFT run](/guides/sft/).

## Begin with the behavior

Suppose your application needs to turn a support request into a structured
record. A demonstration pairs what the model will see with what it should say:

| Input | Desired response |
| --- | --- |
| “My parcel arrived with the screen cracked.” | `{"category": "damaged", "action": "replace"}` |
| “Where is my order?” | `{"category": "tracking", "action": "check_status"}` |

The response is the supervision. It might be a JSON record, a paragraph, a tool
call, or a longer conversation. Training encourages the model to produce those
responses in their corresponding contexts.

Write the task definition before collecting examples. Decide what a correct
response contains, what information is available at inference time, and how
you will score unseen cases. A model can imitate inconsistent examples without
learning the behavior you intended.

## What the model is learning

A model produces text as a sequence of **tokens**: pieces of text represented by
integer IDs. Given the context so far, it assigns probabilities to possible next
tokens. SFT uses those probabilities to measure how well the model predicts
your demonstrations and to compute the training objective.

During training, the model sees the correct prefix from the demonstration and
is asked to predict the next demonstrated token. This is called **teacher
forcing**. During generation, it instead continues from the tokens it has already
produced, including any mistakes.

<figure class="docs-learning-figure">
<div class="docs-flow">
<div><strong>Demonstrations</strong><small>Context + desired response</small></div>
<span aria-hidden="true">→</span>
<div class="docs-model"><strong>Training update</strong><small>Increase the probability of the demonstrated tokens.</small></div>
<span aria-hidden="true">→</span>
<div><strong>New requests</strong><small>Generate responses and measure the behavior.</small></div>
</div>
<figcaption>SFT learns from supplied answers. Evaluation asks whether that learning transfers to new inputs.</figcaption>
</figure>

The **cross-entropy loss** measures how little probability the model assigned to
the desired token. For one prediction, it is the negative natural logarithm of
that probability:

<div class="docs-equation">Token loss = −log <var>p</var>(desired next token | context)</div>

If the desired token has probability 0.1, its loss is about 2.30. At probability
0.5, the loss is about 0.69. At probability 0.9, it is about 0.11. A smaller loss
means the model assigned more probability to that token; it is not a percentage
of correctly answered tasks.

## Learn from the response, condition on the prompt

The prompt provides context. Usually, you want the model to learn the response
without spending the training objective on reproducing the prompt. A **loss
mask** assigns zero weight to prompt predictions and nonzero weight to response
predictions. The prompt still influences every response prediction.

The important alignment is that input position *i* predicts token *i + 1*.
The last prompt position therefore predicts the first response token.

<figure class="docs-learning-figure">
<table>
<thead><tr><th>Prediction position</th><th>0</th><th>1</th><th>2</th><th>3</th></tr></thead>
<tbody>
<tr><th>Input token</th><td class="docs-context">P₁</td><td class="docs-context">P₂</td><td>R₁</td><td>R₂</td></tr>
<tr><th>Next-token target</th><td class="docs-context">P₂</td><td class="docs-target">R₁</td><td class="docs-target">R₂</td><td class="docs-context">—</td></tr>
<tr><th>Loss weight</th><td>0</td><td class="docs-target">1</td><td class="docs-target">1</td><td>0</td></tr>
</tbody>
</table>
<figcaption>A schematic with two prompt tokens (P) and two response tokens (R). The final slot has no next-token target in this example. Real data also needs the model's response-ending tokens.</figcaption>
</figure>

River's core training data uses `input_ids`, optional `target_tokens`, and
per-position `weights`. The [SFT walkthrough](/guides/sft/) builds these arrays
explicitly so you can inspect them. For conversations, use the chosen model's
chat format and include the expected end-of-response markers. Training and
inference must agree on that format.

> [!WARNING]
>
> **A loss mask does not hide context.** Masking and attention are different: a token can be visible as context while
> contributing no direct loss. In multi-turn data, choose which assistant turns
> should be learned; do not accidentally train the model to generate user messages
> or tool observations.

## What happens in one step

A **batch** is a collection of training examples. A forward/backward operation
computes the loss and accumulates gradients: the direction in which the
trainable weights should change. An optimizer step applies an update using those
gradients. The **learning rate** controls the scale of that update.

In River, `model.forward_backward(..., loss_fn="cross_entropy")` and
`model.optim_step(lr=...)` expose those two operations. `model.train_step(...)`
combines them for the common case. This is an interface to training; you do not
implement differentiation or move tensors between GPUs.

River's core loss is a weighted sum over token positions. Doubling the number of
contributing tokens can change both the reported loss and gradient scale. Compare
runs with consistent weighting and normalization; a larger raw loss can simply
come from a larger batch. See [Loss functions](/guides/losses/).

The examples train **LoRA adapters**, a smaller set of trainable parameters added
to a fixed base model. Think of an adapter as the learned adjustment you save
alongside the base model's identity. [Choosing an adapter](/guides/lora/) explains
the settings you control.

## Build a dataset that can teach the task

Start with a small collection you can inspect. Include realistic inputs,
consistent answers, and cases where the correct behavior is to decline, request
missing information, or use a tool. Remove accidental secrets and information
that the model would not have when serving a real user.

Split the data before tuning. Keep related records, duplicate questions, and
variants of the same underlying case together so that the held-out set tests
new cases. A random row split can overstate generalization when examples are
near duplicates.

Sample from the base model first. If it already performs well, a prompt change
may be sufficient. If training is warranted, keep that baseline for comparison.

## Decide whether training helped

> [!WARNING]
>
> **Lower loss does not prove a better model.** Training loss answers “How well does the model predict these demonstrations?”
> Your task metric answers “How well does it perform the work?” Track both.

| Observation | Interpretation to investigate |
| --- | --- |
| Training loss falls; held-out task quality improves | Learning is transferring to the measured task. |
| Training loss falls; held-out quality gets worse | The model may be overfitting or losing useful behavior. |
| Both remain poor | Inspect examples, formatting, masks, and update settings. |
| Outputs have the right shape but wrong content | Format imitation alone has not solved the task. |

Evaluate with the prompt format and generation settings you intend to use.
Inspect actual responses as well as aggregate scores. Save checkpoints so you
can choose the model that performs best on held-out tasks, rather than assuming
the last update is best.

**Try it:** after running the [SFT example](/guides/sft/), compare a training input,
an unseen input of the same kind, and one outside the training distribution.
Explain what each result does—and does not—tell you about generalization.
