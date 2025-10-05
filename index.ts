import express, { Request, Response } from 'express';
import { Innertube } from 'youtubei.js';

// Define interfaces for better type safety (same as before)
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

// Interface for a more generic segment if not matching TSR or CGR
interface GenericSegment {
  text?: string | Snippet;
  runs?: TextRun[];
  snippet?: Snippet;
  start_ms?: string;
  end_ms?: string;
  duration_ms?: string;
}

// A union type for the possible segment structures
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

const app = express();

// Middleware para parsear JSON
app.use(express.json());

// Endpoint principal
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
    console.log(`Fetching transcript for video ID: ${videoId}`);

    const youtube = await Innertube.create();

    const info = await youtube.getInfo(videoId);
    console.log(info);
    const videoTitle = info.basic_info?.title || 'Untitled Video';
    const transcriptData = await info.getTranscript();

    if (!transcriptData || !transcriptData.transcript || !transcriptData.transcript.content || 
        !transcriptData.transcript.content.body || !transcriptData.transcript.content.body.initial_segments) {
      return res.status(404).json({ videoTitle, error: "No transcript available for this video." });
    }

    const segments = transcriptData.transcript.content.body.initial_segments || [];
    const formattedTranscript = segments.map((segment: AnySegment) => {
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
        offset = 0;
        duration = 0;
        // segment here is narrowed to GenericSegment or the parts of AnySegment not caught above
        const genericSegment = segment as GenericSegment;
        if (genericSegment.start_ms && typeof genericSegment.start_ms === 'string') {
          offset = parseFloat(genericSegment.start_ms) / 1000;
        }
        if (genericSegment.duration_ms && typeof genericSegment.duration_ms === 'string') {
          duration = parseFloat(genericSegment.duration_ms) / 1000;
        } else if (genericSegment.end_ms && typeof genericSegment.end_ms === 'string' && 
                   genericSegment.start_ms && typeof genericSegment.start_ms === 'string') {
          duration = (parseFloat(genericSegment.end_ms) - parseFloat(genericSegment.start_ms)) / 1000;
        }
      }
      return { text, offset, duration };
    }).filter((s: { text: string; offset: number; duration: number }) => s.text);

    return res.json({ videoTitle: decodeHtmlEntities(videoTitle), transcript: formattedTranscript });

  } catch (error: unknown) {
    const err = error as Error;
    console.error(`Error fetching transcript for ${videoId}:`, err.message, err.stack);
    let errorMessage = "Failed to fetch transcript.";
    let statusCode = 500;

    if (err instanceof SyntaxError && err.message.includes("JSON")) {
      errorMessage = "Failed to process data from YouTube. The API response may be malformed or incomplete.";
    } else if (err.message.includes('private') || err.message.includes('unavailable') || err.message.includes('premiere') || err.message.includes('live')) {
      errorMessage = "Video is private, unavailable, a live stream, or a premiere without a processed transcript.";
      statusCode = 403;
    } else if (err.message.includes(' অঞ্চলের কারণে') || err.message.includes('region-locked')) { // Example for region-locked, may need adjustment
      errorMessage = "The video is region-locked and unavailable.";
      statusCode = 451; // Unavailable For Legal Reasons
    } else if (err.message.includes('Transcripts are not available for this video')) {
        errorMessage = "Transcripts are not available for this video.";
        statusCode = 404;
    }
    
    return res.status(statusCode).json({ error: errorMessage, videoId });
  }
});

// Puerto por defecto o desde variable de entorno
const PORT = process.env.PORT || 3000;

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`YouTube Transcript API server running on port ${PORT}`);
});

export default app;
