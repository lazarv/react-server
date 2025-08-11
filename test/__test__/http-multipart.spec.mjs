import { parseMultipartFormData } from "@lazarv/react-server/http";
import { describe, expect, it } from "vitest";

// Helper to build multipart body
function buildMultipart(parts, boundary) {
  let body = "";
  for (const p of parts) {
    body += `--${boundary}\r\n`;
    body += p.headers.join("\r\n") + "\r\n\r\n";
    body += p.body + "\r\n";
  }
  body += `--${boundary}--`;
  return body;
}

function encodeUtf8(str) {
  return new TextEncoder().encode(str);
}

// Byte-accurate helpers for advanced cases
function concatBytes(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function buildMultipartBytes(parts, boundary) {
  const enc = new TextEncoder();
  const chunks = [];
  for (const p of parts) {
    chunks.push(enc.encode(`--${boundary}\r\n`));
    chunks.push(enc.encode(p.headers.join("\r\n") + "\r\n\r\n"));
    if (p.bodyBytes) chunks.push(p.bodyBytes);
    else chunks.push(enc.encode(p.body ?? ""));
    chunks.push(enc.encode("\r\n"));
  }
  chunks.push(new TextEncoder().encode(`--${boundary}--`));
  return concatBytes(chunks);
}

function makeStreamRequestFromChunks(chunks, boundary, headers = {}) {
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  return new Request("http://localhost/upload", {
    method: "POST",
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      ...headers,
    },
    body: stream,
    duplex: "half",
  });
}

