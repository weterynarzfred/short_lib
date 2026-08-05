import { spawn } from "child_process";

// ffmpeg is chatty even when it succeeds, and only the tail matters when it does not.
const STDERR_TAIL_BYTES = 8192;

// One place for the three things every ffmpeg call here needs: keep the end of stderr for
// the error message, kill the process when the client goes away, and report the exit code.
export function runFfmpeg(args, { signal, label } = {}) {
  const process = spawn("ffmpeg", args);

  let stderr = "";
  process.stderr.on("data", chunk => {
    stderr += chunk.toString();
    if (stderr.length > STDERR_TAIL_BYTES) stderr = stderr.slice(-STDERR_TAIL_BYTES);
  });

  // A cancelled download must stop the encode rather than leave ffmpeg burning CPU on
  // output nobody will read.
  const onAbort = () => {
    if (!process.killed) process.kill("SIGKILL");
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  const closed = new Promise((resolve, reject) => {
    process.on("error", reject);
    process.on("close", code => {
      signal?.removeEventListener("abort", onAbort);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg ${label ?? "run"} exited with ${code}`));
    });
  });

  return { process, closed };
}

// Streams stdout as it is produced. Failures are logged rather than thrown: the response
// headers are long gone by the time ffmpeg gives up, so there is nothing left to say.
export function streamFfmpeg(args, { signal, label } = {}) {
  const { process, closed } = runFfmpeg(args, { signal, label });

  closed.catch(error => {
    console.error(`ffmpeg ${label ?? "run"} failed:`, error.message);
  });

  return process.stdout;
}
