import { redirect } from "next/navigation";
import { telaInicial } from "@/lib/auth";
import { lerSessao } from "@/lib/sessao";

export default async function Home() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");
  redirect(telaInicial(sessao.papel));
}
