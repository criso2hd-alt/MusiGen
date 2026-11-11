"""Experimental Supra2-IMG local cover generator.

The model's reference implementation publishes an inference script containing
the complete DiT architecture. This module implements those layers locally so
we never execute downloaded Python via Transformers trust_remote_code. Checkpoint
loading is restricted to tensor data (weights_only=True).
"""
from __future__ import annotations

import threading
import re
from pathlib import Path

from .gpu import model_operation

_lock = threading.RLock()
_dit = _tokenizer = _text = _vae = None
_device: str | None = None
_ctx_len = 128
_sampling_config: dict = {}


def is_loaded() -> bool:
    return _dit is not None


@model_operation()
def unload() -> None:
    global _dit, _tokenizer, _text, _vae, _device, _sampling_config, _ctx_len
    with _lock:
        _dit = _tokenizer = _text = _vae = None
        _device = None
        _sampling_config = {}
        _ctx_len = 128
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass


def _architecture():
    import math
    import torch
    from torch import nn
    from torch.nn import functional as F

    def modulate(x, shift, scale):
        return x * (1 + scale.unsqueeze(1)) + shift.unsqueeze(1)

    class TimestepEmbedder(nn.Module):
        def __init__(self, dim: int, freq_dim: int = 256):
            super().__init__()
            self.freq_dim = freq_dim
            self.mlp = nn.Sequential(nn.Linear(freq_dim, dim), nn.SiLU(), nn.Linear(dim, dim))

        def forward(self, t):
            half = self.freq_dim // 2
            freqs = torch.exp(-math.log(10000.0) * torch.arange(half, device=t.device) / half)
            args = t[:, None].float() * freqs[None] * 1000.0
            emb = torch.cat([torch.cos(args), torch.sin(args)], dim=-1)
            if self.freq_dim % 2:
                emb = F.pad(emb, (0, 1))
            return self.mlp(emb)

    class Attention(nn.Module):
        def __init__(self, dim: int, n_heads: int, ctx_dim: int | None = None):
            super().__init__()
            self.n_heads = n_heads
            self.head_dim = dim // n_heads
            self.is_self = ctx_dim is None
            if self.is_self:
                self.qkv = nn.Linear(dim, dim * 3, bias=True)
            else:
                self.q = nn.Linear(dim, dim, bias=True)
                self.kv = nn.Linear(ctx_dim, dim * 2, bias=True)
            self.proj = nn.Linear(dim, dim, bias=True)

        def forward(self, x, ctx=None, ctx_mask=None):
            b, n, c = x.shape
            if self.is_self:
                qkv = self.qkv(x).view(b, n, 3, self.n_heads, self.head_dim)
                q, k, v = (qkv[:, :, i].transpose(1, 2) for i in range(3))
            else:
                m = ctx.shape[1]
                q = self.q(x).view(b, n, self.n_heads, self.head_dim).transpose(1, 2)
                kv = self.kv(ctx).view(b, m, 2, self.n_heads, self.head_dim)
                k, v = kv[:, :, 0].transpose(1, 2), kv[:, :, 1].transpose(1, 2)
            mask = ctx_mask.bool()[:, None, None, :] if ctx_mask is not None else None
            out = F.scaled_dot_product_attention(q, k, v, attn_mask=mask)
            return self.proj(out.transpose(1, 2).reshape(b, n, c))

    class DiTBlock(nn.Module):
        def __init__(self, dim: int, heads: int, ctx_dim: int, ratio: float):
            super().__init__()
            self.norm1 = nn.LayerNorm(dim, elementwise_affine=False, eps=1e-6)
            self.self_attn = Attention(dim, heads)
            self.norm_ca = nn.LayerNorm(dim, elementwise_affine=False, eps=1e-6)
            self.cross_attn = Attention(dim, heads, ctx_dim=ctx_dim)
            self.norm2 = nn.LayerNorm(dim, elementwise_affine=False, eps=1e-6)
            self.mlp = nn.Sequential(nn.Linear(dim, int(dim * ratio)), nn.GELU(approximate="tanh"), nn.Linear(int(dim * ratio), dim))
            self.adaln = nn.Sequential(nn.SiLU(), nn.Linear(dim, 6 * dim, bias=True))

        def forward(self, x, c, ctx, ctx_mask):
            shifts = self.adaln(c).chunk(6, dim=1)
            ssa, sca, gsa, sm, scm, gm = shifts
            x = x + gsa.unsqueeze(1) * self.self_attn(modulate(self.norm1(x), ssa, sca))
            x = x + self.cross_attn(self.norm_ca(x), ctx=ctx, ctx_mask=ctx_mask)
            return x + gm.unsqueeze(1) * self.mlp(modulate(self.norm2(x), sm, scm))

    class FinalLayer(nn.Module):
        def __init__(self, dim: int, out_ch: int):
            super().__init__()
            self.norm = nn.LayerNorm(dim, elementwise_affine=False, eps=1e-6)
            self.linear = nn.Linear(dim, out_ch, bias=True)
            self.adaln = nn.Sequential(nn.SiLU(), nn.Linear(dim, 2 * dim, bias=True))

        def forward(self, x, c):
            shift, scale = self.adaln(c).chunk(2, dim=1)
            return self.linear(modulate(self.norm(x), shift, scale))

    class SupraDiT(nn.Module):
        def __init__(self):
            super().__init__()
            dim, patch, latent = 576, 2, 32
            self.patch = patch
            self.x_embed = nn.Linear(4 * patch * patch, dim)
            self.pos_embed = nn.Parameter(torch.zeros(1, (latent // patch) ** 2, dim))
            self.t_embed = TimestepEmbedder(dim)
            self.ctx_proj = nn.Linear(768, dim)
            self.blocks = nn.ModuleList([DiTBlock(dim, 9, dim, 4.0) for _ in range(14)])
            self.final = FinalLayer(dim, 4 * patch * patch)

        def forward(self, z, t, ctx, ctx_mask=None):
            b, c, h, w = z.shape
            p = self.patch
            x = z.view(b, c, h // p, p, w // p, p).permute(0, 2, 4, 1, 3, 5).reshape(b, (h // p) * (w // p), c * p * p)
            x = self.x_embed(x) + self.pos_embed
            cond = self.t_embed(t)
            context = self.ctx_proj(ctx)
            for block in self.blocks:
                x = block(x, cond, context, ctx_mask)
            x = self.final(x, cond)
            return x.view(b, h // p, w // p, c, p, p).permute(0, 3, 1, 4, 2, 5).reshape(b, c, h, w)

    return SupraDiT


def _ensure_models():
    global _dit, _tokenizer, _text, _vae, _device, _sampling_config, _ctx_len
    if _dit is not None:
        return
    import torch
    from diffusers import AutoencoderKL
    from transformers import AutoTokenizer, T5EncoderModel
    from . import model_manager

    if not torch.cuda.is_available():
        raise RuntimeError("Supra2-IMG experimental cover art currently requires an NVIDIA GPU; choose SD-Turbo on CPU systems.")
    # The app's shared GPU coordinator ensures other generators have released
    # their models before cover generation starts.
    try:
        from .engines import unload_all
        unload_all()
    except Exception:
        pass
    try:
        from . import llm
        llm.unload()
    except Exception:
        pass
    try:
        from . import cover
        cover.unload()
    except Exception:
        pass

    root = model_manager.supra_cover_dir()
    device = "cuda"
    dit = _architecture()().eval()
    # The checkpoint is a plain state dict. Refuse pickle globals/functions.
    state = torch.load(root / "dit" / "model_final_ema.pt", map_location="cpu", weights_only=True)
    cfg = state.get("config", {}) if isinstance(state, dict) else {}
    _sampling_config = cfg
    _ctx_len = int(cfg.get("ctx_len", 128))
    weights = state.get("ema", state.get("model", state)) if isinstance(state, dict) else state
    dit.load_state_dict(weights, strict=True)
    dit.to(device)
    tokenizer = AutoTokenizer.from_pretrained(str(root / "text"), local_files_only=True)
    text = T5EncoderModel.from_pretrained(str(root / "text"), local_files_only=True, use_safetensors=True).to(device).eval()
    vae = AutoencoderKL.from_pretrained(str(root / "vae"), local_files_only=True, use_safetensors=True).to(device).eval()
    for parameter in text.parameters():
        parameter.requires_grad_(False)
    _dit, _tokenizer, _text, _vae, _device = dit, tokenizer, text, vae, device


@model_operation(wait=False, name="Supra2-IMG cover generation")
def generate(prompt: str, out_path: Path, seed: int | None = None) -> Path:
    import torch
    from PIL import Image
    with _lock:
        _ensure_models()
        device = _device or "cuda"
        prompt = re.sub(r"(?i)album cover (?:image )?prompt:\s*", "", prompt)
        prompt = re.sub(
            r"(?i)album cover art for\s+(['\"]).*?\1\s*,?",
            "square digital illustration,",
            prompt,
        )
        prompt = f"{prompt.rstrip('. ') }. Artwork only, no text, no lettering, no words, no typography, no border."
        tokens = _tokenizer(prompt, padding="max_length", truncation=True, max_length=_ctx_len, return_tensors="pt").to(device)
        with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16):
            ctx = _text(**tokens).last_hidden_state.float()
            mask = tokens["attention_mask"].float()
            # Match the model card's recommended Euler-flow sampling settings.
            count = 50
            cfg_scale = 3.0
            zgen = torch.Generator(device=device)
            zgen.manual_seed(int(seed if seed is not None else torch.seed()) & 0x7FFFFFFF)
            z = torch.randn((1, 4, 32, 32), generator=zgen, device=device)
            dt = 1.0 / count
            if "uncond_text" in _sampling_config:
                uncond = _sampling_config["uncond_text"].to(device).float().unsqueeze(0)
                uncond_mask = _sampling_config["uncond_mask"].to(device).float().unsqueeze(0)
            else:
                blank = _tokenizer("", padding="max_length", truncation=True, max_length=tokens["input_ids"].shape[1], return_tensors="pt").to(device)
                uncond = _text(**blank).last_hidden_state.float()
                uncond_mask = blank["attention_mask"].float()
            ctx_all = torch.cat([ctx, uncond], 0)
            mask_all = torch.cat([mask, uncond_mask], 0)
            for i in range(count):
                t = torch.full((1,), i * dt, device=device)
                both = _dit(torch.cat([z, z], 0), torch.cat([t, t], 0), ctx_all, mask_all).float()
                conditional, unconditional = both.chunk(2, 0)
                z = z + dt * (unconditional + cfg_scale * (conditional - unconditional))
            pixels = (_vae.decode(z / 0.18215).sample.clamp(-1, 1) + 1) / 2
        array = (pixels[0].float().cpu().permute(1, 2, 0).numpy() * 255).round().astype("uint8")
        image = Image.fromarray(array, "RGB").resize((512, 512), Image.Resampling.LANCZOS)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(out_path, format="PNG")
        return out_path
