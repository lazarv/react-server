import Confetti from "~/components/Confetti";

export default function Home() {
  return (
    <>
      <section className="flex flex-col mt-auto">
        <div className="relative">
          <img
            src="/react-server.svg"
            className="absolute h-[85%] top-1/2 -translate-x-full -translate-y-1/2 -ml-1"
            alt="@lazarv/react-server logo"
          />
          <h2 className="text-xs font-semibold m-0 pt-0 border-none dark:text-yellow-500 mt-4 sm:mt-0">
            @lazarv
          </h2>
          <h1 className="text-5xl font-semibold m-0 -mt-4 whitespace-nowrap sm:text-6xl dark:text-yellow-500">
            react-server
          </h1>
        </div>

        <p className="text-lg">
          Welcome to your <b>@lazarv/react-server</b> app!
        </p>
      </section>

      <Confetti className="mt-4" />

      <p className="text-sm mt-4">
        Try editing <b>src/app/@content/index.tsx</b> and save to reload.
      </p>
    </>
  );
}
