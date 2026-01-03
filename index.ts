import express from 'express';
import type { Request, Response } from 'express';
import { Innertube } from 'youtubei.js';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
// @ts-ignore
import nodeWebVtt from 'node-webvtt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execPromise = util.promisify(exec);

// Define interfaces for better type safety
interface TextRun {
  text: string;
}

interface Snippet {
  text?: string;
  runs?: TextRun[];
}

interface TranscriptSegmentRenderer {
  snippet?: Snippet;
  text?: string;
  runs?: TextRun[];
  start_ms?: string;
  end_ms?: string;
}

interface CueRenderer {
  cue_renderer?: {
    text?: Snippet;
    start_offset_ms?: string;
    duration_ms?: string;
  };
}

interface CueGroupRenderer {
  cue_group_renderer?: {
    cues?: CueRenderer[];
  };
}

interface GenericSegment {
  text?: string | Snippet;
  runs?: TextRun[];
  snippet?: Snippet;
  start_ms?: string;
  end_ms?: string;
  duration_ms?: string;
}

type AnySegment = TranscriptSegmentRenderer | CueGroupRenderer | GenericSegment;

// Helper function to decode HTML entities
const decodeHtmlEntities = (text: string | undefined | null): string => {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
};

// Helper function to extract text from different transcript segment formats
const extractTextFromSegment = (segment: AnySegment): string => {
  if (segment && 'transcript_segment_renderer' in segment && segment.transcript_segment_renderer) {
    const tsr = segment.transcript_segment_renderer as TranscriptSegmentRenderer;
    if (tsr.snippet?.text) return tsr.snippet.text;
    if (tsr.text) return tsr.text;
    if (tsr.snippet?.runs) return tsr.snippet.runs.map(run => run.text).join('');
    if (tsr.runs) return tsr.runs.map(run => run.text).join('');
  }
  if (segment && 'cue_group_renderer' in segment && segment.cue_group_renderer?.cues?.[0]?.cue_renderer) {
    const cue = segment.cue_group_renderer.cues[0].cue_renderer;
    if (cue.text?.text) return cue.text.text;
    if (cue.text?.runs) return cue.text.runs.map(run => run.text).join('');
  }
  if (segment && 'text' in segment && segment.text) {
    if (typeof segment.text === 'string') return segment.text;
    if (typeof segment.text === 'object') {
      const snippet = segment.text as Snippet;
      if (snippet.text) return snippet.text;
      if (snippet.runs) return snippet.runs.map(run => run.text).join('');
    }
  }
  if (segment && 'runs' in segment && Array.isArray(segment.runs)) {
    return (segment.runs as TextRun[]).map(run => run.text).join('');
  }
  if (segment && 'snippet' in segment && segment.snippet) {
    const snippet = segment.snippet as Snippet;
    if (snippet.text) return snippet.text;
    if (snippet.runs) return snippet.runs.map(run => run.text).join('');
  }
  return '';
};

// Helper function to extract video ID from YouTube URL
const extractVideoId = (urlOrId: string): string | null => {
  if (!urlOrId) return null;
  if (urlOrId.length === 11 && !urlOrId.includes('/') && !urlOrId.includes('?')) {
    return urlOrId;
  }
  try {
    const url = new URL(urlOrId);
    if (url.hostname === 'youtu.be') {
      return url.pathname.substring(1);
    }
    if (url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com') {
      if (url.pathname === '/watch') {
        return url.searchParams.get('v');
      }
      if (url.pathname.startsWith('/embed/')) {
        return url.pathname.substring('/embed/'.length);
      }
      if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.substring('/shorts/'.length);
      }
    }
  } catch (e) {
    console.error("Invalid URL or ID format attempting to parse:", urlOrId, e);
  }
  return null;
};

// Function to fetch transcript using yt-dlp
async function fetchTranscriptWithYtDlp(videoId: string): Promise<any[]> {
    const tempDir = path.join(__dirname, 'temp_transcripts');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    
    // Unique ID to avoid collisions
    const uniqueId = Math.random().toString(36).substring(7);
    const outputPath = path.join(tempDir, `${videoId}_${uniqueId}`);
    
    // Array of common User-Agents for rotation to avoid bot detection
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    // Select a random User-Agent
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

    // yt-dlp command: download subs (manual or auto), skip video, use specific user agent
    const command = `yt-dlp --write-auto-sub --write-sub --sub-lang en --skip-download --output "${outputPath}" --no-warnings --user-agent "${userAgent}" https://www.youtube.com/watch?v=${videoId}`;
    
    console.log(`Executing yt-dlp for ${videoId} with User-Agent: ${userAgent}...`);
    try {
        await execPromise(command);
    } catch (error) {
        console.error('yt-dlp execution failed:', error);
        throw error;
    }

    const generatedFiles = fs.readdirSync(tempDir);
    const vttFile = generatedFiles.find(f => f.startsWith(`${videoId}_${uniqueId}`) && f.endsWith('.vtt'));

    if (!vttFile) {
        throw new Error('No transcript found (yt-dlp)');
    }

    const vttPath = path.join(tempDir, vttFile);
    const vttContent = fs.readFileSync(vttPath, 'utf-8');
    
    // Cleanup
    try {
        fs.unlinkSync(vttPath);
    } catch (e) {
        console.error('Error deleting temp file:', e);
    }

    const parsed = nodeWebVtt.parse(vttContent, { meta: true });
    
    if (parsed && parsed.cues) {
        return parsed.cues.map((cue: any) => ({
            text: cue.text,
            offset: cue.start,
            duration: cue.end - cue.start
        }));
    }
    
    return [];
}

