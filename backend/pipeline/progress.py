"""
Verbose output while images download, so a slow first load shows what it's doing.

    Downloading D3 at 269.4461 +4.7707, 5' field: 41 exposures (13 cached, 28 to fetch, 8 at a time)
       ↓  1/28  2025-08-30 2025W35_1B_0123_2 D3   0.31 MB  0.42 s  rows 812-874
       ...
    Done D3: 28 downloaded (8.9 MB in 6.1 s, 1.5 MB/s), 13 from cache, 0 failed

Only real downloads get a line; files already on disk are just counted.
Turn the terminal output off with the environment variable SPHEREX_VERBOSE=0.

The website shows the same lines on its loading screen: it sends ?job=<id> with
/api/frames, and polls /api/progress?job=<id> while it waits. A request runs
inside `with job(id):`, and every line said during it is also kept for that id.
"""

import contextvars
import os
import threading
import time
from contextlib import contextmanager

VERBOSE = os.environ.get("SPHEREX_VERBOSE", "1").lower() not in ("0", "false", "no", "off")

_print_lock = threading.Lock()
_local = threading.local()  # bytes fetched by the current thread (fetch._get_bytes adds to it)

# ---- per-request logs for the website's loading screen ----
MAX_LINES = 400           # per job; the oldest are dropped
KEEP_SECONDS = 15 * 60    # forget finished jobs after this
_jobs = {}                # job id -> {"lines", "first", "fetch", "done", "updated"}
_jobs_lock = threading.Lock()
_current = contextvars.ContextVar("progress_job", default=None)


@contextmanager
def job(job_id):
    """Keep every line said inside this block for job_id (no-op when job_id is empty)."""
    if not job_id:
        yield
        return
    now = time.time()
    with _jobs_lock:
        for k in [k for k, j in _jobs.items() if now - j["updated"] > KEEP_SECONDS]:
            del _jobs[k]
        log = _jobs.setdefault(job_id, {"lines": [], "first": 0, "fetch": None, "done": False, "updated": now})
        log["done"] = False
    token = _current.set(log)
    try:
        yield
    finally:
        _current.reset(token)
        with _jobs_lock:
            log["done"] = True
            log["updated"] = time.time()


def current_log():
    """The job log of the calling thread's request (pass it on to worker threads)."""
    return _current.get()


def read_job(job_id, since=0):
    """Lines number `since` onwards, for GET /api/progress."""
    with _jobs_lock:
        log = _jobs.get(job_id)
        if not log:
            return {"lines": [], "next": since, "fetch": None, "done": False, "known": False}
        start = max(since, log["first"])
        lines = log["lines"][start - log["first"]:]
        return {"lines": lines, "next": log["first"] + len(log["lines"]),
                "fetch": dict(log["fetch"]) if log["fetch"] else None,
                "done": log["done"], "known": True}


def say(text, log=None, console=True):
    """Print one line (thread-safe, flushed so it shows up straight away), and keep it
    for the website when it belongs to a request (`log`, or the calling thread's).
    console=False: only for the website (status lines the terminal doesn't need)."""
    if VERBOSE and console:
        with _print_lock:
            print(text, flush=True)
    log = log if log is not None else _current.get()
    if log is not None:
        with _jobs_lock:
            log["lines"].append(text)
            if len(log["lines"]) > MAX_LINES:
                drop = len(log["lines"]) - MAX_LINES
                del log["lines"][:drop]
                log["first"] += drop
            log["updated"] = time.time()


def add_bytes(n):
    _local.bytes = getattr(_local, "bytes", 0) + n


def take_bytes():
    """Bytes this thread fetched since the last call (and reset the count)."""
    n = getattr(_local, "bytes", 0)
    _local.bytes = 0
    return n


def _mb(n):
    return n / 1e6


class Progress:
    """Counts one batch of cutouts (one array of one view, or one spectrum)."""

    def __init__(self, what, coord, fov, total, to_fetch, workers):
        self.what = what
        self.total, self.to_fetch = total, to_fetch
        self.done = self.cached = self.failed = 0
        self.bytes = 0
        self.t0 = time.time()
        self._lock = threading.Lock()
        self.log = current_log()  # made in the request's thread; downloads run in worker threads
        self._fetch_state()
        if total == 0:
            self.say(f"{what} at {coord.ra.deg:.4f} {coord.dec.deg:+.4f}: no SPHEREx exposures cover this spot")
        elif to_fetch:
            self.say(f"Downloading {what} at {coord.ra.deg:.4f} {coord.dec.deg:+.4f}, {fov:g}' field: "
                f"{total} exposures ({total - to_fetch} cached, {to_fetch} to fetch, {workers} at a time)")

    def say(self, text):
        say(text, self.log)

    def _fetch_state(self):
        """What the loading screen's progress bar shows."""
        if self.log is not None:
            with _jobs_lock:
                self.log["fetch"] = {"what": self.what, "done": self.done, "failed": self.failed,
                                     "total": self.to_fetch, "mb": round(_mb(self.bytes), 1)}

    def from_cache(self):
        with self._lock:
            self.cached += 1

    def downloaded(self, exposure, nbytes, seconds, rows=None):
        with self._lock:
            self.done += 1
            self.bytes += nbytes
            n = self.done
        self._fetch_state()
        where = f"  rows {rows[0]}-{rows[1] - 1}" if rows else ""
        self.say(f"   ↓ {n:>3}/{self.to_fetch}  {exposure['date'][:10]} {exposure['obs_id']} D{exposure['array']}"
            f"  {_mb(nbytes):5.2f} MB  {seconds:4.2f} s{where}")

    def fail(self, exposure, exc):
        with self._lock:
            self.failed += 1
        self._fetch_state()
        self.say(f"   ✗ download failed: {exposure['date'][:10]} {exposure['obs_id']} D{exposure['array']}: {exc}")

    def finish(self, extra=""):
        if not self.done and not self.failed:
            return  # all from cache: nothing to report
        secs = time.time() - self.t0
        rate = f", {_mb(self.bytes) / secs:.1f} MB/s" if secs > 0 and self.bytes else ""
        self.say(f"Done {self.what}: {self.done} downloaded ({_mb(self.bytes):.1f} MB in {secs:.1f} s{rate}), "
            f"{self.cached} from cache, {self.failed} failed{extra}")
