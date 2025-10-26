import NoteForm from "../../components/form";

export default function FormIndexPage() {
  return (
    <div>
      <h1>Forms Index Page</h1>
      <p>This is the index page for forms in the file-based routing example.</p>
      <NoteForm note={{ title: "", note: "" }} />
    </div>
  );
}
