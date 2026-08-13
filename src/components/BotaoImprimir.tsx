"use client";

export default function BotaoImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="botao-secundario py-2">
      🖨 Imprimir / salvar PDF
    </button>
  );
}
