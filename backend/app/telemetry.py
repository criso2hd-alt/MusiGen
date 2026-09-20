"""Read-only system samples. Never import torch or allocate GPU memory."""
import asyncio
import csv
import os
import subprocess
import time

from .gpu import activity


def number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def sample() -> dict:
    result = {"sampled_at": time.time(), "cpu_percent": None, "ram": None,
              "gpus": [], "gpu_error": None, "system_error": None}
    try:
        import psutil
        ram = psutil.virtual_memory()
        result.update(cpu_percent=psutil.cpu_percent(interval=0.1), ram={
            "total_bytes": ram.total, "available_bytes": ram.available,
            "used_bytes": ram.total - ram.available, "percent": ram.percent})
    except Exception as exc:
        result["system_error"] = f"System metrics unavailable: {exc}"
    try:
        command = subprocess.run([
            "nvidia-smi", "--query-gpu=index,name,memory.total,memory.used,utilization.gpu,temperature.gpu",
            "--format=csv,noheader,nounits"], capture_output=True, text=True,
            timeout=2, check=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        for row in csv.reader(command.stdout.splitlines()):
            if len(row) != 6:
                continue
            index, name, total, used, utilization, temp = [s.strip() for s in row]
            total, used = number(total), number(used)
            result["gpus"].append({"index": index, "name": name,
                "total_bytes": total * 2**20 if total is not None else None,
                "used_bytes": used * 2**20 if used is not None else None,
                "free_bytes": max(0, total - used) * 2**20 if total is not None and used is not None else None,
                "utilization_percent": number(utilization), "temperature_c": number(temp)})
    except (OSError, subprocess.SubprocessError) as exc:
        result["gpu_error"] = f"NVIDIA metrics unavailable ({type(exc).__name__})"
    return result


class Telemetry:
    def __init__(self):
        self.latest = {"sampled_at": None, "cpu_percent": None, "ram": None, "gpus": [],
                       "gpu_error": None, "system_error": "Waiting for first sample"}
        self.task = None

    def start(self):
        self.task = asyncio.create_task(self._run())

    async def stop(self):
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass

    async def _run(self):
        while True:
            self.latest = await asyncio.to_thread(sample)
            await asyncio.sleep(3)

    def snapshot(self):
        return {**self.latest, "model_activity": activity()}


telemetry = Telemetry()
