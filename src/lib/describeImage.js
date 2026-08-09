import sharp from "sharp";

// Where the vision model lives. Points at the LAN service manager rather than koboldcpp
// itself, so the model is started on the first request and shut down again once it goes
// idle - 19 GB of weights is not something to keep resident for a button nobody pressed.
const LLM_URL = process.env.LLM_URL || "http://127.0.0.1:3403";

// The first request after an idle period waits for the model to load, which is minutes
// rather than seconds. Anything shorter would abort a request that was going to succeed.
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

// Gemma's vision tower works on small tiles, so a 9116x14152 original is 100 MB of base64
// spent on detail the model never sees. Everything is resized to this on the long side.
const MAX_IMAGE_EDGE = 1024;

// The configured model reasons before it answers, and that reasoning counts against the
// limit even though koboldcpp hands it back separately as `reasoning_content`. A limit
// that only fits the answer truncates the model mid-thought, and a truncated thought is
// what comes back as the answer - which is exactly as useless as it sounds. About a
// thousand tokens go on thinking, so this leaves room for both.
const MAX_TOKENS = 8000;

async function toDataUrl(filePath) {
  const jpeg = await sharp(filePath)
    .rotate()
    .resize({
      width: MAX_IMAGE_EDGE,
      height: MAX_IMAGE_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

// Returns the model's text, or throws with something worth showing the user. The
// OpenAI-shaped endpoint rather than koboldcpp's own, so pointing LLM_URL at anything else
// that speaks it needs no code change.
export default async function describeImage(filePath, prompt) {
  const dataUrl = await toDataUrl(filePath);

  const response = await fetch(`${LLM_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      max_tokens: MAX_TOKENS,
      temperature: 0.3,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      }],
    }),
  });

  if (!response.ok)
    throw new Error(`the model answered with ${response.status}`);

  const payload = await response.json();
  const choice = payload?.choices?.[0];

  // A model cut off mid-thought hands back the unfinished reasoning as its answer, which
  // is worse than no answer at all - it reads like a plan rather than a description.
  if (choice?.finish_reason === "length")
    throw new Error("the model ran out of room before it finished answering");

  const text = choice?.message?.content;
  if (typeof text !== "string" || !text.trim())
    throw new Error("the model returned nothing");

  return text.trim();
}
