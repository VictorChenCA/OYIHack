# Learning from rewards

Reinforcement learning (RL) trains an LLM on the outcomes of its own attempts.
You supply tasks and a scoring rule. The model generates responses or acts
through tools in an agent loop. You score those attempts, then train the model
toward behavior that earns higher rewards.

This chapter follows one batch from attempts to an update. The
[first RL run](/guides/rl-sync/) implements the loop with `river_client.rl`.

## Demonstrate an answer or judge an attempt

In [SFT](/guides/sft-concepts/), you supply a desired response. In RL, the model
supplies the response and you judge it. This is useful when you can verify
success more easily than you can write every step of a good solution.

A math problem can have a checkable final answer. A coding task can have tests.
An agent can be scored on whether it completed a task in an environment. Each
scoring rule is an imperfect representation of what you care about; the model
learns from the rule you actually implement.

An RL **policy** is the model's distribution over actions given its context. For
a language model, actions include generated tokens and the tool calls they form.
A **rollout** or **trajectory** is one attempt: the generated response, or a
sequence of model actions and environment observations.

## The learning loop

<figure class="docs-learning-figure">
<div class="docs-flow">
<div><strong>1. Attempt</strong><small>Sample several responses to each task.</small></div>
<span aria-hidden="true">→</span>
<div><strong>2. Score</strong><small>Evaluate outcomes and compare rewards.</small></div>
<span aria-hidden="true">→</span>
<div class="docs-model"><strong>3. Update</strong><small>Train the policy on the resulting signal.</small></div>
</div>
<figcaption>Repeat with the updated policy. Evaluate saved policies on separate tasks to check whether success transfers.</figcaption>
</figure>

The objective is to increase **expected reward**: average task success under the
policy's sampling distribution and the task distribution you train on. A single
successful response is evidence about one attempt, not proof that the model can
reliably solve that kind of problem.

Sampling multiple responses exposes differences in outcomes. If every attempt
is identical, comparing them gives little information about which behavior is
better. Exploration must still produce useful attempts: random-looking text is
not a substitute for a capable starting model.

## From rewards to advantages

Consider four responses to the same question. Three are wrong and one is right.
A simple verifier gives reward 0 or 1. The group's mean reward is 0.25.

An **advantage** measures how an attempt compares with a baseline. For
unstandardized, group-centered advantages, subtract the mean reward of that
question's group from each reward:

<div class="docs-equation">Advantage = reward − group mean reward</div>

| Attempt | Reward | Baseline | Advantage |
| --- | --- | --- | --- |
| A: incorrect | 0 | 0.25 | −0.25 |
| B: correct | 1 | 0.25 | +0.75 |
| C: incorrect | 0 | 0.25 | −0.25 |
| D: incorrect | 0 | 0.25 | −0.25 |

<figure class="docs-diagram">
<svg viewBox="0 0 720 260" role="img" aria-labelledby="advantage-title advantage-desc">
<title id="advantage-title">One successful attempt has positive advantage</title>
<desc id="advantage-desc">Attempts A, C, and D have advantage minus 0.25. Attempt B has advantage plus 0.75. Negative bars extend left of zero; the positive bar extends right.</desc>
<text x="22" y="30" class="diagram-heading">Relative to the same question's group</text>
<line x1="300" y1="48" x2="300" y2="217" class="diagram-boundary"/>
<text x="300" y="245" text-anchor="middle" class="diagram-note">0 · group baseline</text>
<text x="24" y="79">A</text><rect x="228" y="56" width="72" height="32" rx="4" class="diagram-tool"/><text x="214" y="78" text-anchor="end">−0.25</text>
<text x="24" y="122">B</text><rect x="300" y="99" width="216" height="32" rx="4" class="diagram-train"/><text x="534" y="121">+0.75</text>
<text x="24" y="165">C</text><rect x="228" y="142" width="72" height="32" rx="4" class="diagram-tool"/><text x="214" y="164" text-anchor="end">−0.25</text>
<text x="24" y="208">D</text><rect x="228" y="185" width="72" height="32" rx="4" class="diagram-tool"/><text x="214" y="207" text-anchor="end">−0.25</text>
</svg>
<figcaption>A worked example, not measured training data. The direction of the signal depends on relative performance within this group.</figcaption>
</figure>

