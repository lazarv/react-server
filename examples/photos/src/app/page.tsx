import swagPhotos from "@/photos";
import { Link } from "@lazarv/react-server/navigation";

export const ttl = 30000;

export default function Home() {
  const photos = swagPhotos;

  return (
    <main className="container mx-auto">
      <h1 className="text-center text-4xl font-bold m-10">Photos</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 auto-rows-max	 gap-6 m-10">
        {photos.map(({ id, imageSrc }) => (
          <Link
            key={id}
            to={`/photos/${id}`}
            prefetch
            ttl={30000}
            rollback={30000}
          >
            <img
              alt=""
              src={imageSrc}
              height={500}
              width={500}
              className="w-full object-cover aspect-square"
            />
          </Link>
        ))}
      </div>
    </main>
  );
}
