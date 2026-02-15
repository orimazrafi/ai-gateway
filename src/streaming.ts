import type { Response } from "express";

/**
 * Proxy streaming response: pipe upstream response to client with same headers.
 */
export function pipeStream(
  upstreamRes: { body: NodeJS.ReadableStream | ReadableStream<Uint8Array> | null; headers: { get(name: string): string | null }; status: number },
  res: Response
): void {
  res.status(upstreamRes.status);
  const contentType = upstreamRes.headers.get("content-type");
  if (contentType) res.setHeader("Content-Type", contentType);
  if (!upstreamRes.body) {
    res.end();
    return;
  }
  const body = upstreamRes.body;
  if (typeof (body as NodeJS.ReadableStream).pipe === "function") {
    (body as NodeJS.ReadableStream).pipe(res as unknown as NodeJS.WritableStream);
  } else {
    const reader = (body as unknown as ReadableStream<Uint8Array>).getReader();
    function pump(): Promise<void> {
      return reader.read().then(({ done, value }) => {
        if (done) {
          res.end();
          return;
        }
        res.write(Buffer.from(value));
        return pump();
      });
    }
    pump().catch((err) => {
      if (!res.writableEnded) res.destroy(err as Error);
    });
  }
}
