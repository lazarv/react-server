import { Link } from "@lazarv/react-server/navigation";

import MyNotification from "../components/MyNotification";

export default async function NotificationsPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.headline}</h1>
      <MyNotification />
      <Link to="/" className="mt-4 inline-block underline">
        Return home
      </Link>
    </div>
  );
}

const getData = async () => {
  const data = {
    title: "Ext / Notifications",
    headline: "Extentions / Notifications",
  };

  return data;
};