const app = express();

app.use(express.json());

app.get('/', async (req: Request, res: Response) => {
  const videoUrlOrId = req.query.id as string;

  if (!videoUrlOrId) {
    return res.status(400).json({ error: "Video ID or URL is required (query param: 'id')" });
  }

  const videoId = extractVideoId(videoUrlOrId);

  if (!videoId) {
    return res.status(400).json({ error: "Invalid YouTube Video ID or URL format" });
  }

  try {
    console.log(`Fetching info for video ID: ${videoId}`);
    
    let videoTitle = 'Untitled Video';
    let formattedTranscript: any[] = [];
    
    // Try to get info first using Innertube (faster for metadata)
    try {
        const youtube = await Innertube.create();
        const info = await youtube.getInfo(videoId);
        videoTitle = info.basic_info?.title || 'Untitled Video';
        
        // Try to get transcript with Innertube first
        console.log('Attempting to fetch transcript with youtubei.js...');
        const transcriptData = await info.getTranscript();
        
        if (transcriptData && transcriptData.transcript && transcriptData.transcript.content && 
            transcriptData.transcript.content.body && transcriptData.transcript.content.body.initial_segments) {
            
            const segments = transcriptData.transcript.content.body.initial_segments;
            formattedTranscript = segments.map((segment: AnySegment) => {
              let text = '';
              let offset = 0;
              let duration = 0;
        
              if (segment && 'transcript_segment_renderer' in segment && segment.transcript_segment_renderer) {
                const tsr = segment.transcript_segment_renderer as TranscriptSegmentRenderer;
                text = decodeHtmlEntities(extractTextFromSegment(tsr));
                offset = parseFloat(tsr.start_ms || '0') / 1000;
                duration = (parseFloat(tsr.end_ms || '0') - parseFloat(tsr.start_ms || '0')) / 1000;
              } else if (segment && 'cue_group_renderer' in segment && segment.cue_group_renderer?.cues?.[0]?.cue_renderer) {
                const cue = segment.cue_group_renderer.cues[0].cue_renderer;
                text = decodeHtmlEntities(extractTextFromSegment(cue));
                offset = parseFloat(cue.start_offset_ms || '0') / 1000;
                duration = parseFloat(cue.duration_ms || '0') / 1000;
              } else {
                text = decodeHtmlEntities(extractTextFromSegment(segment));
                // Try to extract timing if available in GenericSegment
                const genericSegment = segment as GenericSegment;
                 if (genericSegment.start_ms) offset = parseFloat(genericSegment.start_ms) / 1000;
                 if (genericSegment.end_ms && genericSegment.start_ms) duration = (parseFloat(genericSegment.end_ms) - parseFloat(genericSegment.start_ms)) / 1000;
              }
              return { text, offset, duration };
            }).filter((s: { text: string; offset: number; duration: number }) => s.text);
        }
    } catch (innertubeError) {
        console.warn('Innertube failed (metadata or transcript), falling back to yt-dlp:', innertubeError);
        // If metadata failed, we might still want to try yt-dlp, but we won't have the title easily unless we parse it from yt-dlp too.
        // For now, let's proceed to yt-dlp fallback.
    }

    // If transcript is empty, try yt-dlp
    if (formattedTranscript.length === 0) {
        console.log('Falling back to yt-dlp for transcript...');
        try {
            formattedTranscript = await fetchTranscriptWithYtDlp(videoId);
            console.log(`Fetched ${formattedTranscript.length} lines with yt-dlp`);
        } catch (ytdlpError) {
            console.error('yt-dlp fallback also failed:', ytdlpError);
            throw new Error('Failed to fetch transcript from both sources.');
        }
    }

    if (formattedTranscript.length === 0) {
         return res.status(404).json({ videoTitle, error: "No transcript available for this video." });
    }

    return res.json({ videoTitle: decodeHtmlEntities(videoTitle), transcript: formattedTranscript });

  } catch (error: unknown) {
    const err = error as Error;
    console.error(`Error fetching transcript for ${videoId}:`, err.message);
    let errorMessage = "Failed to fetch transcript.";
    let statusCode = 500;

    if (err.message.includes('No transcript found')) {
        errorMessage = "Transcripts are not available for this video.";
        statusCode = 404;
    }
    
    return res.status(statusCode).json({ error: errorMessage, videoId });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`YouTube Transcript API server running on port ${PORT}`);
});

export default app;
