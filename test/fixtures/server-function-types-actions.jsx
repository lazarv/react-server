"use client";

import {
  formDataAction,
  arrayBufferAction,
  bufferAction,
  arrayBufferViewAction,
  blobAction,
  textAction,
  jsonAction,
  noContentAction,
  errorAction,
  reloadAction,
  streamAction,
  iteratorAction,
} from "./actions.mjs";

export default function ServerFunctionTypes() {
  return (
    <>
      <div suppressHydrationWarning>{Math.random()}</div>
      <button
        onClick={async () =>
          console.log((window.__react_server_result__ = await formDataAction()))
        }
      >
        form-data-action
      </button>
      <button
        onClick={async () =>
          console.log(
            (window.__react_server_result__ = await arrayBufferAction())
          )
        }
      >
        array-buffer-action
      </button>
      <button
        onClick={async () =>
          console.log((window.__react_server_result__ = await bufferAction()))
        }
      >
        buffer-action
      </button>
      <button
        onClick={async () =>
          console.log(
            (window.__react_server_result__ = await arrayBufferViewAction())
          )
        }
      >
        array-buffer-view-action
      </button>
      <button
        onClick={async () =>
          console.log((window.__react_server_result__ = await blobAction()))
        }
      >
        blob-action
      </button>
      <button
        onClick={async () =>
          console.log((window.__react_server_result__ = await textAction()))
        }
      >
        text-action
      </button>
      <button
        onClick={async () =>
          console.log((window.__react_server_result__ = await jsonAction()))
        }
      >
        json-action
      </button>
      <button
        onClick={async () => {
          const stream = await streamAction();
          console.log((window.__react_server_result__ = stream));
          for await (const value of stream) {
            console.log(value);
          }
          console.log("done");
        }}
      >
        stream-action
      </button>
      <button
        onClick={async () => {
          const iterator = await iteratorAction();
          console.log((window.__react_server_result__ = iterator));
          for await (const value of iterator) {
            console.log(value);
          }
          console.log("done");
        }}
      >
        iterator-action
      </button>
      <button
        onClick={async () =>
          console.log(
            (window.__react_server_result__ = await noContentAction())
          )
        }
      >
        no-content-action
      </button>
      <button
        onClick={async () => {
          try {
            await errorAction();
          } catch (e) {
            console.log((window.__react_server_result__ = e));
          }
        }}
      >
        error-action
      </button>
      <button
        onClick={async () =>
          console.log((window.__react_server_result__ = await reloadAction()))
        }
      >
        reload-action
      </button>
    </>
  );
}
