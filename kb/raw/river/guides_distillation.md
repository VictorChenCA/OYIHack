# Distillation overview

Distillation trains a student LLM using supervision from a teacher. You can
transfer a large model's behavior into a smaller model, combine specialist
models into one agent, or teach a model to solve tasks without hints it needed
during training. The teacher supplies the learning signal; the student is the
model you evaluate and deploy.

Start with the teacher–student relationship, then work through the chapters
below. The examples build on [SFT](/guides/sft-concepts/) and
[token-level RL updates](/guides/rl-primitives/).

## Read from basics to advanced techniques

| Chapter | What you will build |
| --- | --- |
| [Distill a larger model](/guides/distillation-basics/) | A small student trained with a stronger teacher's sampled reverse-KL feedback. |
| [On-policy self-distillation](/guides/distillation-self/) | A student that learns from a solution-informed version of itself. |
| [Self-distillation with River OPSD](/guides/distillation-opsd/) | Aligned student and teacher streams for River's native full-vocabulary forward-KL loss. |
| [Multi-teacher distillation](/guides/distillation-multi-teacher/) | One student learning from domain specialists through explicit task routing. |

## Choose a distillation recipe

Two decisions are independent: **who generates the response**, and **how you
compare the teacher and student**. On-policy distillation means the student
generates the responses used for training. It does not prescribe a KL direction.
This separation is central to
[Generalized Knowledge Distillation (GKD)](https://arxiv.org/abs/2306.13649).

| Recipe | Who generates? | What the teacher provides | When to use it |
| --- | --- | --- | --- |
| Distillation through SFT | Teacher | Demonstrations | You have teacher text, including from a different tokenizer. |
| On-policy distillation (OPD) | Student | Probabilities at the student's response prefixes | A stronger teacher can score the student's own attempts. |
| On-policy self-distillation | Student | Predictions conditioned on a solution or feedback | Extra training context makes the same model a better teacher. |
| Multi-teacher OPD | Student | Feedback from a specialist chosen for each task | You want one model to acquire several teachers' capabilities. |

Teacher-generated SFT remains a useful baseline. DeepSeek-R1's smaller distilled
models were fine-tuned on curated R1-generated examples; that experiment did
not require aligning R1's vocabulary with Qwen's or Llama's.
[DeepSeek-R1, §2.4](https://arxiv.org/html/2501.12948v1#S2.SS4)

### What current research supports

The following is a reading of public methods as of **September 25, 2026**, not
a ranking of models. Large-scale reports support specialist-to-student OPD;
they do not establish one universally best estimator or teacher schedule.

| Source | Relevant result or design | What to take into your experiment |
| --- | --- | --- |
| [MiMo-V2-Flash, §4.4](https://arxiv.org/html/2601.02780v2#S4.SS4) | Domain teachers provide a teacher–student log-probability difference at each sampled token, optionally combined with outcome advantages. | Start with task routing and dense token feedback; add verified task rewards separately. |
| [MOPD](https://arxiv.org/html/2606.30406v1#S3) | Studies specialist consolidation with sampled-token and corrected top-k objectives. | Treat specialist selection and the estimator as separate experimental choices. |
| [Moonshot's Kimi K3, §4.1.3](https://arxiv.org/html/2607.24653v1#S4.SS1.SSS3) | Routes by domain and reasoning effort across nine teachers; clips sampled log-ratio rewards. Reports no clear benefit from top-k in that setting. | Sampled-token feedback is a serious baseline, including for agents. |
| [DeepSeek-V4.1-Flash, §5.2.4](https://arxiv.org/html/2609.19969v1#S5.SS2.SSS4) | Uses full-vocabulary OPD with more than 40 teachers and adjusts data and teacher mixtures during training. | Full distributions are another demonstrated choice, with substantial systems requirements. |
| [SDFT](https://arxiv.org/abs/2601.19897) and [SDPO](https://arxiv.org/abs/2601.20802) | Use demonstrations or environmental feedback to create a better-informed self-teacher. | Test whether extra context actually improves the teacher before distilling it. |

The [basic walkthrough](/guides/distillation-basics/) uses sampled reverse-KL feedback. It is small enough to
inspect and works with River's core RL interface. It is not a reproduction of
any lab's full training system. Self-distillation is a newer family with
different divergences, teacher updates, and filtering rules; the acronym alone
does not specify an algorithm.
