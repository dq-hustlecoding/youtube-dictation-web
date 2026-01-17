import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);

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

    // Create a unique temp filename
    const tempId = Date.now();
    const tempDir = '/tmp';
    const outputTemplate = path.join(tempDir, `subtitle_${tempId}.%(ext)s`);

    // Use yt-dlp to download subtitles with user-agent and other flags to avoid bot detection
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const command = `yt-dlp --skip-download --write-auto-sub --sub-lang en --sub-format vtt --user-agent "${userAgent}" --extractor-args "youtube:player_client=web;player_skip=configs,js" --no-check-certificate --sleep-requests 1 --referer "https://www.youtube.com/" --output "${outputTemplate}" "https://www.youtube.com/watch?v=${videoId}"`;

    console.log("Running yt-dlp...");
    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024
    });

    console.log("yt-dlp completed");

    // Find the generated subtitle file
    const expectedFile = path.join(tempDir, `subtitle_${tempId}.en.vtt`);

    if (!fs.existsSync(expectedFile)) {
      console.log("Expected file not found:", expectedFile);
      throw new Error("No subtitle file generated");
    }

    const subContent = fs.readFileSync(expectedFile, 'utf8');

    console.log("Subtitle file content length:", subContent.length);

    // Parse VTT format - collect all text lines between timestamps
    const lines = subContent.split('\n');
    const rawSubtitles = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      // Match timestamp line: 00:00:00.000 --> 00:00:03.000
      const timestampMatch = line.match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);

      if (timestampMatch) {
        const startHours = parseInt(timestampMatch[1]);
        const startMinutes = parseInt(timestampMatch[2]);
        const startSeconds = parseInt(timestampMatch[3]);
        const startMs = parseInt(timestampMatch[4]);

        const endHours = parseInt(timestampMatch[5]);
        const endMinutes = parseInt(timestampMatch[6]);
        const endSeconds = parseInt(timestampMatch[7]);
        const endMs = parseInt(timestampMatch[8]);

        const start = startHours * 3600 + startMinutes * 60 + startSeconds + startMs / 1000;
        const end = endHours * 3600 + endMinutes * 60 + endSeconds + endMs / 1000;

        // Collect text lines until we hit an empty line or next timestamp
        const textLines = [];
        i++;

        while (i < lines.length) {
          const textLine = lines[i].trim();

          // Stop if empty line or next timestamp
          if (!textLine || /^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->/.test(textLine)) {
            break;
          }

          // Skip cue identifiers (numbers or UUIDs)
          if (!textLine.match(/^\d+$/) && !textLine.match(/^[a-f0-9-]{36}$/i)) {
            textLines.push(textLine);
          }

          i++;
        }

        // For karaoke-style subtitles, prefer lines with timing tags
        let selectedLine = '';
        const karaokeLines = textLines.filter(line => line.includes('<') && /\d{2}:\d{2}:\d{2}\.\d{3}/.test(line));

        if (karaokeLines.length > 0) {
          // Use the last karaoke line (most complete)
          selectedLine = karaokeLines[karaokeLines.length - 1];
        } else if (textLines.length > 0) {
          // No karaoke tags, use all lines
          selectedLine = textLines.join(' ');
        }

        // Clean the text
        const cleanedText = selectedLine
          .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '') // Remove inline timestamps
          .replace(/<[^>]*>/g, '') // Remove HTML tags
          .replace(/align:\w+\s*/g, '') // Remove alignment
          .replace(/position:\d+%\s*/g, '') // Remove position
          .replace(/\s+/g, ' ') // Normalize spaces
          .trim();

        if (cleanedText) {
          rawSubtitles.push({
            text: cleanedText,
            start,
            duration: end - start,
          });
        }
      } else {
        i++;
      }
    }

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

    // Clean up the subtitle file
    fs.unlinkSync(expectedFile);

    if (subtitles.length === 0) {
      throw new Error("No subtitles found in VTT file");
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
