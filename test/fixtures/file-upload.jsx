import FileUploadClient from "./file-upload-client.jsx";

/**
 * Page fixture for the file-upload integration spec.  Mounts the
 * client driver — see file-upload-client.jsx for the actual buttons
 * and file-upload-actions.mjs for the server actions.
 */
export default function FileUploadPage() {
  return <FileUploadClient />;
}
