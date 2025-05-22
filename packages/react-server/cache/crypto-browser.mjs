export function randomUUID() {
  return crypto.randomUUID();
}

const mappedAlgorithm = {
  sha1: "SHA-1",
  sha256: "SHA-256",
  sha384: "SHA-384",
  sha512: "SHA-512",
  md5: "MD5",
};
export function createHash(algorithm) {
  return {
    update(data) {
      this.data = data;
      return this;
    },
    async digest(encoding) {
      const hash = await crypto.subtle.digest(
        mappedAlgorithm[algorithm] ?? algorithm,
        new TextEncoder().encode(this.data)
      );
      const byteArray = new Uint8Array(hash);

      if (encoding === "hex") {
        return Array.from(byteArray)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      } else if (encoding === "base64") {
        return btoa(String.fromCharCode(...byteArray));
      } else if (encoding === "utf8") {
        return new TextDecoder().decode(byteArray);
      }
      return byteArray;
    },
  };
}
