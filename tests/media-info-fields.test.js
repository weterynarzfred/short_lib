import { describe, expect, it } from "vitest";

import { buildAvInfoRows, buildImageInfoRows } from "@/lib/mediaInfoFields";

const valueOf = (rows, label) => rows.find(row => row.label === label)?.value;

describe("buildImageInfoRows", () => {
  it("reads a fact from whichever group the format files it under", () => {
    // A JPEG keeps bit depth in File:, a PNG in PNG:.
    expect(valueOf(buildImageInfoRows({ "File:BitsPerSample": 8 }), "bit depth")).toBe("8");
    expect(valueOf(buildImageInfoRows({ "PNG:BitDepth": 16 }), "bit depth")).toBe("16");
  });

  it("prefers the first listed source when a file has several", () => {
    const rows = buildImageInfoRows({
      "EXIF:Software": "GIMP 3.2.4",
      "XMP:CreatorTool": "GIMP",
      "IPTC:OriginatingProgram": "Topaz Labs",
    });

    expect(valueOf(rows, "software")).toBe("GIMP 3.2.4");
  });

  it("drops rows the file has nothing for", () => {
    const rows = buildImageInfoRows({ "Composite:ImageSize": "800x600" });

    expect(rows).toEqual([{ label: "dimensions", value: "800x600", long: undefined }]);
  });

  it("marks generation parameters as long, since they run to a thousand characters", () => {
    const rows = buildImageInfoRows({ "PNG:Parameters": "masterpiece, best quality" });

    expect(rows[0]).toMatchObject({ label: "generated with", long: true });
  });

  it("survives a file exiftool said nothing about", () => {
    expect(buildImageInfoRows(null)).toEqual([]);
    expect(buildImageInfoRows({})).toEqual([]);
  });
});

describe("buildAvInfoRows", () => {
  const probe = {
    format: {
      format_long_name: "QuickTime / MOV",
      duration: "3816.246009",
      bit_rate: "20118316",
      tags: { title: "a clip" },
    },
    streams: [
      {
        codec_type: "video",
        codec_name: "h264",
        profile: "High",
        width: 3840,
        height: 2160,
        avg_frame_rate: "30000/1001",
        pix_fmt: "yuv420p",
        bits_per_raw_sample: "8",
        color_space: "bt709",
        bit_rate: "19949989",
      },
      {
        codec_type: "audio",
        codec_name: "aac",
        profile: "LC",
        channel_layout: "stereo",
        sample_rate: "44100",
        bit_rate: "152595",
      },
    ],
  };

  it("reports the container, both streams and the tags", () => {
    const rows = buildAvInfoRows(probe);

    expect(valueOf(rows, "container")).toBe("QuickTime / MOV");
    expect(valueOf(rows, "duration")).toBe("1:03:36");
    expect(valueOf(rows, "bitrate")).toBe("20.1 Mbit/s");
    expect(valueOf(rows, "video")).toBe("h264 (High)");
    expect(valueOf(rows, "resolution")).toBe("3840x2160");
    expect(valueOf(rows, "pixel format")).toBe("yuv420p 8-bit");
    expect(valueOf(rows, "audio")).toBe("aac (LC)");
    expect(valueOf(rows, "channels")).toBe("stereo");
    expect(valueOf(rows, "sample rate")).toBe("44.1 kHz");
    expect(valueOf(rows, "audio bitrate")).toBe("153 kbit/s");
    expect(valueOf(rows, "title")).toBe("a clip");
  });

  // 30000/1001 is a real rate, not a rounding artefact, so the fraction has to be divided.
  it("divides the frame rate fraction", () => {
    expect(valueOf(buildAvInfoRows(probe), "frame rate")).toBe("29.97 fps");
    expect(valueOf(
      buildAvInfoRows({ format: {}, streams: [{ codec_type: "video", avg_frame_rate: "60/1" }] }),
      "frame rate"
    )).toBe("60 fps");
  });

  // vp8 reports its profile as "0", which would read as a codec called "vp8 (0)".
  it("drops a numeric profile", () => {
    const rows = buildAvInfoRows({
      format: {},
      streams: [{ codec_type: "video", codec_name: "vp8", profile: "0" }],
    });

    expect(valueOf(rows, "video")).toBe("vp8");
  });

  it("omits a stream the file does not have", () => {
    const rows = buildAvInfoRows({
      format: { format_long_name: "MP2/3" },
      streams: [{ codec_type: "audio", codec_name: "mp3", sample_rate: "48000" }],
    });

    expect(rows.map(row => row.label)).toEqual(["container", "audio", "sample rate"]);
  });

  it("survives a probe that returned nothing usable", () => {
    expect(buildAvInfoRows(null)).toEqual([]);
    expect(buildAvInfoRows({ format: {} })).toEqual([]);
  });
});
