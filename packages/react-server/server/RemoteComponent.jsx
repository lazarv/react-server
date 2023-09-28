import { useCache } from "@lazarv/react-server/memory-cache";
import { server$ } from "@lazarv/react-server/server/actions.mjs";
import { context$, getContext } from "@lazarv/react-server/server/context.mjs";
import { createFromFetch } from "react-server-dom-webpack/client.edge";

import ReactServerComponent from "../client/ReactServerComponent.jsx";
import { HTTP_CONTEXT } from "./symbols.mjs";

export const REMOTE_CACHE = Symbol.for("REMOTE_CACHE");

const streamOptions = ({ url, ttl, outlet, request }) => ({
  async callServer(...args) {
    const [id, [data]] = args;
    const formData = new FormData();
    Object.entries(data).forEach(([k, v]) => {
      if (!k.startsWith("$ACTION_ID_")) {
        formData.append(k, v);
      }
    });
    formData.append(`$ACTION_ID_${id}`, "");
    return useCache(
      [url, REMOTE_CACHE],
      () =>
        getRemoteFlightResponse({
          url,
          ttl,
          request: {
            method: "POST",
            body: formData,
            headers: {
              ...(request?.headers ?? {}),
              accept: "text/x-component;standalone;remote",
              outlet,
            },
          },
        }),
      ttl,
      true
    );
  },
});
function proxyServerReference(parent, key, value, url, outlet) {
  if (!value) return value;
  else if (Array.isArray(value)) {
    value.forEach((v, k) => proxyServerReference(value, k, v, url, outlet));
  } else if (
    value &&
    typeof value === "object" &&
    value.$$typeof?.toString() !== "Symbol(react.server_context)"
  ) {
    Object.entries(value).forEach(([k, v]) =>
      proxyServerReference(value, k, v, url, outlet)
    );
  } else if (
    typeof value === "function" &&
    typeof value.$$FORM_ACTION === "function" &&
    !value.$$remote_server_action
  ) {
    const proxy = server$((...args) => {
      value(...args);
    });
    proxy.$$bound = [
      {
        __react_server_remote_component_url__: url,
        __react_server_remote_component_outlet__: outlet,
      },
    ];
    proxy.$$remote_server_action = true;
    parent[key] = proxy;
  }
}
async function getRemoteFlightResponse({ url, ttl, outlet, request = {} }) {
  const Component = createFromFetch(
    fetch(url, {
      ...request,
      headers: {
        ...(request?.headers ?? {}),
        accept: "text/x-component;standalone;remote",
        outlet,
      },
    }),
    streamOptions({ url, ttl, outlet, request })
  );
  const promise = new Promise((resolve, reject) => {
    Component.then((value) => {
      try {
        proxyServerReference(null, null, value, url, outlet);
      } catch (e) {
        reject(e);
      }
      resolve(value);
    });
  });
  promise._response = Component._response;
  return Component;
}

function FlightComponent({ url, ttl = Infinity, outlet = null, request = {} }) {
  const key = `__react_server_remote_component_outlet_${outlet}__`;
  const accept = getContext(HTTP_CONTEXT).request.headers.get("accept");
  const Component = useCache(
    [url, accept, REMOTE_CACHE],
    async () => {
      const res = await fetch(url, {
        ...request,
        headers: {
          ...(request?.headers ?? {}),
          accept: `${accept};standalone;remote`,
          outlet,
        },
      });

      if (!res.ok) {
        const [message, ...stack] = (await res.text()).split("\n");
        const remoteError = new Error(
          `Failed to load remote component: ${message.replace(
            /^Error:\s*/,
            ""
          )}`
        );
        remoteError.stack = stack.map((l) => l.trim()).join("\n");
        throw remoteError;
      }

      const reader = res.body.getReader();
      const Component = { outlet, html: "", rsc: "" };

      const decoder = new TextDecoder();
      let done = false;
      let value = "";
      while (!done) {
        const { value: chunk, done: _done } = await reader.read();
        done = _done;
        const str = decoder.decode(chunk);
        value += str;
        const lines = value.split("\n");
        value = lines.pop();
        for (const line of lines) {
          if (/^[0-9a-f]+:/.test(line)) {
            Component.rsc += line + "\n";
            if (/^0:/.test(line)) {
              if (!done) {
                Component.stream = new ReadableStream({
                  async start(controller) {
                    let done = false;
                    let value = "";
                    let html = "";
                    let rsc = "";

                    while (!done) {
                      const { value: chunk, done: _done } = await reader.read();
                      done = _done;
                      if (chunk) {
                        const str = decoder.decode(chunk);
                        value += str;
                        const lines = value.split("\n");
                        value = lines.pop();
                        for (const line of lines) {
                          if (/^[0-9a-f]+:/.test(line)) {
                            rsc += line + "\n";
                          } else {
                            html += line;
                          }
                        }
                        if (!value && html && rsc) {
                          controller.enqueue({ outlet, html, rsc });
                          html = "";
                          rsc = "";
                        }
                      }
                    }

                    controller.enqueue({ outlet, html: html || value, rsc });
                    controller.close();
                  },
                });
              }
              return Component;
            }
          } else {
            Component.html += line;
          }
        }
      }
      if (/^[0-9a-f]+:/.test(value)) {
        Component.rsc += value + "\n";
      } else {
        Component.html += value;
      }
      Component.outlet = outlet;
      return Component;
    },
    ttl
  );
  context$(key, Component);
  return <>{key}</>;
}

export default function RemoteComponent({
  url,
  outlet = null,
  ttl = Infinity,
  request = {},
}) {
  return (
    <ReactServerComponent url={url} outlet={outlet} standalone remote>
      <FlightComponent url={url} ttl={ttl} outlet={outlet} request={request} />
    </ReactServerComponent>
  );
}
