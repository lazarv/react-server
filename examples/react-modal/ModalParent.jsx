"use client";

import { useState } from "react";
import Modal from "react-modal";

export default function ModalParent() {
  const [visible, setVisible] = useState(false);
  const customStyles = {
    content: {
      top: "calc(50% - 100px)",
      left: "30%",
      width: "40%",
      height: "100px",
      backgroundColor: "lightgray",
      border: "1px solid black",
    },
  };
  return (
    <div>
      <Modal isOpen={visible} style={customStyles} ariaHideApp={false}>
        <button onClick={() => setVisible(false)}>Hide Modal</button>
      </Modal>
      <button onClick={() => setVisible(true)}>Show Modal</button>
    </div>
  );
}
