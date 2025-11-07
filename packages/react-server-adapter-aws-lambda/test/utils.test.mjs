import { describe, expect, it } from "vitest";

import { makeStaticAssetsRoutingTable } from "../cdk/utils.mjs";

describe("Infrastructure Utils", () => {
  describe("makeStaticAssetsRoutingTable", () => {
    it("should create routing table for static files", () => {
      const staticFiles = {
        static: ["static/favicon.ico"],
        assets: ["assets/main.js"],
        client: ["client/bundle.js"],
        public: ["public/robots.txt"],
      };

      const routingTable = makeStaticAssetsRoutingTable(staticFiles);

      expect(routingTable).toEqual([
        { key: "static/favicon.ico", value: "s" },
        { key: "assets/main.js", value: "a" },
        { key: "client/bundle.js", value: "c" },
        { key: "public/robots.txt", value: "p" },
      ]);
    });

    it("should handle empty static files", () => {
      const staticFiles = {};
      const routingTable = makeStaticAssetsRoutingTable(staticFiles);

      expect(routingTable).toEqual([]);
    });

    it("should handle files with index.html", () => {
      const staticFiles = {
        static: ["static/index.html"],
        public: ["public/about/index.html"],
      };

      const routingTable = makeStaticAssetsRoutingTable(staticFiles);

      expect(routingTable).toEqual([
        { key: "static/index.html", value: "s" },
        { key: "public/about/index.html", value: "p" },
      ]);
    });

    it("should handle mixed file types", () => {
      const staticFiles = {
        static: ["static/styles.css", "static/images/logo.png"],
        assets: ["assets/vendor.js"],
        client: ["client/app.js"],
        public: ["public/manifest.json"],
      };

      const routingTable = makeStaticAssetsRoutingTable(staticFiles);

      expect(routingTable).toEqual([
        { key: "static/styles.css", value: "s" },
        { key: "static/images/logo.png", value: "s" },
        { key: "assets/vendor.js", value: "a" },
        { key: "client/app.js", value: "c" },
        { key: "public/manifest.json", value: "p" },
      ]);
    });

    it("should handle unknown file types gracefully", () => {
      const staticFiles = {
        unknown: ["unknown/file.ext"],
        static: ["static/file.css"],
      };

      const routingTable = makeStaticAssetsRoutingTable(staticFiles);

      // Unknown type should not be mapped
      expect(routingTable).toEqual([{ key: "static/file.css", value: "s" }]);
    });
  });
});
