# YouTube Transcript API - Cloudflare Worker with Hono

This project provides a Cloudflare Worker API endpoint to fetch YouTube video transcripts.
It uses `youtubei.js` to interact with YouTube's internal API and Hono as the routing framework.

## Prerequisites

*   [Node.js](https://nodejs.org/) (v18 or later recommended)
*   [npm](https://www.npmjs.com/) (or yarn/pnpm)
*   A [Cloudflare account](https://dash.cloudflare.com/sign-up)
*   [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed and configured (you can also use the version installed by npm/yarn from the project dependencies).

## Setup & Installation

1.  **Clone the repository (if you haven't already):**
    ```bash
    git clone <your-repo-url>
    cd youtube-transcript-api
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```
    (or `yarn install` or `pnpm install`)

## Development

To run the worker locally for development, use the following command:

```bash
npm run dev
```

This will start a local server, typically on `http://localhost:8787`. Wrangler will output the exact URL.

## API Endpoint

*   **GET /**
    *   Fetches the transcript for a given YouTube video ID or URL.
    *   **Query Parameter:** `id` (required) - The YouTube video ID (e.g., `dQw4w9WgXcQ`) or full YouTube URL (e.g., `https://www.youtube.com/watch?v=dQw4w9WgXcQ`).
    *   **Success Response (200 OK):**
        ```json
        {
          "videoTitle": "Video Title Here",
          "transcript": [
            {
              "text": "Hello and welcome...",
              "offset": 0.5,
              "duration": 3.2
            },
            {
              "text": "In today's video...",
              "offset": 3.7,
              "duration": 2.8
            }
            // ... more segments
          ]
        }
        ```
    *   **Error Responses:**
        *   `400 Bad Request`: If the `id` query parameter is missing or invalid.
        *   `404 Not Found`: If no transcript is available for the video.
        *   `500 Internal Server Error`: For other server-side issues (e.g., problems fetching from YouTube, JSON parsing errors).

**Example Usage (with `wrangler dev` running):**

```
http://localhost:8787/?id=dQw4w9WgXcQ
```

Or using a video URL:
```
http://localhost:8787/?id=https://www.youtube.com/watch?v=o_XVt5rdpFY
```

## Deployment

To deploy the worker to your Cloudflare account:

1.  Ensure you have logged in with Wrangler (`wrangler login`).
2.  Run the deploy command:
    ```bash
    npm run deploy
    ```

Wrangler will build and deploy your worker. After deployment, it will output the URL for your live worker.

## Environment Variables & Bindings

If you need to add environment variables or bind services (like KV, R2, D1), you can configure them in the `wrangler.toml` file.

## Generating Types for Cloudflare Services

If you add bindings (KV, Durable Objects, etc.) to `wrangler.toml`, you can generate corresponding TypeScript types by running:

```bash
npm run cf-typegen
```
This helps with type safety when interacting with Cloudflare resources.

## Support by using our product!

We also build tools to help you get the most out of YouTube videos:

1.  **[YoutubeVideoTranscripts.com](https://www.youtubevideotranscripts.com)**: A website to get the transcript of any YouTube video for free. Watch the video while reading the transcript, search within the transcript, and download it for offline use.

2.  **[Youtube Transcript Plus (Chrome Extension)](https://chromewebstore.google.com/detail/youtube-transcript-plus-f/jgknojamnnggedclhogojdkonoholnpa?hl=en)**: Enhance your YouTube experience directly in your browser. This Chrome Extension provides a full transcript reading experience while watching, allows you to chat with the video using AI, and can generate chapter summaries using AI. A must-have for serious study on YouTube.
