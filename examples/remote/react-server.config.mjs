export default {
  export() {
    return [
      {
        path: "/",
        remote: true,
      },
    ];
  },
  resolve: {
    shared: ["DataProvider"],
  },
};
