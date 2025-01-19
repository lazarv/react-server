import Search from "@/components/Search";
import { ReactServerComponent } from "@lazarv/react-server/navigation";

import View from "./@view/[[id]]";

export const ttl = 24 * 60 * 60 * 1000;

export default async function Page() {
  const view = await View();

  return (
    <>
      <Search />
      <ReactServerComponent outlet="view">{view}</ReactServerComponent>
    </>
  );
}
