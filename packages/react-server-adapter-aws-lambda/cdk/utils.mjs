export function makeStaticAssetsRoutingTable(staticFiles) {
  const fileTypeMap = {
    static: "s",
    assets: "a",
    client: "c",
    public: "p",
  }; // other types are ignored

  const staticAssetsRoutingTable = Object.keys(staticFiles).flatMap(
    (fileType) => {
      if (fileTypeMap?.[fileType]) {
        return staticFiles[fileType].flatMap((path) => {
          return {
            key: path,
            value: fileTypeMap[fileType],
          };
        });
      }
      return [];
    }
  );
  return staticAssetsRoutingTable;
}
