import { Link } from "@lazarv/react-server/navigation";
import { NavLink } from "@mantine/core";

export function MainNavigation() {
  return (
    <>
      <NavLink component={Link} to="/" label="Core" />
      <NavLink component={Link} to="/form" label="Form" />
      <NavLink component={Link} to="/dates" label="Dates" />
      <NavLink component={Link} to="/charts" label="Charts" />
      <NavLink component={Link} to="/code" label="Code Highlights" />
      <NavLink
        component={Link}
        to="/notification"
        label="Notification System"
      />
      <NavLink component={Link} to="/spotlight" label="Spotlight" />
      <NavLink component={Link} to="/carousel" label="Carousel" />
      <NavLink component={Link} to="/dropzone" label="Dropzone" />
      <NavLink
        component={Link}
        to="/navigationprogress"
        label="Navigation Progress"
      />
      <NavLink component={Link} to="/modalsmanager" label="Modals Manager" />
      <NavLink component={Link} to="/rte" label="Rich Text Editor" />
    </>
  );
}
