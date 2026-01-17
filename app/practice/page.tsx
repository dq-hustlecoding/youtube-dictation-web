"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import YouTube, { YouTubeProps } from "react-youtube";

interface Subtitle {
  text: string;
  start: number;
  duration: number;
  index: number;
}

function PracticeContent() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get("videoId");

  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState("");
  const [isRevealed, setIsRevealed] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [player, setPlayer] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate current subtitle early (before any conditional returns)
  const currentSubtitle = subtitles[currentIndex];

  useEffect(() => {
    if (videoId) {
      fetchSubtitles(videoId);
    }
  }, [videoId]);

  // Debug log
  useEffect(() => {
    if (currentSubtitle) {
      console.log(`[RENDER] currentIndex: ${currentIndex}, currentSubtitle: "${currentSubtitle?.text}"`);
    }
  }, [currentIndex, currentSubtitle]);

  // Infinite loop playback effect
  useEffect(() => {
    if (!isPlaying || !player || !subtitles[currentIndex]) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const current = subtitles[currentIndex];
    const endTime = current.start + current.duration;

    // Start interval to check playback position
    intervalRef.current = setInterval(() => {
      if (!player.getCurrentTime) return;

      const currentTime = player.getCurrentTime();

      // If reached the end, loop back to start
      if (currentTime >= endTime || currentTime < current.start) {
        player.seekTo(current.start, true);
        player.playVideo();
      }
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, currentIndex, player, subtitles]);

  const fetchSubtitles = async (vid: string) => {
    try {
      const response = await fetch(`/api/subtitles?videoId=${vid}`);
      const data = await response.json();
      setSubtitles(data.subtitles || []);
      setIsLoading(false);
    } catch (error) {
      console.error("Error fetching subtitles:", error);
      setIsLoading(false);
    }
  };

  const onPlayerReady: YouTubeProps["onReady"] = (event) => {
    setPlayer(event.target);
  };

  const onPlayerStateChange = (event: any) => {
    // When user manually pauses, stop the loop
    if (event.data === 2 && isPlaying) {
      // Check if this pause was user-initiated (not from our loop logic)
      const current = subtitles[currentIndex];
      if (current && player) {
        const currentTime = player.getCurrentTime();
        // If paused in the middle (not at the end), user paused it
        if (currentTime < current.start + current.duration - 0.5) {
          setIsPlaying(false);
        }
      }
    }
  };

  const playCurrentSubtitle = () => {
    if (player && subtitles[currentIndex]) {
      const current = subtitles[currentIndex];
      setIsPlaying(true);
      player.seekTo(current.start, true);
      player.playVideo();
    }
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      stopPlaying();
    } else {
      playCurrentSubtitle();
    }
  };

  const stopPlaying = () => {
    if (player) {
      setIsPlaying(false);
      player.pauseVideo();
    }
  };

  const calculateAccuracy = (correct: string, input: string): number => {
    // Normalize both strings
    const normalizeText = (text: string) => {
      return text
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
    };

    const correctNorm = normalizeText(correct);
    const inputNorm = normalizeText(input);

    if (inputNorm.length === 0) return 0;
    if (correctNorm === inputNorm) return 100;

    // Split into words
    const correctWords = correctNorm.split(' ');
    const inputWords = inputNorm.split(' ');

    // Calculate word-level accuracy
    let correctCount = 0;
    const usedIndices = new Set<number>();

    // For each correct word, find if it exists in input
    for (const correctWord of correctWords) {
      for (let i = 0; i < inputWords.length; i++) {
        if (!usedIndices.has(i) && inputWords[i] === correctWord) {
          correctCount++;
          usedIndices.add(i);
          break;
        }
      }
    }

    // Calculate accuracy based on correct words found
    const accuracy = (correctCount / correctWords.length) * 100;

    // Penalty for extra words (being too verbose)
    const extraWords = Math.max(0, inputWords.length - correctWords.length);
    const penalty = (extraWords / correctWords.length) * 10;

    return Math.round(Math.max(0, accuracy - penalty));
  };

  const handleSubmit = () => {
    if (!subtitles[currentIndex]) return;

    const acc = calculateAccuracy(subtitles[currentIndex].text, userInput);
    setAccuracy(acc);
    setIsRevealed(true);
  };

  const handleNext = () => {
    if (currentIndex < subtitles.length - 1) {
      stopPlaying();
      const nextIndex = currentIndex + 1;
      console.log(`[DEBUG] Moving to next: ${currentIndex} -> ${nextIndex}`);
      console.log(`[DEBUG] Next subtitle: "${subtitles[nextIndex]?.text}"`);
      setCurrentIndex(nextIndex);
      setUserInput("");
      setIsRevealed(false);
      setAccuracy(null);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      stopPlaying();
      const prevIndex = currentIndex - 1;
      console.log(`[DEBUG] Moving to previous: ${currentIndex} -> ${prevIndex}`);
      console.log(`[DEBUG] Previous subtitle: "${subtitles[prevIndex]?.text}"`);
      setCurrentIndex(prevIndex);
      setUserInput("");
      setIsRevealed(false);
      setAccuracy(null);
    }
  };

  const opts: YouTubeProps["opts"] = {
    height: "100%",
    width: "100%",
    playerVars: {
      autoplay: 0,
    },
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Loading subtitles...</div>
      </div>
    );
  }

  if (!videoId || subtitles.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">No subtitles found</h2>
          <a href="/" className="text-blue-600 hover:underline">
            Go back home
          </a>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-4 md:mb-6">
          <a href="/" className="text-blue-600 hover:underline text-sm md:text-base">
            ← Back to Home
          </a>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-4 md:p-8 mb-6">
          {/* Video Player - Responsive */}
          <div className="relative w-full mb-6" style={{ paddingTop: '56.25%' }}>
            <div className="absolute inset-0">
              <YouTube
                videoId={videoId}
                opts={opts}
                onReady={onPlayerReady}
                onStateChange={onPlayerStateChange}
                className="w-full h-full"
              />
            </div>
          </div>

          {/* Play/Stop Toggle */}
          <div className="flex justify-center mb-4 md:mb-6">
            <button
              onClick={togglePlayPause}
              className={`px-8 md:px-12 py-3 md:py-4 rounded-lg font-semibold text-sm md:text-base transition-colors ${
                isPlaying
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isPlaying ? '⏹️ 정지' : '▶️ 재생 (무한반복)'}
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mb-4 md:mb-6">
            <div className="text-sm md:text-base text-gray-900 font-semibold mb-2">
              자막 {currentIndex + 1} / {subtitles.length}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all"
                style={{
                  width: `${((currentIndex + 1) / subtitles.length) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* Input Area */}
          <div className="mb-4 md:mb-6">
            <label className="block text-lg md:text-xl font-bold mb-3 text-gray-900">
              듣고 입력하세요:
            </label>
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="여기에 입력..."
              className="w-full px-4 py-3 border-2 border-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none text-base md:text-lg text-gray-900 placeholder-gray-500"
              rows={4}
              disabled={isRevealed}
            />
          </div>

          {/* Answer Display */}
          {isRevealed && (
            <div className="mb-4 md:mb-6 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
              <div className="text-xs text-gray-700 font-mono mb-2 bg-gray-100 p-2 rounded">
                [디버그] 인덱스: {currentIndex} / 총: {subtitles.length}<br/>
                [디버그] 현재 자막: {currentSubtitle?.text?.substring(0, 30)}...
              </div>
              <div className="font-bold mb-2 text-base md:text-lg text-gray-900">정답:</div>
              <div className="text-lg md:text-xl mb-3 font-semibold text-gray-900">{currentSubtitle?.text || "자막 없음"}</div>
              {accuracy !== null && (
                <div className="text-xl md:text-2xl font-bold text-blue-700">
                  정확도: {accuracy}%
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 md:gap-4">
            {!isRevealed ? (
              <button
                onClick={handleSubmit}
                disabled={!userInput.trim()}
                className="flex-1 bg-green-600 text-white py-3 md:py-4 px-4 md:px-6 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm md:text-base"
              >
                ✅ 정답 확인
              </button>
            ) : (
              <>
                <button
                  onClick={handlePrevious}
                  disabled={currentIndex === 0}
                  className="flex-1 bg-gray-600 text-white py-3 md:py-4 px-4 md:px-6 rounded-lg font-semibold hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm md:text-base"
                >
                  ← 이전
                </button>
                <button
                  onClick={handleNext}
                  disabled={currentIndex === subtitles.length - 1}
                  className="flex-1 bg-blue-600 text-white py-3 md:py-4 px-4 md:px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm md:text-base"
                >
                  다음 →
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function Practice() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PracticeContent />
    </Suspense>
  );
}
