import CopyToClipboard from "./components/CopyToClipboard";

export default function useMDXComponents() {
  return {
    pre: (props) => {
      const { filename, className, children } = props;
      return (
        <pre {...props} className={`${className ?? ""} relative`}>
          {filename && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {filename}
            </div>
          )}
          {children}
          <CopyToClipboard filename={filename} />
        </pre>
      );
    },
  };
}
