export function getHandler(cf, kvsHandle, domainNameOrginStaticAssets) {
  return async function handler(event) {
    if (event.request.method === "GET") {
      let key = event.request.uri.substring(1).toLowerCase().replace(/\/$/, ""); // Slash needs to be escaped in Cloud function creator
      if (
        event.request.headers["accept"] &&
        event.request.headers["accept"]["value"] &&
        event.request.headers["accept"]["value"].includes("text/html") &&
        !key.endsWith(".html")
      ) {
        key += (key !== "" ? "/" : "") + "index.html";
      }
      try {
        await kvsHandle.get(key);
        cf.updateRequestOrigin({
          domainName: domainNameOrginStaticAssets,
          originAccessControlConfig: {
            enabled: true,
            signingBehavior: "always",
            signingProtocol: "sigv4",
            originType: "s3",
          },
          // Empty object resets any header configured on the assigned origin
          customHeaders: {},
        });

        event.request.uri = "/" + key;
        // eslint-disable-next-line no-unused-vars
      } catch (_err) {
        // Key not found in KVS
      }
    }
    return event.request;
  };
}
