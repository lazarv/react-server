import ModalLoading from "@/app/@modal/loading";
import ViewLoading from "@/app/loading";
import Button from "@/components/Button";
import KeyLink from "@/components/KeyLink";
import { getPokemons } from "@/lib/pokemon";
import { applySearchParams } from "@/lib/utils";
import { useSearchParams } from "@lazarv/react-server";
import { Link } from "@lazarv/react-server/navigation";

export const ttl = 24 * 60 * 60 * 1000;

export default async function View() {
  const { search, offset: offsetParam, limit: limitParam } = useSearchParams();
  const offset = Number(offsetParam) || 0;
  const limit = Number(limitParam) || 10;
  const currentPage = getPokemons((search as string) ?? "", offset, limit);
  const prevPage =
    offset > 0
      ? getPokemons(
          (search as string) ?? "",
          Math.max(0, offset - limit),
          limit
        )
      : Promise.resolve({ data: [], count: 0 });
  const nextPage = getPokemons(
    (search as string) ?? "",
    offset + 0 + limit,
    limit
  );
  const [{ data: prevData }, { data, count }, { data: nextData }] =
    await Promise.all([prevPage, currentPage, nextPage]);
  const prefetchData = [...prevData, ...data, ...nextData];

  return (
    <>
      {prefetchData.map((pokemon) => (
        <link
          key={pokemon.name}
          rel="prefetch"
          as="image"
          href={pokemon.sprites.front_default}
        />
      ))}
      <main className="flex-grow p-4">
        <div className="flex flex-wrap justify-center gap-4 max-w-screen-xl mx-auto">
          {data?.map((pokemon, index) => (
            <Link
              key={pokemon.name}
              to={`/${pokemon.name}?${applySearchParams({
                offset,
                limit,
              })}`}
              prefetch
              revalidate={false}
              target="modal"
              className="opacity-0 item-enter rounded-md focus-visible:outline-none"
              style={{
                animationDelay: `${index * 50}ms`,
              }}
              fallback={<ModalLoading />}
              tabIndex={-1}
            >
              <div className="relative flex flex-col items-center gap-2 p-4 bg-white rounded-md shadow-md hover:shadow-lg outline-transparent outline-offset-2 hover:outline hover:outline-4 hover:outline-blue-600 hover:scale-105 transition-all">
                <h2 className="text-lg font-bold capitalize max-w-40 overflow-ellipsis overflow-hidden whitespace-nowrap">
                  {pokemon.name}
                </h2>
                {pokemon.sprites.front_default ? (
                  <img
                    src={pokemon.sprites.front_default}
                    alt={pokemon.name}
                    className="w-48 h-48 bg-gray-200 rounded-md pixelated"
                  />
                ) : (
                  <div className="w-48 h-48 bg-gray-200 rounded-md" />
                )}
                <div className="absolute bottom-2 right-2 text-xs text-white bg-black/50 rounded-md px-2 py-1 italic">
                  #{pokemon.id}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <div className="w-80 flex items-center self-center justify-between gap-4">
        <KeyLink
          to={
            offset > 0
              ? `?${applySearchParams({
                  offset: Math.max(0, offset - limit),
                  limit,
                })}`
              : "#"
          }
          prefetch
          revalidate={false}
          eventKey="ArrowLeft"
          target="view"
          fallback={<ViewLoading />}
          tabIndex={-1}
        >
          <Button disabled={offset === 0} type="button">
            Previous
          </Button>
        </KeyLink>
        <span className="text-sm text-center whitespace-nowrap">
          <strong>{offset + 1}</strong> -{" "}
          <strong>{offset + data?.length}</strong> of <strong>{count}</strong>
        </span>
        <KeyLink
          to={
            offset + data?.length < count
              ? `?${applySearchParams({
                  offset: Math.min(offset + limit, count),
                  limit,
                })}`
              : "#"
          }
          prefetch
          revalidate={false}
          eventKey="ArrowRight"
          target="view"
          fallback={<ViewLoading />}
          tabIndex={-1}
        >
          <Button disabled={offset + data?.length >= count} type="button">
            Next
          </Button>
        </KeyLink>
      </div>
    </>
  );
}
