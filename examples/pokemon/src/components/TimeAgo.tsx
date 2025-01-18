"use client";

import { useEffect, useState } from "react";

import { ClientOnly } from "@lazarv/react-server/client";

const intervals = {
  year: 31536000,
  month: 2592000,
  week: 604800,
  day: 86400,
  hour: 3600,
  minute: 60,
  second: 1,
};

function timeAgo(date: Date, locale = "en") {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const now = Date.now();
  const diffInSeconds = Math.floor((date.getTime() - now) / 1000);

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    if (Math.abs(diffInSeconds) >= secondsInUnit || unit === "second") {
      const value = Math.round((diffInSeconds + 1) / secondsInUnit);
      return rtf.format(value, unit as Intl.RelativeTimeFormatUnit);
    }
  }

  return "just now";
}

async function timeAgoInterval(
  date: Date,
  { signal }: { signal: AbortSignal }
) {
  const now = Date.now();
  const diffInSeconds = Math.floor((date.getTime() - now) / 1000);

  let interval = 1000;
  for (const secondsInUnit of Object.values(intervals)) {
    if (Math.abs(diffInSeconds) >= secondsInUnit) {
      interval = secondsInUnit * 1000;
      break;
    }
  }

  await new Promise((resolve) => {
    const timeoutId = setTimeout(resolve, interval);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeoutId);
        resolve(null);
      },
      { once: true }
    );
  });

  if (!signal.aborted) {
    return timeAgo(date);
  }
}

function TimeAgoRealTime({ date }: { date: Date }) {
  const [value, setValue] = useState(timeAgo(date));

  useEffect(() => {
    const abortController = new AbortController();

    (async () => {
      while (true) {
        const result = await timeAgoInterval(date, {
          signal: abortController.signal,
        });

        if (!result) {
          break;
        }

        setValue(result);
      }
    })();

    return () => abortController.abort();
  }, [date]);

  return value;
}

export default function TimeAgo({ date }: { date: Date }) {
  return (
    <ClientOnly>
      <TimeAgoRealTime date={date} />
    </ClientOnly>
  );
}
