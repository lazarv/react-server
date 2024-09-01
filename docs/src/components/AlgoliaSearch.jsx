"use client";

import "./AlgoliaSearch.css";

import { DocSearch } from "@docsearch/react";

export default function AlgoliaSearch() {
  return (
    <div
      id="algolia-search"
      className="fixed top-[calc(100vh-3rem)] right-4 opacity-50 transition-opacity hover:opacity-100 md:absolute md:top-auto md:right-24 md:opacity-100 md:-mt-[0.1rem]"
    >
      <DocSearch
        appId="OVQLOZDOSH"
        apiKey="5a8224f70c312c69121f92482ff2df82"
        indexName="react-server"
      />
    </div>
  );
}
