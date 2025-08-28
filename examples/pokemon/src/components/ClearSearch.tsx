"use client";

export function ClearSearch() {
  return (
    <button
      type="button"
      onClick={() => {
        const input = document.querySelector(
          'input[name="search"]'
        ) as HTMLInputElement;
        if (input) {
          input.value = "";
          input.form?.requestSubmit();
        }
      }}
      className="absolute right-0 mr-2 p-2 text-gray-400 hover:text-gray-600 peer-placeholder-shown:hidden"
      aria-label="Clear search"
    >
      ✕
    </button>
  );
}