async function makeRequest(bodyString, boundary) {
  const body = encodeUtf8(bodyString);
  return new Request("http://localhost/upload", {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
}

describe("multipart parser RFC extensions", () => {
  it("parses simple fields and files with filename*", async () => {
    const boundary = "AaB03x";
    const parts = [
      {
        headers: [
          'Content-Disposition: form-data; name="text"',
          "Content-Type: text/plain; charset=utf-8",
        ],
        body: "árvíztűrő", // utf-8
      },
      {
        headers: [
          "Content-Disposition: form-data; name=\"file\"; filename*=utf-8''f%C3%A1jl.txt",
          "Content-Type: application/octet-stream",
        ],
        body: "FILEDATA",
      },
    ];
    const req = await makeRequest(buildMultipart(parts, boundary), boundary);
    const form = await parseMultipartFormData(req);
    expect(form.get("text")).toBe("árvíztűrő");
    const file = form.get("file");
    expect(file instanceof File || file instanceof Blob).toBe(true);
    expect(file.name).toBe("fájl.txt");
    const text = await file.text();
    expect(text).toBe("FILEDATA");
  });

  it("handles nested multipart", async () => {
    const outerBoundary = "OuterB";
    const innerBoundary = "InnerB";
    const innerParts = [
      {
        headers: ['Content-Disposition: form-data; name="inner1"'],
        body: "value1",
      },
      {
        headers: ['Content-Disposition: form-data; name="inner2"'],
        body: "value2",
      },
    ];
    const innerBody = buildMultipart(innerParts, innerBoundary);
    const outerParts = [
      {
        headers: [
          'Content-Disposition: form-data; name="nest"',
          `Content-Type: multipart/mixed; boundary=${innerBoundary}`,
        ],
        body: innerBody + "\r\n", // ensure final CRLF
      },
      {
        headers: ['Content-Disposition: form-data; name="plain"'],
        body: "ok",
      },
    ];
    const req = await makeRequest(
      buildMultipart(outerParts, outerBoundary),
      outerBoundary
    );
    const form = await parseMultipartFormData(req);
    // Nested parts appended with their own names
    expect(form.get("inner1")).toBe("value1");
    expect(form.get("inner2")).toBe("value2");
    expect(form.get("plain")).toBe("ok");
  });

  it("streams file via handleFile", async () => {
    const boundary = "StreamB";
    const large = "x".repeat(1024 * 32);
    const parts = [
      {
        headers: [
          'Content-Disposition: form-data; name="file"; filename="big.txt"',
          "Content-Type: text/plain; charset=utf-8",
        ],
        body: large,
      },
    ];
    const req = await makeRequest(buildMultipart(parts, boundary), boundary);
    let received = 0;
    const chunks = [];
    await parseMultipartFormData(req, {
      handleFile: async ({ stream, filename }) => {
        expect(filename).toBe("big.txt");
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.length;
          chunks.push(value);
        }
      },
    });
    expect(received).toBe(large.length);
    const merged = new TextDecoder().decode(
      new Uint8Array(chunks.reduce((a, c) => a.concat([...c]), []))
    );
    expect(merged).toBe(large);
  });
});

describe("multipart parser additional coverage", () => {
  it("decodes RFC5987 name* for field name", async () => {
    const boundary = "NStar";
    const parts = [
      {
        headers: [
          "Content-Disposition: form-data; name*=utf-8''n%C3%A1me",
          "Content-Type: text/plain; charset=utf-8",
        ],
        body: "hello",
      },
    ];
    const req = await makeRequest(buildMultipart(parts, boundary), boundary);
    const form = await parseMultipartFormData(req);
    expect(form.get("náme")).toBe("hello");
  });

  it("prefers filename over filename* when both are present", async () => {
    const boundary = "FilePref";
    const parts = [
      {
        headers: [
          'Content-Disposition: form-data; name="f"; filename="plain.txt"; filename*=utf-8\'\'fancy.txt',
          "Content-Type: application/octet-stream",
        ],
        body: "X",
      },
    ];
    const req = await makeRequest(buildMultipart(parts, boundary), boundary);
    const form = await parseMultipartFormData(req);
    const file = form.get("f");
    expect(file.name).toBe("plain.txt");
    expect(await file.text()).toBe("X");
  });

  it("collects multiple values for the same field name", async () => {
    const boundary = "MultiVal";
    const parts = [
      {
        headers: ['Content-Disposition: form-data; name="hobby"'],
        body: "swim",
      },
      {
        headers: ['Content-Disposition: form-data; name="hobby"'],
        body: "code",
      },
      {
        headers: ['Content-Disposition: form-data; name="hobby"'],
        body: "read",
      },
    ];
    const req = await makeRequest(buildMultipart(parts, boundary), boundary);
    const form = await parseMultipartFormData(req);
    const all = form.getAll("hobby");
    expect(all.length).toBe(3);
    expect(all).toContain("code");
  });

  it("parses with case-insensitive headers", async () => {
    const boundary = "HdrCase";
    const parts = [
      {
        headers: [
          'cOnTeNt-DisPosItIoN: form-data; name="text"',
          "CONTENT-TYPE: text/plain",
        ],
        body: "ok",
      },
    ];
    const req = await makeRequest(buildMultipart(parts, boundary), boundary);
    const form = await parseMultipartFormData(req);
    expect(form.get("text")).toBe("ok");
  });

  it("returns empty FormData when boundary is missing", async () => {
    const body = "garbage";
    const req = new Request("http://localhost/upload", {
      method: "POST",
      headers: { "content-type": "multipart/form-data" }, // no boundary
      body: encodeUtf8(body),
    });
    const form = await parseMultipartFormData(req);
    expect([...form.entries()].length).toBe(0);
  });

  it("returns empty FormData when no body present", async () => {
    const req = new Request("http://localhost/upload", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=NoBody" },
    });
    const form = await parseMultipartFormData(req);
    expect([...form.keys()].length).toBe(0);
  });

  it("handles a boundary split across chunks in the stream", async () => {
    const boundary = "ChunkB";
    const parts = [
      {
        headers: ['Content-Disposition: form-data; name="a"'],
        body: "1",
      },
      {
        headers: [
          'Content-Disposition: form-data; name="file"; filename="b.txt"',
          "Content-Type: text/plain",
        ],
        body: "2222",
      },
    ];
    const full = buildMultipartBytes(parts, boundary);
    const bline = new TextEncoder().encode("\r\n--" + boundary);
    // find the first boundary AFTER the initial start
    function indexOfSeq(hay, needle, from = 0) {
      outer: for (let i = from; i <= hay.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++)
          if (hay[i + j] !== needle[j]) continue outer;
        return i;
      }
      return -1;
    }
    const first = indexOfSeq(full, bline, 2); // skip the starting "--"
    // Split so the boundary bytes are cut in the middle across chunks
    const split1 = first + 2;
    const split2 = first + bline.length - 1;
    const chunks = [
      full.slice(0, split1),
      full.slice(split1, split2),
      full.slice(split2),
    ];
    const req = makeStreamRequestFromChunks(chunks, boundary);
    const form = await parseMultipartFormData(req);
    expect(form.get("a")).toBe("1");
    const file = form.get("file");
    expect(file.name).toBe("b.txt");
    expect(await file.text()).toBe("2222");
  });

  it("handles nested multipart containing a file (appends Blob and calls handleFile)", async () => {
    const outer = "OutNest";
    const inner = "InNest";
    const innerParts = [
      {
        headers: [
          'Content-Disposition: form-data; name="nf"; filename="n.txt"',
          "Content-Type: text/plain; charset=utf-8",
        ],
        body: "nested",
      },
    ];
    const innerBody = buildMultipart(innerParts, inner);
    const outerParts = [
      {
        headers: [
          'Content-Disposition: form-data; name="nest"',
          `Content-Type: multipart/mixed; boundary=${inner}`,
        ],
        body: innerBody + "\r\n",
      },
    ];
    const req = await makeRequest(buildMultipart(outerParts, outer), outer);
    const calls = [];
    const form = await parseMultipartFormData(req, {
      handleFile: async (info) => calls.push(info),
    });
    const file = form.get("nf");
    expect(file.name).toBe("n.txt");
    expect(await file.text()).toBe("nested");
    // handleFile called with nested file data
    expect(calls.length).toBe(1);
    expect(calls[0].filename).toBe("n.txt");
    expect(new TextDecoder().decode(calls[0].data)).toBe("nested");
  });
});
