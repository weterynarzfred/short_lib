import { execFile } from "child_process";
import { promisify } from "util";

import { FFPROBE } from "./binaries.js";

const run = promisify(execFile);

export default async function ffprobe(file) {
  const { stdout } = await run(FFPROBE, [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    file,
  ], { maxBuffer: 8_000_000 });

  return JSON.parse(stdout);
}
