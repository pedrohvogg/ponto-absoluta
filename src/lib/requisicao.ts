/** Melhor palpite de IP do cliente atras de proxy/CDN. */
export function ipDaRequisicao(req: Request): string {
  const h = req.headers;
  const encaminhado = h.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0].trim();
  return h.get("x-real-ip") ?? h.get("cf-connecting-ip") ?? "desconhecido";
}

export function agenteDaRequisicao(req: Request): string {
  return (req.headers.get("user-agent") ?? "").slice(0, 250);
}
