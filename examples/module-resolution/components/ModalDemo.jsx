"use client";

import { useState } from "react";
import Modal from "react-modal";

export default function ModalDemo() {
  const [visible, setVisible] = useState(false);

  const customStyles = {
    content: {
      top: "50%",
      left: "50%",
      right: "auto",
      bottom: "auto",
      transform: "translate(-50%, -50%)",
      backgroundColor: "#f0f0f0",
      border: "1px solid #333",
      padding: "20px",
    },
  };

  return (
    <div data-testid="react-modal-result">
      <p>react-modal loaded successfully</p>
      <button onClick={() => setVisible(true)}>Show Modal</button>
      <Modal isOpen={visible} style={customStyles} ariaHideApp={false}>
        <div>
          <p>Modal Content</p>
          <button onClick={() => setVisible(false)}>Hide Modal</button>
        </div>
      </Modal>
    </div>
  );
}
