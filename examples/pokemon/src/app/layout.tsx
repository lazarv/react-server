import "./global.css";

import Html from "@/components/Html";
import Modal from "@/components/Modal";
import TimeAgo from "@/components/TimeAgo";
import { ReactServerComponent, Refresh } from "@lazarv/react-server/navigation";
import { useMatch } from "@lazarv/react-server/router";

export default async function Layout({
  modal,
  children,
}: {
  modal: React.ReactNode;
  children: React.ReactNode;
}) {
  const hasRefresh = useMatch("/", { exact: true });

  return (
    <Html>
      <div className="flex flex-col min-h-screen bg-gray-100">
        <header className="flex items-center justify-between bg-white p-4 sticky top-0 shadow-lg z-10">
          <h1 className="text-2xl font-bold">Pokémon Catalog</h1>
          {hasRefresh && (
            <div className="flex flex-col items-end">
              <Refresh noCache className="cursor-pointer">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                  className="w-6 h-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
              </Refresh>
              <div className="h-4 fade-in">
                <div className="slide-from-right first-letter:capitalize">
                  <TimeAgo date={new Date()} />
                </div>
              </div>
            </div>
          )}
        </header>
        <div className="flex flex-col items-center justify-center gap-4 p-4">
          {children}
          <Modal>
            <ReactServerComponent outlet="modal">{modal}</ReactServerComponent>
          </Modal>
        </div>
      </div>
    </Html>
  );
}
