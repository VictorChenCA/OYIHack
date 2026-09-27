# On-policy self-distillation

Self-distillation needs a source of better supervision. Identical weights and
identical contexts produce identical distributions and no KL learning signal.
A worked solution, retrieved evidence, or environment feedback changes the
teacher's context while the student continues to receive only the task.

[SDFT](https://arxiv.org/abs/2601.19897) uses demonstration-conditioned
self-teachers. [SDPO](https://arxiv.org/abs/2601.20802) uses rich feedback, such
as execution errors or successful attempts, and studies regularized teachers.
Our example uses the current model and a checked solution with sampled
reverse-KL feedback; it omits their full teacher schedules and stabilizers.

## Prepare the two contexts

Use a live `student`, its tokenizer `tok`, and the
[`distill_step` helper](/guides/distillation-basics/#score-and-train-with-river)
from the basic walkthrough. The student prompt contains the question; the
teacher prompt also contains a checked solution:

```python
question = "A box has 24 pencils. Three students take 5 each. How many remain?"
solution = "The students take 3 × 5 = 15 pencils. The box has 24 − 15 = 9 left."

def prompt_ids(text):
    return tok.apply_chat_template(
        [{"role": "user", "content": text}],
        tokenize=True,
        add_generation_prompt=True,
    )

plain = prompt_ids(question)
informed = prompt_ids(
    f"{question}\n\nChecked solution:\n{solution}\n\n"
    "Solve the original problem in your own words."
)
result = distill_step(student, [(plain, student, informed)])
```

Only the teacher scoring pass sees the solution. The student generates first,
then the same model scores those tokens under both contexts before updating.
At evaluation, provide only unseen questions. Expand this alignment example
into batches of training problems; repeatedly training this one question is
not evidence of generalization.

## Check that the extra context helps

> [!WARNING]
>
> For self-distillation, first compare the model with and without privileged
> context on a training-side validation set. If the context does not improve its
> answers, it is not a reliable teacher. Keep evaluation solutions out of both
> training streams. Monitor output diversity as well as pass@1: later work reports
> diversity loss with demonstration-conditioned self-distillation, and separate
> continual-learning experiments report forgetting and instability.
> [Diversity study](https://arxiv.org/abs/2606.26091),
> [continual post-training study](https://arxiv.org/abs/2607.01763).

For a different objective that computes full-vocabulary forward KL inside the
worker, continue to [Self-distillation with River OPSD](/guides/distillation-opsd/).
