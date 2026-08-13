import { NextResponse } from "next/server";
import { encerrarSessao } from "@/lib/sessao";

export async function POST() {
  await encerrarSessao();
  return NextResponse.json({ ok: true });
}
