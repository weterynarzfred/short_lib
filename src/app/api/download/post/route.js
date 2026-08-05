import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PassThrough } from "stream";
import { spawn } from "child_process";

import db from "@/lib/db";
import { runFfmpeg, streamFfmpeg } from "@/lib/ffmpeg";
import { getTempPath } from "@/app/api/upload/path_helpers";
import {
  CRF_MAX,
  DOWNLOAD_PRESETS,
  RATE_MODES,
  buildDownloadFilename,
  clampCrf,
  isPresetAllowed,
  resolveOutputSeconds,
  resolveTargetBitrate,
  resolveTrim,
  supportsTrim,
} from "@/lib/downloadPresets";

const STORAGE_DIR = process.env.STORAGE_DIR;

const selectMedia = db.prepare(`
  SELECT file_path, mime_type, original_filename, duration_ms
  FROM media
  WHERE id = ?
`);

// Probed once and cached: which AV1 encoder this ffmpeg build actually has. SVT-AV1 is
// dramatically faster than libaom, so it is preferred wherever available.
const AV1_ENCODERS = ["libsvtav1", "libaom-av1", "librav1e"];
let av1EncoderPromise = null;

function detectAv1Encoder() {
  if (av1EncoderPromise) return av1EncoderPromise;

  av1EncoderPromise = new Promise(resolve => {
    const probe = spawn("ffmpeg", ["-hide_banner", "-encoders"]);
    let output = "";

    probe.stdout.on("data", chunk => { output += chunk.toString(); });
    probe.on("error", () => resolve(null));
    probe.on("close", () => {
      resolve(AV1_ENCODERS.find(encoder => output.includes(encoder)) ?? null);
    });
  });

  return av1EncoderPromise;
}

function buildVideoArgs(encoder, crf) {
  if (encoder === "libsvtav1")
    return ["-c:v", "libsvtav1", "-crf", String(crf), "-preset", "8"];

  if (encoder === "libaom-av1")
    return ["-c:v", "libaom-av1", "-crf", String(crf), "-b:v", "0", "-cpu-used", "6"];

  // rav1e has no CRF; its quantizer runs 0-255, so the requested quality is scaled onto
  // that range rather than passed through.
  const qp = Math.round((crf / CRF_MAX) * 255);
  return ["-c:v", "librav1e", "-qp", String(qp)];
}

// ffmpeg writes "<base>-0.log" and sometimes a companion file, so the whole set is removed
// by prefix. Named per request: two concurrent size-target downloads sharing a log would
// each read the other's statistics.
function cleanupPassLog(passLogPath) {
  const dir = path.dirname(passLogPath);
  const prefix = path.basename(passLogPath);

  try {
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith(prefix)) fs.rmSync(path.join(dir, entry), { force: true });
    }
  } catch {
    // A missing tmp directory is not worth failing a finished download over.
  }
}

// Pass 1 produces no output, so nothing can be sent until it finishes. The response body is
// handed back immediately as an empty stream and pass 2 is piped into it once the analysis
// is done - which is why this mode looks like it hangs before any bytes arrive.
function streamTwoPass(firstArgs, secondArgs, passLogPath, signal, label) {
  const output = new PassThrough();

  (async () => {
    try {
      await runFfmpeg(firstArgs, { signal, label: `${label} pass 1` }).closed;
      if (signal?.aborted) throw new Error("aborted");

      const second = runFfmpeg(secondArgs, { signal, label: `${label} pass 2` });
      second.process.stdout.pipe(output);
      await second.closed;
    } catch (error) {
      console.error(`ffmpeg ${label} failed:`, error.message);
      output.destroy(error);
    } finally {
      cleanupPassLog(passLogPath);
    }
  })();

  return output;
}

