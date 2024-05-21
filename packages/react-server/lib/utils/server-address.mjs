import { networkInterfaces } from "node:os";

export default function getServerAddresses(server) {
  const serverAddress = server.address();
  const addresses = Object.values(networkInterfaces());
  return (
    addresses.find((addresses) =>
      addresses.some((address) => address.address === serverAddress.address)
    ) ||
    addresses.flatMap((addresses) =>
      addresses.filter((address) => address.family === "IPv4")
    )
  ).filter((address) => address.family === "IPv4");
}
