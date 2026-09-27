Source: https://river.ai



 River / The frontier AI development stack

Your own frontier AI lab.
In one API.

Build models and agents that learn from experience. Use reinforcement learning to sharpen their reasoning, tool use, and ability to get things done. Train with River, then serve on River Cloud or run the model on your own GPUs.

 Start building↗
 Talk to our team ↗

Trusted by teams at the frontier.

 perplexity

 Mixedbread

 Meet your lab ↓

The River stack

Meet your lab.
And your inference stack.

 Training
 Inference

Training
Reinforcement learning for better agents

Inference
Your models, serving your users

River APIOne shared GPU fleet

Training & rolloutsShared GPU fleetInference

Use River Cloud or deploy on-prem on your own GPUs ↗

Optimized models · RL tested at scaleExplore the system ↓

Training & inference
The next era of AI.
Intelligence you own.

Develop models & agents

Training

Build agents that get better at your work.

Fine-tune an open model on expert examples, then improve it with reinforcement learning. Define the tasks, tools, and rewards; River runs the training and inference that power your learning loop.

Run your applications

Production inference

Put the intelligence you build to use.

Turn a trained checkpoint into a model deployment. Bring your own model’s capabilities into customer-facing products, internal tools, and agents.

Model engineering

Every model, tuned.
Every run, tested.

Production inference

Optimization at every step

We optimize every supported open-weight model for training and inference. Our custom implementations run faster than open-source alternatives. We handle GPU topology and performance tuning, and test each model for correctness—so you can compare models and experiment with confidence.

RL reliability

Reliable RL at scale

At scale, subtle errors can undermine a learning loop. We carefully evaluate and stress-test the API to keep KL mismatch and numerical instability under control—so you can focus on improving your agents and developing new training algorithms.

 Open-weight models, optimized for training and inference

Qwen3.8 · Dense

Qwen3.8 27B

 262k

Qwen3.6 · MoE

Qwen3.6 35B

 262k

Qwen3.5 · MoE

Qwen3.5 397B

 262k

Kimi · MoE

Kimi K2.6

 32k
 262k

GLM · MoE

GLM 5.2

 32k
 262k

GLM · MoE

GLM 5.3 Flash

 262k

DeepSeek · MoE

DeepSeek V4 Flash

 262k

Nemotron · MoE

Nemotron 3.5 Lightning 30B

 262k

Own the stack

Frontier capability.
Sovereign control.

Your models are a strategic asset. Build and run them where you choose—with control over your data, your weights, and your compute.

Managed infrastructure
River Cloud

The complete AI lab, ready to use. Focus on your models while River operates the infrastructure.

Managed training, sampling, and inference
Download your trained weights and take them with you
Usage-based, per-token pricing

 Start on River Cloud ↗
 Talk about River Cloud →

On-prem · Your infrastructure
River Cluster

Turn the GPUs you already own into a frontier AI lab. Deploy the same River product in your environment.

Training and inference on your existing GPU cluster
Your data and model weights in your environment
The same API, workflows, and Console
 Bring River to your cluster →

Control the learning
From experiment
to deployment

 Train →
 Improve →
 Deploy →
 Serve ↗

Open model → your training run
Distributed training from Python
Choose an open model, configure its adapters, and start learning from your data. River handles the compute behind each training step.
train_step pipelines forward/backward and the optimizer update on the server. Control the learning rate, loss function, and optimizer settings.Explore the Python client ↗

train.pyTokenized batch supplied by you
```
import river_client as river

client = river.Client(api_key="...")
with client.session(project="my-lab") as session:
 model = session.create_model(
 base_model="Qwen/Qwen3.6-35B-A3B-FP8",
 lora=river.LoraConfig(rank=16),
 )
 model.train_step(
 batch, lr=1e-4,
 loss_fn="cross_entropy",
 )
 # Continue sampling or deploy in this session.
```

 Your data and objectives on River’s training system

Experience → better weights
Improve agents with reinforcement learning
Let your agent attempt a task, use tools, and act in your environment. Score the outcome, then train on that feedback. You control the rewards and algorithm; River connects sampling and weight updates.
Construct rl_batch from sampled tokens, log probabilities, and your reward-derived advantages. Control the loss and update schedule—or submit operations asynchronously to pipeline your loop.

improve.pyInside the same training session
```
groups = model.sample(
 prompts=prompts,
 num_samples=4,
 max_tokens=4096,
)

# Score the samples and construct rl_batch
# using your reward function and advantages.
model.train_step(
 rl_batch, lr=4e-5,
 loss_fn="importance_sampling",
)
```

 Sampling and training, connected by one API

