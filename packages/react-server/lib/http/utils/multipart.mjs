export async function parseMultipartFormData(
  request,
  { handleFile, fileMemoryLimit = 5 * 1024 * 1024 } = {}
) {
  const contentType = request.headers.get("content-type") || "";
  const match = contentType.match(/boundary=(?:"?)([^";]+)(?:"?)/i);
  if (!match) return new FormData();

  const boundary = match[1];
  const boundaryBytes = encoder.encode("--" + boundary);
  const boundaryLineBytes = encoder.encode("\r\n--" + boundary);
  const finalBoundaryLineBytes = encoder.encode("\r\n--" + boundary + "--");

  const form = new FormData();
  const reader = request.body?.getReader();
  if (!reader) return form; // no body

  let buffer = new Uint8Array(0);
  let inPart = false;
  let headersParsed = false;
  let partHeadersText = "";
  let partInfo = null;
  let fileChunks = [];
  let fileSize = 0;
  let fileStreamController = null;
  let streamingDispatched = false;

  function concat(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  function indexOfSeq(src, seq, from = 0) {
    outer: for (let i = from; i <= src.length - seq.length; i++) {
      for (let j = 0; j < seq.length; j++) {
        if (src[i + j] !== seq[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  async function finalizeFile() {
    if (!partInfo || !partInfo.filename) return;
    if (fileStreamController) fileStreamController.close();
    if (!streamingDispatched) {
      const data = combineChunks(fileChunks);
      if (handleFile) {
        await handleFile({
          name: partInfo.name,
          filename: partInfo.filename,
          type: partInfo.type,
          data,
        });
      }
      form.append(
        partInfo.name,
        new Blob([data], { type: partInfo.type }),
        partInfo.filename
      );
    }
    fileChunks = [];
    fileSize = 0;
    partInfo = null;
    headersParsed = false;
  }

  function combineChunks(chunks) {
    if (chunks.length === 1) return chunks[0];
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }

  function parseHeaders(txt) {
    const lines = txt.split(/\r?\n/).filter(Boolean);
    const out = {};
    for (const l of lines) {
      const i = l.indexOf(":");
      if (i !== -1)
        out[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
    }
    return out;
  }

  async function processField(valueBytes) {
    let value;
    if (partInfo?.charset) {
      try {
        value = new TextDecoder(partInfo.charset).decode(valueBytes);
      } catch {
        value = decoder.decode(valueBytes);
      }
    } else {
      value = decoder.decode(valueBytes);
    }
    if (!partInfo) return;
    form.append(partInfo.name, value);
    partInfo = null;
    headersParsed = false;
  }

  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer = concat(buffer, value);
    if (done) {
      break;
    }

    if (!inPart) {
      const idxStart = indexOfSeq(buffer, boundaryBytes, 0);
      if (idxStart === 0) {
        let skip = boundaryBytes.length;
        if (buffer[skip] === 45 && buffer[skip + 1] === 45) {
          break;
        }
        if (buffer[skip] === 13 && buffer[skip + 1] === 10) skip += 2;
        buffer = buffer.slice(skip);
        inPart = true;
      } else if (buffer.length > boundaryBytes.length + 8) {
        buffer = buffer.slice(
          Math.max(0, buffer.length - boundaryBytes.length - 4)
        );
      }
    }

    while (inPart) {
      if (!headersParsed) {
        const headerEnd = indexOfSeq(buffer, encoder.encode("\r\n\r\n"), 0);
        if (headerEnd === -1) break;

        partHeadersText = decoder.decode(buffer.slice(0, headerEnd));
        buffer = buffer.slice(headerEnd + 4);

        const headers = parseHeaders(partHeadersText);
        const disp = headers["content-disposition"] || "";
        const cd = parseContentDisposition(disp);
        const nameMatch = cd.name ? [null, cd.name] : null;
        if (!nameMatch) {
          continue;
        }

        const name = nameMatch[1];
        const fileMatch =
          cd.filename || cd.filenameStar
            ? [null, cd.filename || cd.filenameStar]
            : null;
        const contentTypeHeader = headers["content-type"] || "";
        let contentType =
          contentTypeHeader.split(";")[0].trim() ||
          (fileMatch ? "application/octet-stream" : "text/plain");
        let charset = extractCharset(contentTypeHeader);

        if (fileMatch) {
          const filename = fileMatch[1];
          if (contentType.startsWith("multipart/")) {
            partInfo = {
              name,
              type: contentType,
              nested: true,
              nestedBoundary: getBoundaryFromContentType(contentTypeHeader),
            };
          } else {
            const type = contentType || "application/octet-stream";
            partInfo = { name, filename, type };
          }

          if (handleFile) {
            const stream = new ReadableStream({
              start(controller) {
                fileStreamController = controller;
              },
            });

            streamingDispatched = true;

            if (!partInfo.nested) {
              Promise.resolve(
                handleFile({ name, filename, type: partInfo.type, stream })
              ).catch((e) => console.error("handleFile stream error", e));
            } else {
              streamingDispatched = false; // nested not streamed directly
            }
          } else {
            streamingDispatched = false;
          }
        } else {
          if (contentType.startsWith("multipart/")) {
            partInfo = {
              name,
              type: contentType,
              nested: true,
              nestedBoundary: getBoundaryFromContentType(contentTypeHeader),
            };
          } else {
            partInfo = { name, charset };
          }
        }
        headersParsed = true;
      }

      const boundaryIdx = indexOfSeq(buffer, boundaryLineBytes, 0);
      const finalIdx = indexOfSeq(buffer, finalBoundaryLineBytes, 0);
      const nextIdx =
        finalIdx !== -1 && (boundaryIdx === -1 || finalIdx < boundaryIdx)
          ? finalIdx
          : boundaryIdx;
      if (nextIdx === -1) {
        if (partInfo?.filename) {
          const safeLen = Math.max(
            0,
            buffer.length - (boundaryLineBytes.length + 8)
          );
          if (safeLen > 0) {
            const chunk = buffer.slice(0, safeLen);
            if (fileStreamController) fileStreamController.enqueue(chunk);
            fileChunks.push(chunk);
            fileSize += chunk.length;
            if (fileSize > fileMemoryLimit && !streamingDispatched) {
              console.warn(
                `multipart file ${partInfo.filename} exceeded in-memory limit ${fileMemoryLimit}`
              );
            }
            buffer = buffer.slice(safeLen);
          }
        }
        break;
      }

      const isFinal = nextIdx === finalIdx;
      let bodyBytes = buffer.slice(0, nextIdx);

      if (
        bodyBytes.length >= 2 &&
        bodyBytes[bodyBytes.length - 2] === 13 &&
        bodyBytes[bodyBytes.length - 1] === 10
      ) {
        bodyBytes = bodyBytes.slice(0, -2);
      }

      if (partInfo?.nested) {
        await processNestedMultipart(bodyBytes, partInfo, form, handleFile);
        partInfo = null;
        headersParsed = false;
      } else if (partInfo?.filename) {
        if (fileStreamController) fileStreamController.enqueue(bodyBytes);
        fileChunks.push(bodyBytes);
        fileSize += bodyBytes.length;
        await finalizeFile();
      } else if (partInfo) {
        await processField(bodyBytes);
      }

      const after = isFinal
        ? finalBoundaryLineBytes.length
        : boundaryLineBytes.length;
      buffer = buffer.slice(nextIdx + after);
      if (isFinal) {
        inPart = false;
        break;
      }

      if (buffer[0] === 13 && buffer[1] === 10) buffer = buffer.slice(2);

      headersParsed = false;
      partInfo = null;
      fileChunks = [];
      fileSize = 0;
      fileStreamController = null;
      streamingDispatched = false;
    }
  }

  if (partInfo?.filename) await finalizeFile();
  return form;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function parseContentDisposition(value) {
  const out = { raw: value };
  if (!value) return out;

  const parts = value.split(";").map((p) => p.trim());
  if (!/^form-data/i.test(parts[0])) return out;
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    const eq = seg.indexOf("=");
    if (eq === -1) continue;
    let k = seg.slice(0, eq).trim().toLowerCase();
    let v = seg.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (k.endsWith("*")) {
      const decoded = decodeRfc5987(v);
      if (k === "filename*") out.filenameStar = decoded;
      else if (k === "name*") out.name = decoded;
    } else {
      if (k === "name") out.name = v;
      else if (k === "filename") out.filename = v;
    }
  }
  return out;
}

function decodeRfc5987(v) {
  const match = v.match(/^([^']*)'[^']*'(.*)$/);
  if (!match) {
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  const charset = match[1];
  let encoded = match[2];
  try {
    const bytes = new Uint8Array(
      encoded
        .replace(/%([0-9A-Fa-f]{2})/g, (_, h) =>
          String.fromCharCode(parseInt(h, 16))
        )
        .split("")
        .map((c) => c.charCodeAt(0))
    );
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
}

function extractCharset(contentTypeHeader) {
  if (!contentTypeHeader) return null;
  const params = contentTypeHeader.split(";").slice(1);
  for (const p of params) {
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    const k = p.slice(0, eq).trim().toLowerCase();
    if (k === "charset") {
      let v = p.slice(eq + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      return v.toLowerCase();
    }
  }
  return null;
}

function getBoundaryFromContentType(ct) {
  const m = ct.match(/boundary=(?:"?)([^";]+)(?:"?)/i);
  return m ? m[1] : null;
}

async function processNestedMultipart(bodyBytes, partInfo, form, handleFile) {
  if (!partInfo.nestedBoundary) return;

  const boundary = partInfo.nestedBoundary;
  const boundaryBytes = encoder.encode("--" + boundary);
  const boundaryLineBytes = encoder.encode("\r\n--" + boundary);
  const finalBoundaryLineBytes = encoder.encode("\r\n--" + boundary + "--");
  let buf = bodyBytes;
  let started = false;

  if (buf[0] === 13 && buf[1] === 10) buf = buf.slice(2);

  function parseHeadersLocal(txt) {
    const lines = txt.split(/\r?\n/).filter(Boolean);
    const out = {};
    for (const l of lines) {
      const i = l.indexOf(":");
      if (i !== -1)
        out[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
    }
    return out;
  }

  function idx(src, seq, from = 0) {
    outer: for (let i = from; i <= src.length - seq.length; i++) {
      for (let j = 0; j < seq.length; j++) {
        if (src[i + j] !== seq[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  if (idx(buf, boundaryBytes, 0) === 0) {
    let skip = boundaryBytes.length;
    if (buf[skip] === 13 && buf[skip + 1] === 10) skip += 2;
    buf = buf.slice(skip);
    started = true;
  }

  while (started) {
    const headerEnd = idx(buf, encoder.encode("\r\n\r\n"));
    if (headerEnd === -1) break;

    const headerTxt = decoder.decode(buf.slice(0, headerEnd));
    buf = buf.slice(headerEnd + 4);
    const headers = parseHeadersLocal(headerTxt);
    const disp = headers["content-disposition"] || "";
    const cd = parseContentDisposition(disp);
    const nestedName = cd.name || partInfo.name;
    const filename = cd.filename || cd.filenameStar;
    const contentTypeHeader = headers["content-type"] || "";
    const contentType = contentTypeHeader.split(";")[0].trim();
    const charset = extractCharset(contentTypeHeader);
    const bIdx = idx(buf, boundaryLineBytes);
    const fIdx = idx(buf, finalBoundaryLineBytes);
    const nextIdx = fIdx !== -1 && (bIdx === -1 || fIdx < bIdx) ? fIdx : bIdx;

    if (nextIdx === -1) break;

    let body = buf.slice(0, nextIdx);
    if (
      body.length >= 2 &&
      body[body.length - 2] === 13 &&
      body[body.length - 1] === 10
    ) {
      body = body.slice(0, -2);
    }

    if (filename) {
      const blob = new Blob([body], {
        type: contentType || "application/octet-stream",
      });
      form.append(nestedName, blob, filename);

      if (handleFile) {
        await handleFile({
          name: nestedName,
          filename,
          type: contentType || "application/octet-stream",
          data: body,
        });
      }
    } else {
      let value;

      if (charset) {
        try {
          value = new TextDecoder(charset).decode(body);
        } catch {
          value = decoder.decode(body);
        }
      } else {
        value = decoder.decode(body);
      }
      form.append(nestedName, value);
    }

    const after =
      nextIdx === fIdx
        ? finalBoundaryLineBytes.length
        : boundaryLineBytes.length;
    buf = buf.slice(nextIdx + after);

    if (nextIdx === fIdx) break;
    if (buf[0] === 13 && buf[1] === 10) buf = buf.slice(2);
  }
}
