import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json(
      { error: "Missing videoId parameter" },
      { status: 400 }
    );
  }

  try {
    console.log(`Fetching transcript for video: ${videoId}`);

    // Fetch transcript using youtube-transcript
    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);

    if (!transcriptItems || transcriptItems.length === 0) {
      throw new Error("No transcript found");
    }

    console.log(`Fetched ${transcriptItems.length} transcript items`);

    // Convert to our format
    const rawSubtitles = transcriptItems.map((item: any) => ({
      text: item.text,
      start: item.offset / 1000, // Convert ms to seconds
      duration: item.duration / 1000, // Convert ms to seconds
    }));

    console.log(`Parsed ${rawSubtitles.length} raw subtitles`);

    // Step 1: Remove exact duplicates (same text appearing consecutively)
    const deduplicated = [];
    for (let j = 0; j < rawSubtitles.length; j++) {
      const current = rawSubtitles[j];

      // Skip if this is exact duplicate of previous
      if (deduplicated.length > 0 && deduplicated[deduplicated.length - 1].text === current.text) {
        // Extend the duration of previous instead
        const prev = deduplicated[deduplicated.length - 1];
        const newEnd = current.start + current.duration;
        prev.duration = newEnd - prev.start;
      } else {
        deduplicated.push({ ...current });
      }
    }

    console.log(`After deduplication: ${deduplicated.length} subtitles`);

    // Step 2: Merge very short segments (< 0.8 seconds) with context
    const merged = [];
    for (let j = 0; j < deduplicated.length; j++) {
      const current = deduplicated[j];

      if (current.duration < 0.8 && merged.length > 0) {
        // Merge short segment with previous
        const prev = merged[merged.length - 1];
        prev.text += ' ' + current.text;
        const newEnd = current.start + current.duration;
        prev.duration = newEnd - prev.start;
      } else {
        merged.push({ ...current });
      }
    }

    console.log(`After merging short segments: ${merged.length} subtitles`);

    // Step 3: Remove subtitles that are substrings of the next one
    const cleaned = [];
    for (let j = 0; j < merged.length; j++) {
      const current = merged[j];
      const next = merged[j + 1];

      // Skip if next subtitle starts with current (progressive reveal)
      if (next && next.text.startsWith(current.text + ' ')) {
        // This is progressive reveal, skip current
        continue;
      }

      cleaned.push({ ...current });
    }

    console.log(`After removing progressive reveals: ${cleaned.length} subtitles`);

    // Add indices
    const subtitles = cleaned.map((sub, index) => ({
      ...sub,
      index,
    }));

    console.log(`Final subtitle count: ${subtitles.length}`);

    if (subtitles.length === 0) {
      throw new Error("No subtitles found");
    }

    console.log(`Subtitles processed: ${subtitles.length} items`);

    return NextResponse.json({
      videoId,
      subtitles,
      count: subtitles.length,
    });
  } catch (error: any) {
    console.error("Error fetching subtitles:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to fetch subtitles",
        details: "No English subtitles found for this video",
      },
      { status: 404 }
    );
  }
}