Checkpoint → deployment
Deploy a trained checkpoint
Save your trained weights, then create a dedicated inference deployment. Serve the model in your application as it moves from research into production.
Use a team API key with deployment access. Set unified_replicas to reserve serving capacity and wait=True to wait until it can serve requests.

deploy.pyInside the same training session
```
checkpoint = model.save_weights(
 "domain-expert-v1",
 mode="inference",
)

deployment = client.create_deployment(
 checkpoint=checkpoint,
 unified_replicas=1,
 wait=True,
)
print(deployment.base_url)
```

 Saved weights → dedicated production inference

Your model → your product
Use the OpenAI client with your River model
Connect your application to the model you trained using the OpenAI Python client. Point it at your River deployment and stream responses with a familiar API.
Pass deployment.base_url directly to the OpenAI client; it already includes the API prefix. Authenticate with the same River team API key.

serve.pyOpenAI Python SDK · After the Deploy example
```
import os
from openai import OpenAI

inference = OpenAI(
 api_key=os.environ["RIVER_API_KEY"],
 base_url=deployment.base_url,
)
stream = inference.chat.completions.create(
 model=deployment.model,
 messages=[{"role": "user", "content": "Hello!"}],
 stream=True,
)
for chunk in stream:
 if chunk.choices:
 print(chunk.choices[0].delta.content or "", end="")
```

 OpenAI-compatible streaming from your River deployment

The River Console

See your lab
in actionOpen the Console ↗

See what’s happening across your cluster without losing sight of the experiment. The Console brings your team’s training runs, checkpoints, and deployments into one place.

Start building

Everything you need
to get started

 Explore the training recipesPython examples · GRPO & CISPO+

Simplified research examples showing the shape of the API. Bring your own data preparation, reward functions, and evaluation.

 rl_loop.py simple

 scalerl.py advanced

 A toy example: a minimal GRPO loop on GSM8K, training Kimi-K2.6-NVFP4. Reward
 starts low because Kimi tends to think for longer than the 128-token budget, then climbs above
 0.9 reasonably quickly as it learns to answer within the limit.

 rl_loop.py
 Copy

```
import river_client as river
from datasets import load_dataset
from transformers import AutoTokenizer

MODEL = "nvidia/Kimi-K2.6-NVFP4"
BATCH = 256 # prompts per step
GROUP = 4 # samples per prompt
MAX_TOKENS = 128
LORA_RANK = 16
LR = 4e-5 # learning rate

client = river.Client(api_key="...")
tok = AutoTokenizer.from_pretrained(MODEL, trust_remote_code=True)
gsm8k = load_dataset("openai/gsm8k", "main", split="train") # math word problems

def reward(text, answer):
 # 1.0 if the \boxed{...} answer matches the GSM8K ground truth, else 0.0
 return float(extract_boxed(text) == extract_gsm8k_answer(answer))

def make_prompt(question):
 ... # render the question with the chat template (+ "...answer inside \boxed{}" suffix)

with client.session() as session:
 model = session.create_model(
 base_model=MODEL,
 lora=river.LoraConfig(
 rank=LORA_RANK,
 train_attn=True, # attention projections
 train_mlp=True, # MLP / MoE experts
 train_unembed=True, # unembedding (lm_head)
 ),
 )

 for step in range(len(gsm8k) // BATCH):
 rows = gsm8k.select(range(step * BATCH, (step + 1) * BATCH))
 prompts = [make_prompt(q) for q in rows["question"]]

 # 1. Sample a group of candidate answers per prompt
 groups = model.sample(
 prompts=prompts, num_samples=GROUP, max_tokens=MAX_TOKENS, stop=["<|im_end|>"],
 )

 # 2. Score, then center rewards into GRPO advantages (no std division)
 train_data = []
 for prompt, samples, answer in zip(prompts, groups, rows["answer"]):
 rewards = [reward(s.text, answer) for s in samples]
 baseline = sum(rewards) / len(rewards)
 if all(r == baseline for r in rewards):
 continue # no signal — skip this group

 ptoks = tok.encode(prompt, add_special_tokens=False)
 for s, r in zip(samples, rewards):
 adv = r - baseline
 full_ids = ptoks + s.tokens
 train_data.append({
 "input_ids": full_ids,
 "attention_mask": [1] * len(full_ids),
 "old_logprobs": [0.0] * (len(ptoks) - 1) + s.logprobs + [0.0],
 "advantages": [0.0] * (len(ptoks) - 1) + [adv] * len(s.tokens) + [0.0],
 })

 # 3. One policy-gradient update
 if train_"importance_sampling")
 model.optim_step(lr=LR)

 model.save_weights("final")
```

