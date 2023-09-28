import { Photo } from "../../photos";

export default function Frame({ photo }: { photo: Photo }) {
  return (
    <>
      <img
        alt=""
        src={photo.imageSrc}
        height={600}
        width={600}
        className="w-full object-cover aspect-square col-span-2"
      />

      <div className="bg-white p-4 px-6">
        <p>Taken by {photo.username}</p>
      </div>
    </>
  );
}
