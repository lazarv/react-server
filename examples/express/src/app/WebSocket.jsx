"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";

export default function WebSocket() {
  const [socket, setSocket] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const socket = io(new URL("/react-server/", location.origin));

    socket.on("connect", () => {
      setSocket(socket);
    });

    socket.on("disconnect", () => {
      setSocket(null);
    });

    socket.on("message", (msg) => {
      setMessage(msg);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div>
      <h1>WebSocket</h1>
      <p>Socket: {socket ? "Connected" : "Disconnected"}</p>
      <p>Message: {message}</p>
    </div>
  );
}
