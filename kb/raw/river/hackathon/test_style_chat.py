# /// script
# requires-python = ">=3.12"
# dependencies = ["river-client==0.10.0", "prompt-toolkit>=3.0"]
# ///
"""Run beside style_chat.py: uv run --no-project test_style_chat.py -v.

These unit tests use simulated training; no API key or paid training is needed.
"""
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace as NS
import unittest
from contextlib import nullcontext

spec = importlib.util.spec_from_file_location('style_chat', Path(__file__).with_name('style_chat.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class Tests(unittest.TestCase):
    def test_background_load_preserves_active_adapter_and_inflight_reply(self):
        import threading
        from contextlib import contextmanager
        from unittest.mock import patch
        loading = threading.Event()
        allow_load = threading.Event()
        replying = threading.Event()
        allow_reply = threading.Event()
        closed = []
        class Model:
            def load_weights(self, checkpoint, load_optimizer):
                self.checkpoint = checkpoint
                if checkpoint == 'two':
                    loading.set()
                    if not allow_load.wait(5):
                        raise TimeoutError('test load gate')
            def chat_complete(self, messages, **kwargs):
                if messages[1]['content'].startswith('[given text]: slow'):
                    replying.set()
                    if not allow_reply.wait(5):
                        raise TimeoutError('test reply gate')
                return NS(response_json=json.dumps({'choices': [{'message': {'content': self.checkpoint}}]}))
        class Client:
            def close(self): pass
            @contextmanager
            def session(self, **kwargs):
                try:
                    yield self
                finally:
                    closed.append(self.model.checkpoint)
            def create_model(self, base_model, lora):
                self.model = Model()
                return self.model
        manager = mod.Translator(NS(model='fake', lora_rank=16, max_tokens=10), Client, lambda **kw: object())
        results = []
        with patch('builtins.print'):
            manager.thread.start()
            try:
                first_load = manager.submit('one', 1)
                second_load = manager.submit('two', 2)
                self.assertTrue(loading.wait(5))
                self.assertEqual(first_load.result(timeout=1), ('one', 1))
                self.assertFalse(second_load.done())
                self.assertEqual(manager.translate('quick'), ('one', 'one', 1))
                self.assertEqual(manager.status()[:2], (1, 2))
                self.assertEqual(closed, [])
                reply = threading.Thread(target=lambda: results.append(manager.translate('slow')))
                reply.start()
                self.assertTrue(replying.wait(5))
                allow_load.set()
                self.assertEqual(closed, [])
                allow_reply.set()
                reply.join(5)
                manager.jobs.put(None)
                manager.thread.join(5)
                self.assertFalse(manager.thread.is_alive())
                self.assertEqual(results, [('one', 'one', 1)])
                self.assertEqual(second_load.result(timeout=1), ('two', 2))
                self.assertEqual(manager.translate('new'), ('two', 'two', 2))
                self.assertEqual(closed, ['one'])
            finally:
                allow_load.set()
                allow_reply.set()
                manager.close()
        self.assertEqual(closed, ['one', 'two'])

    def test_failed_background_load_keeps_previous_generation(self):
        from contextlib import contextmanager
        from unittest.mock import patch
        closed = []
        class Model:
            def load_weights(self, checkpoint, load_optimizer):
                self.checkpoint = checkpoint
                if checkpoint == 'bad':
                    raise RuntimeError('load failed')
        class Client:
            def close(self): pass
            @contextmanager
            def session(self, **kwargs):
                try:
                    yield self
                finally:
                    closed.append(self.model.checkpoint)
            def create_model(self, base_model, lora):
                self.model = Model()
                return self.model
        manager = mod.Translator(NS(model='fake', lora_rank=16), Client, lambda **kw: object())
        with patch('builtins.print'):
            manager.thread.start()
            manager.submit('good', 1)
            failed_load = manager.submit('bad', 2)
            manager.jobs.put(None)
            manager.thread.join(5)
            try:
                self.assertFalse(manager.thread.is_alive())
                generation, loading, error = manager.status()
                self.assertEqual(generation, 1)
                self.assertIsNone(loading)
                self.assertIn('load failed', error)
                with self.assertRaisesRegex(RuntimeError, 'load failed'):
                    failed_load.result(timeout=1)
                self.assertEqual(closed, ['bad'])
            finally:
                manager.close()
        self.assertEqual(closed, ['bad', 'good'])

    def test_adapter_loading_matches_real_client(self):
        from unittest.mock import create_autospec
        from river_client import Session, Model, LoraConfig
        args = NS(model="Qwen/Qwen3.8-27B-FP8", lora_rank=16)
        for checkpoint, training in [(None, True), ("river://train", True), ("river://inf", False)]:
            with self.subTest(checkpoint=checkpoint):
                session = create_autospec(Session, instance=True)
                model = create_autospec(Model, instance=True)
                session.create_model.return_value = model
                self.assertIs(mod.create_adapter(session, args, LoraConfig,
                                                 checkpoint, training=training), model)
                kwargs = session.create_model.call_args.kwargs
                self.assertEqual(kwargs["base_model"], args.model)
                self.assertEqual(kwargs["lora"].rank, 16)
                if checkpoint:
                    model.load_weights.assert_called_once_with(checkpoint, load_optimizer=training)
                else:
                    model.load_weights.assert_not_called()

    def test_restore_conversation_checkpoints_and_pending_pairs(self):
        with TemporaryDirectory() as directory:
            path = Path(directory)
            for i in range(1, 11):
                mod.append_json(path / "messages.jsonl", {"role": "user", "id": i, "original": str(i), "context": []})
                mod.append_json(path / "messages.jsonl", {"role": "assistant", "id": i, "base": "base", "shown": "styled"})
            mod.append_json(path / "pairs.jsonl", {"id": 9, "original": "9", "neutral": "nine", "context": []})
            mod.append_json(path / "steps.jsonl", {"step": 1, "message_ids": list(range(1, 9)), "training": "river://train", "inference": "river://inf"})
            history, turns, pending, latest, last_id = mod.restore_run(path)
            self.assertEqual(len(history), 21)
            self.assertEqual(history[-1]["content"], "base")
            self.assertEqual(turns[-1]["assistant"], "styled")
            self.assertEqual([p["id"] for p in pending], [9, 10])
            self.assertEqual(pending[0]["neutral"], "nine")
            self.assertEqual(latest["training"], "river://train")
            self.assertEqual(last_id, 10)

    def test_context_window_and_direction(self):
        turns = [{'user': str(i), 'assistant': str(i)} for i in range(9)]
        payload = json.loads(mod.normalization_messages('target', turns)[1]['content'])
        self.assertEqual(payload['previous_exchanges'], turns[-5:])
        self.assertEqual(payload['target_message'], 'target')
        self.assertIn('neutral', mod.style_messages('neutral')[1]['content'])

    def exercise(self, fail=False):
        with TemporaryDirectory() as directory:
            batches, examples, normalizations = [], [], []
            class Model:
                def train_step(self, batch, **kwargs):
                    batches.append(batch)
                    if fail:
                        raise RuntimeError('uncertain step')
                    return NS(metrics={'loss_mean': 1.25}), NS(metrics={})
                def save_weights(self, name, **kwargs):
                    return NS(path='river://' + name)
            class Client:
                def close(self): pass
                def chat_complete(self, messages, **kwargs):
                    normalizations.append(messages)
                    return NS(response_json=json.dumps({'choices': [{'message': {'content': 'neutral'}}]}))
                def session(self, **kwargs): return nullcontext(self)
                def create_model(self, base_model, lora): return Model()
            class Renderer:
                def build_training_example(self, messages, **kwargs):
                    examples.append(messages)
                    return NS(input_ids=[1, 2], num_loss_tokens=1, to_dict=lambda: {'input_ids': [1, 2]})
            args = NS(run_dir=Path(directory), model='fake', max_tokens=100, checkpoint=None,
                      lora_rank=16, max_length=100, lr=1e-4, initial_step=0, initial_inference=None)
            saved = []
            learner = mod.Learner(args, Client, lambda *a, **k: Renderer(), lambda **k: None, 'last', on_saved=lambda path, step: saved.append((path, step)))
            for i in range(18):
                learner.jobs.put({'id': i, 'original': str(i), 'context': []})
            learner.jobs.put(None)
            learner.thread.start()
            learner.thread.join(5)
            self.assertFalse(learner.thread.is_alive())
            if fail:
                self.assertEqual(len(batches), 1)
                self.assertIsNotNone(learner.error)
                self.assertIsNone(learner.checkpoint())
            else:
                self.assertEqual([len(b) for b in batches], [8, 8])
                self.assertEqual(len(normalizations), 18)
                self.assertEqual([e[-1]['content'] for e in examples], [str(i) for i in range(16)])
                latest = json.loads((Path(directory) / 'latest.json').read_text())
                self.assertEqual(latest['step'], 2)
                self.assertEqual(latest['loss'], 1.25)
                self.assertEqual(latest['message_ids'], list(range(8, 16)))
                self.assertEqual(learner.checkpoint(), latest['inference'])
                self.assertEqual([step for path, step in saved], [1, 2])
                self.assertEqual(saved[-1][0], latest['inference'])
                self.assertEqual(len((Path(directory) / 'pairs.jsonl').read_text().splitlines()), 18)
    def test_two_steps_and_partial_batch(self): self.exercise()
    def test_failed_step_is_not_retried(self): self.exercise(fail=True)

if __name__ == '__main__': unittest.main()