Positive advantage encourages the sampled actions; negative advantage discourages
them relative to their alternatives. This describes the objective's local
incentive, not a guarantee that every token's probability changes in that
direction after a shared-parameter update.

The introductory recipe uses [GRPO-style](https://arxiv.org/abs/2402.03300)
group-relative advantages with `rl.GroupCentered()`, which centers rewards
within each question's rollout group. It leaves reward standardization disabled
and uses the CISPO loss.

### When a group has no signal

If all four rewards are 0, all four advantages are 0. The same is true if all
four rewards are 1. A uniformly failing group and a uniformly successful group
have very different quality, but neither gives this estimator a within-group
preference.

Inspect `reward/zero_variance_group_frac` alongside mean reward. If all rewards
are zero, first check the verifier, output parsing, token budget, and task
suitability. More updates cannot extract a relative signal from identical scores.

## From advantages to an update

The reward is a score for the attempt. The training objective operates on the
model's probabilities for the tokens it generated. In a simple outcome-reward
recipe, each generated token in an attempt receives that attempt's advantage.
Prompt tokens and environment observations provide context without being
reinforced as model actions.

This is a coarse form of **credit assignment**. A correct final answer does not
tell you which reasoning step caused success. A successful trajectory may also
contain unnecessary or unhelpful actions. Better tasks, rewards, and evaluation
help you distinguish useful behavior from shortcuts.

The RL library records the original generated token IDs and their log
probabilities. A **log probability** is the logarithm of the probability assigned
to a sampled token. Keep this record tied to the policy that generated it;
retokenizing visible text is not a reliable way to reconstruct the original
training sequence.

### Why keep the old probabilities?

The policy used for training can differ from the one that generated a rollout.
An importance ratio compares the new and old probabilities of the same sampled
token under its recorded context:

<div class="docs-equation">Ratio = exp(new log probability − old log probability)</div>

A ratio of 1 means they agree at that position. A ratio of 2 means the training
policy assigns twice the probability to that token. Ratios help form objectives
that account for sampling under a different policy; they do not make arbitrarily
old data safe to use.

PPO and CISPO limit updates in different ways. PPO clips its surrogate objective;
CISPO caps the importance weight used with the log-probability gradient. The
[first recipe](/guides/rl-sync/) uses CISPO. Start with the working recipe, then
use [Loss functions](/guides/losses/) and [Build your own RL system](/guides/rl-primitives/)
when you need to control the objective directly. The
[PPO paper](https://arxiv.org/abs/1707.06347) develops the clipped surrogate.

## Design a reward you can trust

Test the scoring function on known successes, failures, malformed responses,
and plausible shortcuts before spending a training budget. In the math recipe,
reward depends on both a correct number and the expected output format. A parsing
failure can therefore look like a reasoning failure in the aggregate score.

> [!WARNING]
>
> **Keep infrastructure failures out of rewards.** For agents, distinguish task failure from broken infrastructure. A browser
> outage is not evidence that the model chose a bad action. The
> [environment guide](/guides/rl-tools/) explains how to report infrastructure
> failures separately.

Keep the reward aligned with the real task. If you reward brevity, inspect
whether the model is omitting necessary work. If you use tests, inspect whether
they cover the behavior you intend. If a model judges responses, audit examples
where that judge disagrees with your own assessment.

## Measure progress outside the training loop

> [!WARNING]
>
> **The model can learn your scoring rule’s shortcuts.** A rising training reward can mean better task performance, better compliance
> with the verifier, or exploitation of the scoring rule. Evaluate saved policies
> on held-out tasks using a fixed protocol, and compare them with the starting
> model.

| Measure | Question it helps answer |
| --- | --- |
| Held-out success | Does learning transfer to new tasks? |
| Training reward | How well are recent attempts satisfying the training reward? |
| Zero-variance groups | How often does the group-relative estimator have no signal? |
| Truncation and response length | Is the token budget changing which answers finish? |
| Inspected trajectories | What behavior is actually being learned? |

Keep generation settings comparable, including temperature, token budget, and
number of attempts. Report those settings alongside scores. Learning to answer
within a tight budget can be valuable, but it is a different claim from improving
performance at an unrestricted budget.

**Try it:** change the four rewards above to `[1, 1, 0, 0]`, then to
`[1, 1, 1, 1]`. Compute the advantages. Explain why mean reward rises while the
within-group signal eventually disappears.
