import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";

export default async function Home() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");
  redirect(sessao.papel === "ADMIN" ? "/admin" : "/ponto");
}
