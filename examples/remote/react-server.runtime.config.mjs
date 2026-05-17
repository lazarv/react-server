// Runtime config for the remote example.
//
// This app is invoked in two distinct ways:
//
//   1. Server-to-server: the host fetches rendered components from
//      this remote app via `@lazarv/react-server/remote`. No browser
//      is involved, so CORS / CSRF do not apply.
//   2. Browser form submits: components rendered into the host's
//      HTML can include `<form>` elements whose action targets a
//      server function on THIS remote app. When the user submits,
//      the browser POSTs cross-origin (Origin = host) to this
//      remote (different origin). Without explicit trust, the
//      CSRF check rejects the submit with HTTP 403.
//
// `server.csrf.allowedOrigins` declares which host origins may
// invoke our action endpoints via form submit. The companion
// `server.cors` config controls cross-origin XHR/fetch — the same
// host needs to be in both lists for a complete integration.
//
// Adjust the origin list to match your real host deployments;
// these defaults assume the local-dev `pnpm dev` setup where the
// host runs on :3000 and this remote runs on :3001.
export default {
  resolve: {
    shared: ["DataProvider"],
  },
  server: {
    cors: true,
    csrf: {
      mode: "lax",
      allowedOrigins: [
        // Local-dev host app
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        // Add any production host origins that embed components from
        // this remote, e.g.:
        // "https://app.example.com",
      ],
    },
  },
};
