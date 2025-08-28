declare const process: {
  env: {
    POKEMON_LIMIT?: string;
  };
};

export type Pokemon = {
  id: number;
  name: string;
  is_default: boolean;
  height: number;
  weight: number;
  base_experience: number;
  sprites: { front_default: string };
  abilities: Ability[];
  types: Type[];
  species: Species;
};

export async function getAllPokemons(): Promise<Pokemon[]> {
  "use cache";
  let pokemons: Pokemon[] = [];
  let next = `https://pokeapi.co/api/v2/pokemon?limit=${process.env.POKEMON_LIMIT || 1000}`;
  while (next) {
    const response = await fetch(next);
    const data = await response.json();
    pokemons = pokemons.concat(data.results);
    next = data.next;
    if (
      process.env.POKEMON_LIMIT &&
      pokemons.length >= parseInt(process.env.POKEMON_LIMIT)
    ) {
      break;
    }
  }
  return pokemons;
}

export async function getPokemons(
  search: string,
  offset: number,
  limit: number
): Promise<{ data: Pokemon[]; count: number }> {
  "use cache";
  try {
    const allPokemons = await getAllPokemons();
    const filteredPokemons =
      search.trim().length > 0
        ? allPokemons.filter((pokemon) =>
            pokemon.name.toLowerCase().includes(search.trim().toLowerCase())
          )
        : allPokemons;
    const fullPokemons = await Promise.all(
      filteredPokemons.map((pokemon) => getPokemon(pokemon.name))
    );
    const defaultPokemons = fullPokemons.filter(
      (pokemon) => pokemon?.is_default
    );
    return {
      data: defaultPokemons.slice(offset, offset + limit),
      count: defaultPokemons.length,
    };
  } catch {
    return { data: [], count: 0 };
  }
}

export async function getPokemon(name: string): Promise<Pokemon> {
  "use cache";
  const pokemonData = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`);
  return pokemonData.json();
}

export type Ability = {
  ability: { name: string };
};

export type AbilityDetails = {
  names: { name: string; language: { name: string } }[];
  effect_entries: {
    effect: string;
    short_effect: string;
    language: { name: string };
  }[];
};

export async function getAbility(name: string): Promise<AbilityDetails> {
  "use cache";
  const abilityData = await fetch(`https://pokeapi.co/api/v2/ability/${name}`);
  return abilityData.json();
}

export type Type = {
  type: { name: string };
};

export type TypeDetails = {
  names: { name: string; language: { name: string } }[];
};

export async function getType(name: string): Promise<TypeDetails> {
  "use cache";
  const typeData = await fetch(`https://pokeapi.co/api/v2/type/${name}`);
  return typeData.json();
}

export type Species = {
  name: string;
};

export type SpeciesDetails = {
  names: { name: string; language: { name: string } }[];
  flavor_text_entries: {
    flavor_text: string;
    language: { name: string };
  }[];
  form_descriptions: {
    description: string;
    language: { name: string };
  }[];
};

export async function getSpecies(name: string): Promise<SpeciesDetails> {
  "use cache";
  const speciesData = await fetch(
    `https://pokeapi.co/api/v2/pokemon-species/${name}`
  );
  return speciesData.json();
}

export async function getPokemonDetails(name: string): Promise<
  Omit<Pokemon, "abilities" | "types" | "species"> & {
    abilities: AbilityDetails[];
    types: TypeDetails[];
    species: SpeciesDetails;
  }
> {
  "use cache";
  const pokemon = await getPokemon(name);

  if (!pokemon) {
    throw new Error(`Pokemon "${name}" not found`);
  }

  const abilities = await Promise.all(
    pokemon.abilities.map((ability) => getAbility(ability.ability.name))
  );
  const types = await Promise.all(
    pokemon.types.map((type) => getType(type.type.name))
  );
  const species = await getSpecies(pokemon.species.name);
  return { ...pokemon, abilities, types, species };
}
