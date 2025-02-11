import packageJson from "../package.json" with { type: "json" };

export const version = `${packageJson.name.split("/").pop()}/${packageJson.version}`;
