import formatDuration from "@/lib/formatDuration";

// THE place to edit when a field should appear in the panel's file info section.
//
// Two tools, each where it is strong: exiftool for stills (EXIF, ICC, PNG text chunks) and
// ffprobe for anything with streams. exiftool is unreliable on video - a 9.6 GB mp4 in this
// library reports nothing but its brand, no codec or duration - while ffprobe reads the
// same file completely, and faster.

function formatBitrate(raw) {
  const bits = Number(raw);
  if (!Number.isFinite(bits) || bits <= 0) return "";

  if (bits >= 1_000_000) return `${(bits / 1_000_000).toFixed(1)} Mbit/s`;
  return `${Math.round(bits / 1000)} kbit/s`;
}

// ffprobe reports frame rates as a fraction, and 30000/1001 is a real rate rather than a
// rounding artefact, so it is divided rather than shown raw.
function formatFrameRate(raw) {
  const [num, den] = String(raw ?? "").split("/").map(Number);
  if (!num || !den) return "";

  const fps = num / den;
  return `${Number.isInteger(fps) ? fps : fps.toFixed(2)} fps`;
}

function formatSampleRate(raw) {
  const hz = Number(raw);
  if (!Number.isFinite(hz) || hz <= 0) return "";

  return `${(hz / 1000).toFixed(1).replace(/\.0$/, "")} kHz`;
}

function joinParts(...parts) {
  return parts.filter(Boolean).join(" ");
}

// vp8 reports its profile as "0", which says nothing; h264's "High" and aac's "LC" do.
function formatCodec(stream) {
  const profile = /^\d+$/.test(String(stream.profile ?? "")) ? "" : stream.profile;

  return joinParts(stream.codec_name, profile && `(${profile})`);
}

// Each row names the exiftool keys that can carry it, best source first. Different formats
// file the same fact under different groups - bit depth is PNG:BitDepth in a PNG and
// File:BitsPerSample in a JPEG - so one row lists them all.
const IMAGE_FIELDS = [
  { label: "dimensions", keys: ["Composite:ImageSize"] },
  { label: "bit depth", keys: ["PNG:BitDepth", "File:BitsPerSample", "EXIF:BitsPerSample"] },
  { label: "color", keys: ["PNG:ColorType", "EXIF:ColorSpace", "File:YCbCrSubSampling"] },
  { label: "color profile", keys: ["ICC_Profile:ProfileDescription"] },
  { label: "encoding", keys: ["File:EncodingProcess", "PNG:Compression"] },
  { label: "orientation", keys: ["EXIF:Orientation", "XMP:Orientation"] },
  { label: "camera", keys: ["EXIF:Model"] },
  { label: "lens", keys: ["EXIF:LensModel", "EXIF:LensID"] },
  { label: "exposure", keys: ["EXIF:ExposureTime"] },
  { label: "aperture", keys: ["EXIF:FNumber"] },
  { label: "iso", keys: ["EXIF:ISO"] },
  { label: "focal length", keys: ["EXIF:FocalLength"] },
  { label: "taken", keys: ["EXIF:DateTimeOriginal", "EXIF:CreateDate"] },
  {
    label: "software",
    keys: ["EXIF:Software", "XMP:CreatorTool", "IPTC:OriginatingProgram", "PNG:Software"],
  },
  // Where Automatic1111 and friends leave the prompt. ComfyUI's PNG:Prompt and
  // PNG:Workflow are deliberately not read: they are 11 kB and 53 kB of node graph JSON,
  // which is not something anyone reads in a side panel.
  { label: "generated with", keys: ["PNG:Parameters", "EXIF:UserComment"], long: true },
];

export function buildImageInfoRows(exif) {
  if (!exif || typeof exif !== "object") return [];

  return IMAGE_FIELDS
    .map(({ label, keys, long }) => {
      const key = keys.find(candidate => {
        const value = exif[candidate];
        return value !== undefined && value !== null && String(value).trim() !== "";
      });

      return key ? { label, value: String(exif[key]).trim(), long } : null;
    })
    .filter(Boolean);
}

export function buildAvInfoRows(probe) {
  const format = probe?.format;
  if (!format) return [];

  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const video = streams.find(stream => stream.codec_type === "video");
  const audio = streams.find(stream => stream.codec_type === "audio");
  const tags = format.tags ?? {};

  const rows = [
    { label: "container", value: format.format_long_name },
    { label: "duration", value: formatDuration(Number(format.duration) * 1000) },
    { label: "bitrate", value: formatBitrate(format.bit_rate) },
  ];

  if (video) {
    rows.push(
      { label: "video", value: formatCodec(video) },
      { label: "resolution", value: video.width && `${video.width}x${video.height}` },
      { label: "frame rate", value: formatFrameRate(video.avg_frame_rate) },
      { label: "pixel format", value: joinParts(video.pix_fmt, video.bits_per_raw_sample && `${video.bits_per_raw_sample}-bit`) },
      { label: "color space", value: video.color_space },
      { label: "video bitrate", value: formatBitrate(video.bit_rate) },
    );
  }

  if (audio) {
    rows.push(
      { label: "audio", value: formatCodec(audio) },
      { label: "channels", value: audio.channel_layout ?? (audio.channels && String(audio.channels)) },
      { label: "sample rate", value: formatSampleRate(audio.sample_rate) },
      { label: "audio bitrate", value: formatBitrate(audio.bit_rate) },
    );
  }

  // Whatever the file calls itself, which for the mp3s here is the real artist and title.
  rows.push(
    { label: "title", value: tags.title },
    { label: "artist", value: tags.artist },
    { label: "album", value: tags.album },
  );

  return rows
    .filter(row => row.value)
    .map(row => ({ label: row.label, value: String(row.value).trim() }));
}
