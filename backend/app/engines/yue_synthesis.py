"""YuE2 0.1.6 synthesis adapter with bounded attention working memory.

The upstream pipeline does not expose nar.synthesize's query_chunk_size knob.
Keep its validation/loading steps here, then call that native implementation.
Query blocks retain every key/value and the original song chunks and RNG. This
avoids Windows math-SDPA's full attention matrix without shortening context.
"""
from .yue_progress import PipelineStatus


def synthesize_bounded(pipe, semantic, report, cancelled, query_chunk_size=256):
    from yue2.nar import synthesize
    from yue2.pipeline import SemanticResult
    from yue2.protocol import token_prefixes

    if not isinstance(semantic, SemanticResult):
        raise TypeError("Expected a native YuE2 semantic result")
    if token_prefixes(semantic.plan.request, pipe.tokenizer, semantic.plan.abc_ids) != semantic.plan.prefix:
        raise ValueError("Saved semantic result does not retain the request's exact prefix")
    if pipe.backend == "vllm":
        from yue2.fast import close_vllm
        close_vllm(pipe)
    if pipe.quantization != "none":
        from yue2.quantization import restore_ar
        restore_ar(pipe._model)
    model = pipe._load_model(for_nar=True)
    with PipelineStatus(report, "Synthesizing audio", unit="steps") as status:
        result = synthesize(model, semantic.plan.prefix, semantic.tokens,
            semantic.plan.request.seed, steps=pipe.generation_config.ode_steps,
            context=pipe.generation_config.context, offload_ar=pipe.offload_ar,
            cancelled=cancelled, query_chunk_size=query_chunk_size,
            on_progress=lambda completed, total: status.update(completed, total=total))
        return result.detach().float().cpu().numpy()
