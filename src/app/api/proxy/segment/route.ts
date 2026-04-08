/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const source = searchParams.get('moontv-source');
  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  const config = await getConfig();
  const liveSource = config.LiveConfig?.find((s: any) => s.key === source);
  if (!liveSource) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }
  const ua = liveSource.ua || 'AptvPlayer/1.4.10';

  let response: Response | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  try {
    const decodedUrl = decodeURIComponent(url);
    response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': ua,
      },
    });
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch segment' }, { status: 500 });
    }

    const headers = new Headers();
    headers.set('Content-Type', response.headers.get('Content-Type') || 'video/mp2t');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Range, Origin, Accept');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    // 使用流式传输，避免占用内存
    const stream = new ReadableStream({
      start(controller) {
        if (!response?.body) {
          controller.close();
          return;
        }

        reader = response.body.getReader();
        let isCancelled = false;

        function pump() {
          if (isCancelled || !reader) {
            cleanup();
            return;
          }

          reader.read().then(({ done, value }) => {
            if (isCancelled) {
              cleanup();
              return;
            }

            if (done) {
              try { controller.close(); } catch (e) { /* already closed */ }
              cleanup();
              return;
            }

            try {
              controller.enqueue(value);
            } catch (e) {
              cleanup();
              return;
            }
            pump();
          }).catch(() => {
            if (!isCancelled) {
              try { controller.close(); } catch (e) { /* already closed */ }
              cleanup();
            }
          });
        }

        function cleanup() {
          isCancelled = true;
          if (reader) {
            try {
              reader.cancel().catch(() => { /* ignore */ });
              reader.releaseLock();
            } catch (e) {
              // reader 可能已经被释放，忽略错误
            }
            reader = null;
          }
        }

        pump();
      },
      cancel() {
        // 当流被取消时（客户端断开），确保释放所有资源
        if (reader) {
          try {
            reader.cancel().catch(() => { /* ignore */ });
            reader.releaseLock();
          } catch (e) {
            // reader 可能已经被释放，忽略错误
          }
          reader = null;
        }

        if (response?.body) {
          try {
            response.body.cancel();
          } catch (e) {
            // 忽略取消时的错误
          }
        }
      }
    });

    return new Response(stream, { headers });
  } catch (error) {
    // 确保在错误情况下也释放资源
    if (reader) {
      try {
        (reader as ReadableStreamDefaultReader<Uint8Array>).releaseLock();
      } catch (e) {
        // 忽略错误
      }
    }

    if (response?.body) {
      try {
        response.body.cancel();
      } catch (e) {
        // 忽略错误
      }
    }

    return NextResponse.json({ error: 'Failed to fetch segment' }, { status: 500 });
  }
}