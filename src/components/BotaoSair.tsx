"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BotaoSair() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button onClick={sair} disabled={saindo} className="botao-secundario px-3 py-1.5 text-xs">
      {saindo ? "Saindo…" : "Sair"}
    </button>
  );
}
