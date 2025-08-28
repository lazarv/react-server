import { getPokemonDetails } from "@/lib/pokemon";

export const ttl = 24 * 60 * 60 * 1000;

export default async function PokemonDetails({ id }: { id: string }) {
  const pokemon = await getPokemonDetails(id);

  if (!pokemon) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h2 className="text-2xl font-bold">Not Found</h2>
        <p className="text-sm">The requested Pokémon was not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="w-full flex gap-4 items-end justify-between border-b border-gray-200 p-4 sticky top-0 bg-white shadow-lg">
        <h2 className="text-2xl font-bold capitalize">{pokemon.name}</h2>
        <h3 className="text-lg font-bold italic">#{pokemon.id}</h3>
      </header>
      <div className="w-full flex gap-8 px-4">
        <div className="flex-1 flex flex-col gap-2">
          <h4 className="text-lg font-bold">Species</h4>
          <p className="text-xs italic">
            {
              pokemon.species.flavor_text_entries.find(
                ({ language }) => language.name === "en"
              )?.flavor_text
            }
          </p>
          {pokemon.species.form_descriptions.find(
            ({ language }) => language.name === "en"
          ) && (
            <>
              <h4 className="text-lg font-bold">Forms</h4>
              <p className="text-xs">
                {
                  pokemon.species.form_descriptions.find(
                    ({ language }) => language.name === "en"
                  )?.description
                }
              </p>
            </>
          )}
          <h4 className="text-lg font-bold">Height</h4>
          <p className="text-xs">{pokemon.height}</p>
          <h4 className="text-lg font-bold">Weight</h4>
          <p className="text-xs">{pokemon.weight}</p>
          <h4 className="text-lg font-bold">Base Experience</h4>
          <p className="text-xs">{pokemon.base_experience}</p>
          <h4 className="text-lg font-bold">Abilities</h4>
          {pokemon.abilities.map((ability) => (
            <div key={ability.names[0].name}>
              <h5 className="text-sm font-bold">
                {
                  ability.names.find(({ language }) => language.name === "en")
                    ?.name
                }
              </h5>
              <p className="text-xs">
                {
                  ability.effect_entries.find(
                    ({ language }) => language.name === "en"
                  )?.effect
                }
              </p>
            </div>
          ))}
          <h4 className="text-lg font-bold">Types</h4>
          <p className="text-xs">
            {pokemon.types
              .map(
                (type) =>
                  type.names.find(({ language }) => language.name === "en")
                    ?.name
              )
              .join(", ")}
          </p>
        </div>
        <div className="flex-1">
          <img
            src={pokemon.sprites.front_default}
            alt={pokemon.name}
            className="w-full object-fit bg-gray-200 rounded-md pixelated"
          />
        </div>
      </div>
    </div>
  );
}
