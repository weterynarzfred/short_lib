import fs from "fs";
import path from "path";
import { spawn } from "child_process";

import db from "@/lib/db";
import {
  CRF_MAX,
  DOWNLOAD_PRESETS,
  buildDownloadFilename,
  clampCrf,
  isPresetAllowed,
  resolveTrim,
  supportsTrim,
} from "@/lib/downloadPresets";

const STORAGE_DIR = process.env.STORAGE_DIR;

const selectMedia = db.prepare(`
  SELECT file_path, mime_type, original_filename
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

function spawnFfmpeg(args, signal, label) {
  const ffmpeg = spawn("ffmpeg", args);

  let stderr = "";
  ffmpeg.stderr.on("data", chunk => {
    stderr += chunk.toString();
    if (stderr.length > 8192) stderr = stderr.slice(-8192);
  });

  ffmpeg.on("error", error => {
    console.error(`ffmpeg spawn failed while ${label}:`, error);
  });

  ffmpeg.on("close", code => {
    if (code === 0) return;
    console.error(`ffmpeg ${label} failed:`, stderr.trim() || `exit code ${code}`);
  });

  // The response is streamed as it encodes, so a cancelled download must stop the encode
  // rather than leave ffmpeg burning CPU on output nobody will read.
  if (signal) {
    signal.addEventListener("abort", () => {
      if (!ffmpeg.killed) ffmpeg.kill("SIGKILL");
    }, { once: true });
  }

  return ffmpeg.stdout;
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

  const args = ["-v", "error", "-nostdin"];
  // Input-side seek, which is fast and still frame-exact because the output is re-encoded
  // rather than copied. Duration goes after the input so it counts from the seek point.
  if (trim) args.push("-ss", String(trim.start));
  args.push("-i", filePath);
  if (trim?.duration) args.push("-t", String(trim.duration));

  if (presetKey === "mp3") {
    args.push("-vn", "-c:a", "libmp3lame", "-b:a", "320k", "-f", "mp3", "pipe:1");
  } else {
    const encoder = await detectAv1Encoder();
    if (!encoder) return new Response("No AV1 encoder available", { status: 501 });

    // Clamped rather than rejected: an out-of-range value can only produce a bounded
    // encode, never a wrong one, and this matches how limit: and score: behave.
    const crf = clampCrf(url.searchParams.get("crf"));
    const dropAudio = url.searchParams.get("noAudio") === "1";

    args.push("-map", "0:v:0?");
    if (!dropAudio) args.push("-map", "0:a?");

    args.push(...buildVideoArgs(encoder, crf), "-pix_fmt", "yuv420p");

    if (dropAudio) args.push("-an");
    else args.push("-c:a", "aac", "-b:a", "192k");

    args.push(
      // Fragmented output, because a pipe cannot be seeked back to write the moov atom.
      "-movflags", "+frag_keyframe+empty_moov",
      "-f", "mp4",
      "pipe:1"
    );
  }

  const stream = spawnFfmpeg(args, req.signal, `encoding media ${id} as ${presetKey}`);

  return new Response(stream, {
    headers: {
      "Content-Type": preset.contentType,
      "Content-Disposition": contentDisposition(filename),
      // Length is unknown until the encode finishes, and it is streamed as it goes.
      "Cache-Control": "no-store",
    },
  });
}
