import FormInput from "@/components/FormInput";
import { useSearchParams } from "@lazarv/react-server";
import { Form } from "@lazarv/react-server/navigation";

import { ClearSearch } from "./ClearSearch";

export default function Search() {
  const { search } = useSearchParams();

  return (
    <Form
      target="view"
      replace
      className="w-full flex flex-col items-center justify-center"
    >
      <input type="hidden" name="offset" value="0" />
      <div className="relative w-full max-w-md flex items-center">
        <FormInput
          type="text"
          name="search"
          placeholder="Search"
          className="w-full p-2 bg-white border border-gray-300 rounded-md peer"
          defaultValue={search as string}
          tabIndex={0}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          autoSave="off"
        />
        <ClearSearch />
      </div>
    </Form>
  );
}
