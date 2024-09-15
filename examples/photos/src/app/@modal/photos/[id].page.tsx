import Frame from "@/components/frame/Frame";
import Modal from "@/components/modal/Modal";
import photos from "@/photos";

export default function PhotoModal({ id: photoId }: { id: string }) {
  const photo = photos.find((p) => p.id === photoId);

  return (
    <Modal>{!photo ? <p>Photo not found!</p> : <Frame photo={photo} />}</Modal>
  );
}