function contentDisposition(filename) {
  // Non-ASCII names need the RFC 5987 form; the plain one is a fallback for old clients.
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");

  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(req) {
  if (!STORAGE_DIR) return new Response("Storage is not configured", { status: 500 });

  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return new Response("Bad request", { status: 400 });

  const media = selectMedia.get(id);
  if (!media) return new Response("Not found", { status: 404 });

  const presetKey = url.searchParams.get("preset") || "original";
  const preset = DOWNLOAD_PRESETS[presetKey];
  if (!preset || !isPresetAllowed(presetKey, media.mime_type))
    return new Response("Unsupported preset for this media type", { status: 400 });

  const trim = resolveTrim(url.searchParams.get("start"), url.searchParams.get("end"));
  if (trim && !supportsTrim(media.mime_type))
    return new Response("This media type cannot be trimmed", { status: 400 });

  // Trimming re-encodes so the cut lands on an exact frame, which the untouched original
  // by definition cannot do.
  if (trim && presetKey === "original")
    return new Response("Trimming needs a re-encoding preset", { status: 400 });

  const base = path.resolve(STORAGE_DIR, "full");
  const filePath = path.resolve(base, media.file_path);
  if (filePath !== base && !filePath.startsWith(base + path.sep))
    return new Response("Bad request", { status: 400 });
  if (!fs.existsSync(filePath)) return new Response("Not found", { status: 404 });

  const filename = buildDownloadFilename(
    media.original_filename || path.basename(filePath),
    preset,
    { trimmed: Boolean(trim) }
  );

  if (presetKey === "original") {
    const stat = fs.statSync(filePath);

    return new Response(fs.createReadStream(filePath), {
      headers: {
        "Content-Type": media.mime_type || "application/octet-stream",
        "Content-Length": stat.size.toString(),
        "Content-Disposition": contentDisposition(filename),
      },
    });
  }

  if (presetKey === "jpeg") {
    // sharp rather than ffmpeg: already a dependency, and it is the tool the upload
    // pipeline uses for stills.
    const sharp = (await import("sharp")).default;
    const stream = sharp(filePath).jpeg({ quality: 80 }).on("error", error => {
      console.error("sharp failed while converting to jpeg:", error);
    });

    return new Response(stream, {
      headers: {
        "Content-Type": preset.contentType,
        "Content-Disposition": contentDisposition(filename),
      },
    });
  }

  // Length is unknown until the encode finishes, and it is streamed as it goes.
  const encodedResponse = body => new Response(body, {
    headers: {
      "Content-Type": preset.contentType,
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "no-store",
    },
  });

  const inputArgs = ["-v", "error", "-nostdin"];
  // Input-side seek, which is fast and still frame-exact because the output is re-encoded
  // rather than copied. Duration goes after the input so it counts from the seek point.
  if (trim) inputArgs.push("-ss", String(trim.start));
  inputArgs.push("-i", filePath);
  if (trim?.duration) inputArgs.push("-t", String(trim.duration));

  if (presetKey === "mp3") {
    return encodedResponse(streamFfmpeg(
      [...inputArgs, "-vn", "-c:a", "libmp3lame", "-b:a", "320k", "-f", "mp3", "pipe:1"],
      { signal: req.signal, label: `encoding media ${id} as mp3` }
    ));
  }

  const encoder = await detectAv1Encoder();
  if (!encoder) return new Response("No AV1 encoder available", { status: 501 });

  // Clamped rather than rejected: an out-of-range value can only produce a bounded encode,
  // never a wrong one, and this matches how limit: and score: behave.
  const crf = clampCrf(url.searchParams.get("crf"));
  const dropAudio = url.searchParams.get("noAudio") === "1";
  const wantsTargetSize = url.searchParams.get("mode") === RATE_MODES.size;

  inputArgs.push("-map", "0:v:0?");
  if (!dropAudio) inputArgs.push("-map", "0:a?");

  const audioArgs = dropAudio ? ["-an"] : ["-c:a", "aac", "-b:a", "192k"];
  const outputArgs = [
    // Fragmented output, because a pipe cannot be seeked back to write the moov atom.
    "-movflags", "+frag_keyframe+empty_moov",
    "-f", "mp4",
    "pipe:1",
  ];

  if (!wantsTargetSize) {
    const args = [
      ...inputArgs, ...buildVideoArgs(encoder, crf),
      "-pix_fmt", "yuv420p",
      ...audioArgs, ...outputArgs,
    ];

    return encodedResponse(streamFfmpeg(args, {
      signal: req.signal,
      label: `encoding media ${id} as ${presetKey}`,
    }));
  }

  const seconds = resolveOutputSeconds(media.duration_ms, trim);
  if (!seconds)
    return new Response("This media has no usable duration to size against", { status: 400 });

  const videoBitrate = resolveTargetBitrate({
    targetMb: url.searchParams.get("targetMb"),
    seconds,
    withAudio: !dropAudio,
  });

  if (!videoBitrate)
    return new Response("Target size is too small for this duration", { status: 400 });

  const passLogPath = getTempPath(`pass-${crypto.randomUUID()}`);
  const twoPassArgs = [
    ...inputArgs, "-c:v", encoder, "-b:v", String(videoBitrate),
    "-pix_fmt", "yuv420p",
  ];

  return encodedResponse(streamTwoPass(
    // Pass 1 analyses only: no audio encode, no muxing, output discarded.
    [
      ...twoPassArgs, "-pass", "1", "-passlogfile", passLogPath,
      "-an", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null",
    ],
    [...twoPassArgs, "-pass", "2", "-passlogfile", passLogPath, ...audioArgs, ...outputArgs],
    passLogPath,
    req.signal,
    `media ${id}`
  ));
}
