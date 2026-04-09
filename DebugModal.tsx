/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSessionStore } from './lib/state';
import Modal from './Modal';
import { useUI } from './lib/state';
import React, { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { encodeWAV, getAudioDuration } from './lib/utils';

// Retrieve the API key from the environment.
const API_KEY =
  typeof process !== 'undefined' && process.env
    ? (process.env.API_KEY as string)
    : undefined;

/**
 * Formats a number of bytes into a human-readable string (e.g., "1.2 KB").
 * This is used to display memory usage and file sizes in a user-friendly way.
 */
function formatBytes(bytes: number, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * DebugModal Component (Session Info)
 *
 * This component provides a detailed view of the current learning session.
 * It allows users to view a word-for-word transcript, generate a summary of the lesson,
 * and listen to or download audio recordings of the conversation.
 */
export default function DebugModal() {
  // Access session data (transcript and audio logs) from the global store.
  const { transcript, audioLog } = useSessionStore();

  // Access UI state to control modal visibility and track teacher edits.
  const {
    setShowDebugModal,
    changeCount,
  } = useUI();

  // Local state for tab management and memory tracking.
  const [activeTab, setActiveTab] = useState('transcript');
  const [memoryUsage, setMemoryUsage] = useState<number | null>(null);

  // State for the AI-generated summary feature.
  const [correctedTranscript, setCorrectedTranscript] = useState('');
  const [isCorrectingTranscript, setIsCorrectingTranscript] = useState(false);

  // State for managing audio playback within the audio log tab.
  const [playingAudio, setPlayingAudio] = useState<{
    index: number;
    element: HTMLAudioElement;
    url: string;
  } | null>(null);

  /**
   * Effect: Memory Usage Polling
   * Periodically checks the browser's memory usage (if supported) to display in the header.
   */
  useEffect(() => {
    const memory = (performance as any).memory;
    if (!memory) return;
    const interval = setInterval(() => {
      setMemoryUsage(memory.usedJSHeapSize);
    }, 1000);
    setMemoryUsage(memory.usedJSHeapSize);
    return () => clearInterval(interval);
  }, []);

  /**
   * Generates a concise summary of the lesson transcript using the Gemini API.
   * This function sends the full transcript to the model and processes the Markdown response.
   */
  const handleGetMinutes = async () => {
    if (!API_KEY) return;
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    setIsCorrectingTranscript(true);
    setCorrectedTranscript('Generating summary...');
    const model = 'gemini-2.5-flash';
    const TIMEOUT_SECONDS = 20;
    try {
      const fullTranscript = transcript
        .map(t => `${t.speaker}: ${t.text}`)
        .join('\n');
      const prompt = `Please summarize the following lesson transcript into clear, concise minutes using Markdown. \n\nTranscript:\n\n${fullTranscript}`;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`The model call to ${model} has timed out after ${TIMEOUT_SECONDS} seconds.`)),
          TIMEOUT_SECONDS * 1000
        )
      );
      const response = await Promise.race([
        ai.models.generateContent({ model, contents: prompt }),
        timeoutPromise,
      ]);
      const corrected = (response as GenerateContentResponse).text;
      setCorrectedTranscript(corrected ?? 'Summary generation returned an empty response.');
    } catch (error: any) {
      console.error('Error generating summary:', error);
      setCorrectedTranscript(`Sorry, an error occurred while generating the summary: ${error.message}`);
    } finally {
      setIsCorrectingTranscript(false);
    }
  };

  /**
   * Toggles playback for a specific audio clip in the audio log.
   */
  const toggleAudioPlayback = (index: number, blob: Blob) => {
    if (playingAudio && playingAudio.index === index) {
      playingAudio.element.pause();
      URL.revokeObjectURL(playingAudio.url);
      setPlayingAudio(null);
    } else {
      if (playingAudio) {
        playingAudio.element.pause();
        URL.revokeObjectURL(playingAudio.url);
      }
      const url = URL.createObjectURL(encodeWAV(blob as any, 24000));
      const audio = new Audio(url);
      audio.onended = () => setPlayingAudio(null);
      audio.play();
      setPlayingAudio({ index, element: audio, url });
    }
  };

  /**
   * Combines all recorded audio clips into a single WAV file and triggers a download.
   */
  const handleSaveAudioLog = async () => {
    const blobs = audioLog.map(entry => entry.blob);
    const combinedBlob = new Blob(blobs);
    const arrayBuffer = await combinedBlob.arrayBuffer();
    const wavBlob = encodeWAV(arrayBuffer, 24000);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intute_audio_log_${new Date().toISOString()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Modal onClose={() => setShowDebugModal(false)} className="debug-modal-container">
      {/* Header: Title and Session Statistics */}
      <div className="debug-modal-header">
        <h2>Session Info</h2>
        {memoryUsage !== null && (
          <span><strong>Memory:</strong> {formatBytes(memoryUsage)}</span>
        )}
        {changeCount > 0 && (
          <span><strong>Teacher Edits:</strong> {changeCount}</span>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="debug-modal-tabs">
        <button onClick={() => setActiveTab('transcript')} className={activeTab === 'transcript' ? 'active' : ''}>Transcript</button>
        <button onClick={() => setActiveTab('minutes')} className={activeTab === 'minutes' ? 'active' : ''}>Summary</button>
        <button onClick={() => setActiveTab('audiolog')} className={activeTab === 'audiolog' ? 'active' : ''}>Audio Log</button>
      </div>

      {/* Tab Content: Transcript View */}
      {activeTab === 'transcript' && (
        <div className="debug-modal-content">
          {transcript.length > 0 ? (
            transcript.map((entry, index) => (
              <p key={index}><strong>{entry.speaker}:</strong> {entry.text}</p>
            ))
          ) : (
            <p>No conversation yet.</p>
          )}
        </div>
      )}

      {/* Tab Content: Summary Generation View */}
      {activeTab === 'minutes' && (
        <div className="debug-modal-content">
          <button onClick={handleGetMinutes} disabled={isCorrectingTranscript}>
            {isCorrectingTranscript ? 'Generating...' : 'Generate Summary'}
          </button>
          {correctedTranscript ? (
            <div dangerouslySetInnerHTML={{ __html: marked(correctedTranscript) as string }} />
          ) : (
            <p>Click generate to see a summary of the session.</p>
          )}
        </div>
      )}

      {/* Tab Content: Audio Log and Playback View */}
      {activeTab === 'audiolog' && (
        <div className="debug-modal-content">
          <button onClick={handleSaveAudioLog}>Download Complete Audio (WAV)</button>
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Speaker</th>
                <th>Duration</th>
                <th>Playback</th>
              </tr>
            </thead>
            <tbody>
              {audioLog.length > 0 ? (
                audioLog.map((entry, index) => (
                  <tr key={index}>
                    <td>{entry.timestamp.toLocaleTimeString()}</td>
                    <td>{entry.speaker}</td>
                    <td>{getAudioDuration(entry.blob)}</td>
                    <td>
                      <button
                        onClick={() => toggleAudioPlayback(index, entry.blob)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--theme-accent)' }}
                      >
                        <span className="material-symbols-outlined">
                          {playingAudio?.index === index ? 'pause_circle' : 'play_circle'}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={4}>No audio recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
