import { user } from "@lazarv/react-server/routes";

export default user.createLoading(() => {
  return (
    <div style={{ padding: "20px", color: "#888" }}>
      Loading user profile...
    </div>
  );
});
