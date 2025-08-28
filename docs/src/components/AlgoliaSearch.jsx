"use client";

import "./AlgoliaSearch.css";

import { DocSearch } from "@docsearch/react";

export default function AlgoliaSearch({ translations, placeholder }) {
  return (
    <div id="algolia-search">
      <DocSearch
        appId="OVQLOZDOSH"
        apiKey="5a8224f70c312c69121f92482ff2df82"
        indexName="react-server"
        placeholder={placeholder}
        translations={translations}
      />
    </div>
  );
}