reward/mean · 29 steps

 reward

rl_loop.py · Kimi-K2.6-NVFP4 · GSM8K · GRPO · hover to inspect any step

 An example of a larger RL run on the
 Polaris-53K
 math dataset (filtered to difficulty ≤ 3/8), with batch-normalized advantages and the
 cispo loss, following the ScaleRL recipe
 (Khatri et al., 2025).
 The base model can already solve some of these problems, but before fine-tuning, its
 completions run long and rarely finish within the 4,096-token budget, which is why reward
 stays near zero for the first ~40 steps below. For under $1,000 — roughly
 500M completion tokens and 250M training tokens — you end up with a model that solves the
 same math much faster and cheaper.

 scalerl.py
 Copy

```
import numpy as np
import river_client as river
from collections import deque
from transformers import AutoTokenizer

MODEL = "Qwen/Qwen3.6-35B-A3B-FP8" # 35B MoE, FP8
LORA_RANK = 8
LEARNING_RATE = 1e-4
WARMUP_STEPS = 100 # linear LR warmup
PIPELINE_K = 1 # PipelineRL depth (1 = on-policy)
GROUP = 16 # generations per prompt
BATCH = 48 # prompts per step
MAX_TOKENS = 4096
EPS_MAX = 6.0 # CISPO clip

client = river.Client(api_key="...")
tok = AutoTokenizer.from_pretrained(MODEL, trust_remote_code=True)

SUFFIX = " Think step by step, then put your final answer inside \boxed{}."

def render(problem):
 messages = [{"role": "user", "content": problem + SUFFIX}]
 return tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

def grade(response, answer):
 ... # your task reward, e.g. a symbolic math checker -> 0.0 / 1.0

def advantages(group_rewards):
 # ScaleRL: center each group by its own mean (the GRPO baseline), but
 # normalize by the BATCH std — not the per-group std that standard GRPO
 # uses. This drops GRPO's difficulty/length bias from per-group scaling.
 centered = [[r - np.mean(g) for r in g] for g in group_rewards]
 std = max(float(np.std([a for g in centered for a in g])), 1e-8)
 return [[a / std for a in g] for g in centered]

def build_cispo_data(prompts, groups, advs):
 ... # pack prompt + sample tokens with old_logprobs and advantages

def lr_at(train_step):
 # linear warmup over the first WARMUP_STEPS optimizer steps, then hold
 if train_step < WARMUP_STEPS:
 return LEARNING_RATE * (train_step + 1) / WARMUP_STEPS
 return LEARNING_RATE

with client.session() as session:
 model = session.create_model(
 base_model=MODEL,
 lora=river.LoraConfig(
 rank=LORA_RANK,
 train_attn=True, # attention projections
 train_mlp=True, # MLP / MoE experts
 train_unembed=True, # unembedding (lm_head)
 ),
 )

 pipeline = deque() # holds the last PIPELINE_K batches
 train_step = 0 # optimizer steps; LR warmup keys on this

 for step in range(200):
 problems, answers = next_batch(BATCH) # Polaris-53K, difficulty <= 3/8
 prompts = [render(p) for p in problems]

 # 1. Sample from an inference checkpoint of the current weights
 ckpt = model.save_weights(f"sample_{step}", mode="inference")
 groups = session.sample(prompts=prompts, base_model=MODEL,
 checkpoint=ckpt, num_samples=GROUP,
 max_tokens=MAX_TOKENS, stop=["<|im_end|>"])

 # 2. Grade, normalize advantages, drop zero-variance groups, build CISPO data
 rewards = [[grade(s.text, a) for s in g] for g, a in zip(groups, answers)]
 advs = advantages(rewards)

 # A group where every sample earned the same reward has all-zero
 # advantages -> no learning signal. Skip it (ScaleRL).
 keep = [any(a != 0.0 for a in g) for g in advs]
 data = build_cispo_data(
 [p for p, k in zip(prompts, keep) if k],
 [g for g, k in zip(groups, keep) if k],
 [a for a, k in zip(advs, keep) if k],
 )
 pipeline.append(data)

 # 3. Train once PIPELINE_K batches are queued, with a warmed-up LR
 if len(pipeline) >= PIPELINE_K:
 model.forward_backward(data=pipeline.popleft(), loss_fn="cispo", eps_max=EPS_MAX)
 model.optim_step(
 lr=lr_at(train_step), grad_clip_norm=1.0,
 beta1=0.9, beta2=0.95, eps=1e-15, weight_decay=0.01, # ScaleRL Adam
 )
 train_step += 1

 model.save_weights("final")
```

