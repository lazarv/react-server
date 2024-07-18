import Sidebar from "../../../../components/Sidebar.jsx";
import TableOfContents from "../../../../components/TableOfContents.jsx";

export default function Contents() {
  return (
    <Sidebar id="contents" menu="On this page" right>
      <TableOfContents />
    </Sidebar>
  );
}
