# Multi-teacher distillation

Multi-teacher training need not average several teachers' logits at every token.
Start with a dataset carrying an explicit domain label and route each task to
one specialist. This is the routing pattern studied in
[MOPD](https://arxiv.org/html/2606.30406v1#S3). Separate teachers can share an
architecture and initial checkpoint; they do not have to be larger than the
student.

<figure class="docs-learning-figure">
<div class="docs-flow">
<div><strong>Labeled tasks</strong><small>Math, coding, and instruction following in a chosen mixture.</small></div>
<span aria-hidden="true">→</span>
<div><strong>Matching specialist</strong><small>Score each student attempt with its domain's frozen teacher.</small></div>
<span aria-hidden="true">→</span>
<div class="docs-model"><strong>One student</strong><small>Accumulate feedback across domains in the same update.</small></div>
</div>
<figcaption>The task mixture controls which capabilities receive training. Routing selects the source of feedback.</figcaption>
</figure>

## Load and route to specialists

Load validated specialist checkpoints as live River model handles using
`session.create_model(base_model=..., lora=..., checkpoint=...)`, with each
checkpoint's matching base model and adapter configuration. Build `teachers`, a
dictionary from dataset domain to handle. All teachers must satisfy the same tokenization
contract as the student. `task_batch` contains your `domain` and `question`
fields. Use [`distill_step`](/guides/distillation-basics/#score-and-train-with-river)
from the basic walkthrough and the [`prompt_ids` helper](/guides/distillation-self/#prepare-the-two-contexts)
with the student's tokenizer `tok`.

```python
records = []
for task in task_batch:
    ids = prompt_ids(task["question"])
    teacher = teachers[task["domain"]]
    records.append((ids, teacher, ids))

result = distill_step(student, records)
```

## Preserve the task mixture

Build a fresh mixed batch on every iteration. Because `distill_step` gives each
response equal weight, the proportions of tasks in the batch set the domain
weights.

> [!WARNING]
>
> **Fast teachers can dominate an asynchronous queue.** Training whichever
> teacher returns first can silently change your domain proportions. Preserve
> explicit domain quotas or weights when overlapping scoring and sampling.

Record teacher checkpoint IDs with the
rollouts, and measure held-out success separately for every domain.

## Choose the teacher combination deliberately

Routing, averaging teacher probabilities, and averaging teacher log
probabilities define different targets. A probability mixture permits
alternatives favored by different teachers; a weighted sum of reverse KLs
corresponds to a normalized geometric combination at a fixed prefix. Neither
is automatically an improvement over a good specialist. Begin with explicit
domain routing before introducing a learned router or an ensemble objective.

## Extend the recipe to agents

For agents, apply the same idea to each model-generated span with its actual
conversation prefix, including preceding tool results. Tool outputs supply
context and receive no direct distillation loss. Keep teacher-only hints out
of the student's context, and score the student's recorded actions rather than
substituting a teacher's independently generated tool trajectory.
