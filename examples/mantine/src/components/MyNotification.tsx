"use client";

import { Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";

export default function MyNotification() {
  return (
    <Button
      onClick={() =>
        notifications.show({
          title: "Default notification",
          message: "Do not forget to star Mantine on GitHub! 🌟",
        })
      }
    >
      Show notification
    </Button>
  );
}
