export function makeStaticAssetsRoutingTable(staticFiles) {
  const fileTypeMap = {
    static: "s",
    assets: "a",
    client: "c",
    public: "p",
  }; // other types are ignored

  const staticAssetsRoutingTabel = Object.keys(staticFiles).flatMap(
    (filetyp) => {
      if (fileTypeMap?.[filetyp]) {
        return staticFiles[filetyp].flatMap((path) => {
          return {
            key: path,
            value: fileTypeMap[filetyp],
          };
        });
      }
      return [];
    }
  );
  return staticAssetsRoutingTabel;
}
