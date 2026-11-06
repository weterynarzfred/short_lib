// The external tools, resolved from the environment with a bare command name as the
// default. Overridable because the app does not always run as the user who installed them:
// under the LAN service manager it runs as LocalSystem, which sees the machine PATH only,
// so a tool installed on the user PATH is silently missing.
//
// No "@/" imports here: the preview backfill script loads this under plain node.
export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";
export const EXIFTOOL = process.env.EXIFTOOL_PATH || "exiftool";
