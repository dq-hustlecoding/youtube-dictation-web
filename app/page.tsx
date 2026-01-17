"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [youtubeURL, setYoutubeURL] = useState("https://youtu.be/DNgddXIq3zU");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const extractVideoID = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    // If just video ID
    if (url.length === 11 && /^[a-zA-Z0-9_-]+$/.test(url)) {
      return url;
    }

    return null;
  };

  const handleStart = async () => {
    setError("");
    const videoID = extractVideoID(youtubeURL);

    if (!videoID) {
      setError("Invalid YouTube URL");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/subtitles?videoId=${videoID}`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch subtitles");
      }

      const data = await response.json();

      if (!data.subtitles || data.subtitles.length === 0) {
        throw new Error("No English subtitles found for this video");
      }

      // Navigate to practice page with videoID
      router.push(`/practice?videoId=${videoID}`);
    } catch (err: any) {
      setError(err.message || "Failed to load subtitles");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8 md:mb-12 mt-8 md:mt-16">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            🎥 YouTube 받아쓰기
          </h1>
          <p className="text-lg md:text-xl text-gray-600">
            유튜브 영상으로 영어 듣기 연습하기
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
          <h2 className="text-xl md:text-2xl font-semibold mb-4">YouTube URL 입력</h2>

          <input
            type="text"
            value={youtubeURL}
            onChange={(e) => setYoutubeURL(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none mb-4 text-sm md:text-base"
          />

          <button
            onClick={handleStart}
            disabled={isLoading || !youtubeURL}
            className="w-full bg-blue-600 text-white py-3 md:py-4 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm md:text-base"
          >
            {isLoading ? "로딩 중..." : "연습 시작하기"}
          </button>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm md:text-base">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 md:mt-8 text-center text-gray-600">
          <p className="text-xs md:text-sm">
            영어 자막이 있는 YouTube 영상 URL을 입력하세요
          </p>
        </div>
      </div>
    </main>
  );
}
