import { spawn } from "child_process";

import { FFPROBE } from "@/lib/binaries";

export default function ffprobe(file) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFPROBE, [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      file,
    ]);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", d => (stdout += d));
    proc.stderr.on("data", d => (stderr += d));

    proc.on("close", code => {
      if (code !== 0) return reject(new Error(stderr));
      resolve(JSON.parse(stdout));
    });
  });
}
