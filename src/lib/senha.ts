import bcrypt from "bcryptjs";

const CUSTO = 10;

export function gerarHash(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO);
}

export function conferirSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

/** Senha provisoria legivel, entregue pelo admin ao funcionario. */
export function senhaProvisoria(): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const numeros = "23456789";
  const bloco = (fonte: string, n: number) =>
    Array.from({ length: n }, () => fonte[Math.floor(Math.random() * fonte.length)]).join("");
  return `${bloco(letras, 4)}-${bloco(numeros, 4)}`;
}

/** Regra minima de senha aceita pelo sistema. */
export function validarForcaSenha(senha: string): string | null {
  if (senha.length < 8) return "A senha precisa ter ao menos 8 caracteres.";
  if (!/[A-Za-z]/.test(senha)) return "A senha precisa conter ao menos uma letra.";
  if (!/[0-9]/.test(senha)) return "A senha precisa conter ao menos um número.";
  return null;
}
