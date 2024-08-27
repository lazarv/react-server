export default function Page() {
  return (
    <footer className="mt-auto py-4 bg-gray-800 text-white text-center">
      <div className="container mx-auto">
        <p className="text-sm">
          &copy; {new Date().getFullYear()} @lazarv/react-server | Built with ❤️
          and React
        </p>
      </div>
    </footer>
  );
}
