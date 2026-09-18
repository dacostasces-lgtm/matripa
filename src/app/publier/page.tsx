import { redirect } from "next/navigation";

/** Alias public et stable de l'espace de publication partenaire. */
export default function PublierPage() {
  redirect("/partenaire");
}
