# Image understanding

Give a vision-capable LLM images alongside text so it can use visual observations
in a task. An agent can inspect a browser screenshot, for example, and use it to
choose its next action.

This chapter builds on [Tools and environments](/guides/rl-tools/). It shows how
to include images in environment messages, return them from tools, and manage
their lifetime across rollouts and evaluation. The examples assume an active
River session and image bytes supplied by your environment.

## Add an image observation

For a vision-capable model, upload an image and include its handle alongside
text in a message. This example returns a browser screenshot from `reset` or
`on_turn`:

```python
from river_client.renderers import image_part

async def screenshot_observation(session, png_bytes):
    image = await session.upload_image_async(png_bytes)
    return {
        "role": "user",
        "content": [
            {"type": "text", "text": "The page after your last action."},
            image_part(image),
        ],
    }
```

The upload can run while other trajectories sample. Later requests refer to
the handle instead of repeatedly sending the image bytes. The renderer expands
image positions into the model's input format, and the RL library checks their
alignment before building training data.

## Return images from tools

For an image-bearing **tool reply**, use `role="tool"`, the matching
`tool_call_id`, and a list of text and image content parts. Produce this message
in your custom `on_turn`; decorated tool functions return strings.

## Manage image handles

Handles belong to the session that uploaded them. Upload evaluation images
through the evaluation session. The default image TTL is six hours without use;
each accepted request containing a handle refreshes its TTL. Keep the bytes
needed to restore an expired handle. [RL checkpoints](/guides/rl-checkpoints/)
persist referenced image bytes for recovery into a new session.

## Bound image usage

`Budget.max_images` defaults to no additional image-count cap. Token/context
limits and the model's image limits still apply. Release handles once no future
rollout, training request, or recovery state needs them.
