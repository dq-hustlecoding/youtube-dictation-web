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

    // Use yt-dlp to download subtitles
    const command = `yt-dlp --skip-download --write-auto-sub --sub-lang en --sub-format vtt --output "${outputTemplate}" "https://www.youtube.com/watch?v=${videoId}"`;

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

    // Parse VTT format
    const lines = subContent.split('\n');
    const subtitles = [];
    let index = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Match timestamp line: 00:00:00.000 --> 00:00:03.000 (with optional attributes)
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

        // Next non-empty line contains the text
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) {
          j++; // Skip empty lines
        }

        if (j < lines.length) {
          const textLine = lines[j].trim();
          // Remove timing tags like <00:00:00.399> and keep only the text
          const text = textLine.replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '').replace(/<[^>]*>/g, '').trim();

          if (text) {
            subtitles.push({
              text,
              start,
              duration: end - start,
              index: index++
            });
          }
        }

        i = j;
      }
    }

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