reward/mean · first 200 steps · <$1,000 run

 raw
 ema

scalerl.py · Qwen3.6 35B · LoRA rank 8 · lr 1e-4 · CISPO · hover to inspect any step

 Devvrit Khatri, Lovish Madaan, Rishabh Tiwari, Rachit Bansal, Sai Surya Duvvuri, Manzil Zaheer,
 Inderjit S. Dhillon, David Brandfonbrener, Rishabh Agarwal.
 The Art of Scaling Reinforcement Learning Compute for LLMs.
 arXiv:2510.13786 (2025).

 River Cloud Token Pricing+

Training and inference on River Cloud are billed per token. For deployment on your own GPUs, contact us about on-prem pricing.

Swipe to compare token prices →

 Model
 Context
 Prompt
 Cached
 Completion
 Training

 Qwen3.8-27B-FP8
 262k
 $1.80 / 1M
 $0.360 / 1M
 $5.50 / 1M
 $4.10 / 1M

 Qwen3.5-9B
 262k
 $0.66 / 1M
 $0.132 / 1M
 $1.99 / 1M
 $1.46 / 1M

 Qwen3.6-35B-A3B-FP8
 262k
 $0.33 / 1M
 $0.066 / 1M
 $0.82 / 1M
 $1.00 / 1M

 Qwen3.5-122B-A10B-FP8
 262k
 $1.00 / 1M
 $0.200 / 1M
 $3.00 / 1M
 $4.00 / 1M

 Qwen3.5-397B-A17B-FP8
 262k
 $3.32 / 1M
 $0.664 / 1M
 $8.30 / 1M
 $10.00 / 1M

 Kimi-K2.6-NVFP4
 32k
 $1.22 / 1M
 $0.244 / 1M
 $3.06 / 1M
 $3.67 / 1M

 Kimi-K2.6-NVFP4-262k
 262k
 $4.28 / 1M
 $0.856 / 1M
 $10.70 / 1M
 $12.84 / 1M

 GLM-5.2-NVFP4
 32k
 $1.46 / 1M
 $0.292 / 1M
 $3.67 / 1M
 $4.40 / 1M

 GLM-5.2-NVFP4-262k
 262k
 $5.14 / 1M
 $1.028 / 1M
 $12.84 / 1M
 $15.41 / 1M

 GLM-5.3-Flash
 262k
 $1.50 / 1M
 $0.300 / 1M
 $3.00 / 1M
 $8.00 / 1M

 DeepSeek-V4-Flash-0731
 262k
 $1.50 / 1M
 $0.300 / 1M
 $3.00 / 1M
 $8.00 / 1M

 Nemotron-3.5-Lightning-30B-A3B-NVFP4
 262k
 $0.30 / 1M
 $0.060 / 1M
 $0.80 / 1M
 $1.00 / 1M

 Prices in USD per 1M tokens · Preview rates, subject to change · Cached prompt tokens billed at 20% of the prompt rate

 Checkpoint storage billed at $0.10 / GB / month · Longer context lengths and additional models are priced on request — talk to our team

Our vision
Intelligence you own,
at every layer.

We’re building a future where your AI learns from you, works for you, and belongs to you—from how it learns to the hardware it runs on. River’s training and inference platform is one part of that larger vision.Explore our vision ↗

Talk to our team

What will you build
with River?

Bring your team’s AI to River Cloud or run River Cluster on your own GPUs. Tell us a little about your plans, and we’ll help you get started.

Prefer email? [email protected]

 Your details

 Name

 Work email

 Company

 I’m interested in

 River CloudManaged by River
 River ClusterOn your GPUs
 Both
 Not sure yet

 What would you like to build? (optional)

 Leave this field empty

 Talk to our team →

We’ll use these details to respond to your inquiry. Privacy policy

Please email api@river.ai to get in touch, or enable JavaScript to use this form.

 ✓

Thanks for reaching out.

Your request is with the River team. We’ll follow up by email.
 Explore the docs ↗

 