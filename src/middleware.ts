import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "ponto_sessao";
const PUBLICAS = ["/login", "/api/auth/login"];

/**
 * Primeira barreira de acesso: valida a assinatura do cookie e direciona o
 * usuario. A checagem definitiva (usuario ativo, papel atual) acontece nas
 * paginas/rotas com acesso ao banco.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE)?.value;

  let sessao: { papel?: string; trocarSenha?: boolean } | null = null;
  if (token && process.env.SESSION_SECRET) {
    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(process.env.SESSION_SECRET),
      );
      sessao = payload as { papel?: string; trocarSenha?: boolean };
    } catch {
      sessao = null;
    }
  }

  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (!sessao) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Senha provisoria: so libera a troca de senha e o logout.
  const liberadasNaTroca = ["/trocar-senha", "/api/auth/trocar-senha", "/api/auth/logout"];
  if (sessao.trocarSenha && !liberadasNaTroca.includes(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/trocar-senha";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin") && sessao.papel !== "ADMIN") {
    const url = req.nextUrl.clone();
    url.pathname = "/ponto";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|models|favicon.ico|.*\\.png$).*)"],
};
