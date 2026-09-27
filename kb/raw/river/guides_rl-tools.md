# Tools and environments

Give the math environment a calculator, then use the same pattern to connect an
agent to your own tools and stateful environments. A rollout can alternate
between model turns and environment observations while River preserves the
token sequence used for training.

For visual observations such as browser screenshots, see
[Image understanding](/guides/image-understanding/).

## Add a calculator

Add this tool and environment to the [math example](/guides/rl-sync/#training-recipe). The decorator derives the model-facing schema from Python type hints
and the docstring:

```python
import operator
from typing import Literal

@rl.tool
async def calculator(a: float, operation: Literal["+", "-", "*", "/"], b: float) -> str:
    """Calculate an arithmetic operation on two numbers."""
    operations = {
        "+": operator.add,
        "-": operator.sub,
        "*": operator.mul,
        "/": operator.truediv,
    }
    return str(operations[operation](a, b))

class ToolMathEnv(MathEnv):
    tools = [calculator]

    async def reset(self, row):
        messages = await super().reset(row)
        messages[0]["content"] += " Use the calculator when it helps."
        return messages
```

In the engine, use `env=ToolMathEnv` and allow more turns:

```python
budget = rl.Budget(
    max_turns=4,
    max_generated_tokens=8192,
    max_context_tokens=16_384,
    max_turn_tokens=2048,
    segment_tokens=1024,
    tool_output_tokens=1024,
)
```

Pass this as `budget=budget` when creating the engine. The final numeric answer
uses the same reward function; calling the tool does not itself earn reward.

The default `Env.on_turn` executes declared tool calls and returns their results
to the model. When the model replies without tool calls, the rollout finishes
and `reward` runs. Tool execution happens in your Python process, so tools can
call your databases, simulators, or services.

Default tool dispatch can execute several calls concurrently. For a browser or
other environment where action order matters, override `on_turn` and execute
the actions in the required order.

## Give each trajectory its own environment

Pass an environment **class or factory** when it holds mutable state:

```python
# Each rollout gets a fresh instance and private browser state.
engine = rl.RolloutEngine(
    model,
    env=lambda: BrowserEnv(session),
    renderer=renderer,
    budget=budget,
)
```

Here `BrowserEnv` is your environment implementation. Open its browser in
`reset`, handle actions in `on_turn`, and close it in `close`. Passing a single
instance shares that object across trajectories; use that only when the
environment is stateless or explicitly manages state by trajectory ID.

Return only **new environment messages** from `on_turn`, or `None` when the
episode is finished. The engine appends them to the sampled conversation.
Do not return the whole conversation after every turn.

## Bound long conversations

Turn, generated-token, and context budgets bound each trajectory independently
of wall-clock load. Use `tool_output_tokens` to keep large text tool results
from consuming the entire context. A watchdog such as `environment_timeout`
detects a stuck environment; it is not a task score.

For deliberate context compaction, `traj.rewrite(messages, chunks=...)` replaces
the conditioning context while retaining earlier training spans. It requires a
new prefill. Keep the original context whenever it still fits and is useful.

Raise `rl.InfrastructureError` for an unavailable browser or external service.
That stops the run instead of teaching the model that an infrastructure outage
was an unsuccessful action. Choose how that environment recovers in
[Evaluation and recovery](/guides/rl-checkpoints/#restore-environment-state).
