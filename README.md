# Ponto Eletrônico com Reconhecimento Facial

Aplicativo web para registro de ponto: o funcionário bate o ponto pelo celular ou
computador com validação facial, e o administrador cria os acessos, acompanha
quem está trabalhando e emite o espelho de ponto.

**Stack:** Next.js 15 (App Router) · TypeScript · Prisma · PostgreSQL · Tailwind CSS 4 ·
[face-api](https://github.com/vladmandic/face-api) rodando no navegador.

---

## Como funciona o reconhecimento facial

O reconhecimento roda **inteiramente no navegador do funcionário**. Nenhum vídeo ou
foto é transmitido para reconhecer o rosto:

1. A câmera capta o rosto e a biblioteca gera um **descriptor**: um vetor de 128
   números que representa aquele rosto.
2. Só esse vetor vai para o servidor.
3. O **servidor** compara o vetor recebido com os vetores cadastrados do usuário
   logado e decide se libera o ponto. A comparação nunca acontece no cliente —
   assim o navegador não consegue "dizer" que o rosto conferiu.
4. Se a empresa quiser, uma miniatura JPEG da selfie é guardada **como comprovante**
   para conferência do RH (configurável em Configurações).

A distância euclidiana entre os vetores é o critério: quanto menor, mais parecido.
O limite padrão é `0,50` e pode ser ajustado pelo administrador.

### Limite conhecido desta abordagem

Como o vetor é calculado no cliente, um usuário tecnicamente avançado poderia
capturar o próprio vetor e reenviá-lo depois sem estar na frente da câmera
("replay"). As defesas presentes hoje são: sessão autenticada, comprovante
fotográfico auditável, cerca virtual, IP/dispositivo registrados e trilha de
auditoria. Se o seu caso exige garantia forte contra fraude, o caminho é trocar a
etapa de comparação por um serviço com **prova de vivacidade** (AWS Rekognition
Face Liveness, Azure Face Liveness) — a arquitetura já isola isso em
`src/lib/face.ts` (servidor) e `src/lib/faceCliente.ts` (navegador).

---

## Como rodar

Requisitos: Node.js 20+ e um PostgreSQL (local, Supabase, Neon, Railway…).

```bash
npm install
cp .env.example .env      # preencha DATABASE_URL e SESSION_SECRET
npm run setup             # cria as tabelas e o primeiro administrador
npm run dev               # http://localhost:3000
```

`npm run setup` pode ser executado quantas vezes for preciso: ele não apaga
dados, apenas garante que as tabelas existam e aplica a configuração do `.env`.

Gere uma chave de sessão segura com:

```bash
openssl rand -base64 32
```

### Primeiro acesso

O seed cria o administrador com os dados de `ADMIN_EMAIL` / `ADMIN_SENHA`
(padrão `admin@empresa.com` / `admin123`). **O sistema exige a troca da senha no
primeiro login.**

### Configurar o local da empresa

A cerca virtual pode ser definida na tela **Configurações** ou já no `.env`, para
que a instalação nasça configurada:

```env
EMPRESA_NOME="Comércio Absoluta"
EMPRESA_LATITUDE="-23.550520"
EMPRESA_LONGITUDE="-46.633308"
EMPRESA_RAIO_METROS="150"
EMPRESA_GEOFENCE_BLOQUEIA="false"   # "true" impede o registro fora do raio
```

Preencher latitude e longitude já liga a cerca. Para descobrir as coordenadas:
abra o Google Maps, clique com o botão direito sobre o ponto exato da loja e
clique nos números no topo do menu — isso copia `latitude, longitude`.

Rodar `npm run db:seed` de novo aplica os valores presentes no `.env` e
**preserva** o que não estiver definido lá, para não desfazer ajustes feitos
pela tela.

### Dados de demonstração (opcional)

```bash
npm run db:demo
```

Cria três funcionários com duas semanas de batidas e uma solicitação de ajuste
pendente, para conhecer as telas com o sistema populado. Senha de todos:
`Demo12345`. Não use em produção.

### Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Ambiente de desenvolvimento |
| `npm run build` / `npm start` | Build e execução em produção |
| `npm test` | Testes da lógica de jornada, fuso horário, geolocalização e comparação facial |
| `npm run setup` | Primeira instalação: cria as tabelas e o administrador |
| `npm run db:push` | Aplica o schema no banco |
| `npm run db:seed` | Cria configuração inicial e administrador |
| `npm run db:demo` | Popula dados de demonstração |
| `npm run db:studio` | Abre o Prisma Studio |

---

## ⚠️ Câmera exige HTTPS

Navegadores só liberam a câmera em `https://` ou em `localhost`. Se publicar em um
domínio próprio, **use HTTPS** — em HTTP simples a tela de ponto não funciona.
Vercel, Railway e Render já entregam HTTPS por padrão.

---

## Os dois perfis

### Funcionário

| Tela | O que faz |
| --- | --- |
| **Bater ponto** | Relógio, tipo de batida sugerido automaticamente, câmera com orientação de enquadramento e resumo do dia |
| **Meus registros** | Espelho do período, totais de horas e saldo, e envio de solicitações de ajuste |
| **Meu rosto** | Cadastro e remoção das próprias capturas faciais (recomendado 3) |

Tipos de batida: entrada, saída para intervalo, retorno do intervalo e saída. O
sistema recusa sequências impossíveis (duas entradas seguidas, saída sem entrada,
retorno sem intervalo aberto).

### Administrador

| Tela | O que faz |
| --- | --- |
| **Painel** | Quem está trabalhando, em intervalo ou sem registro no dia; alertas de atraso, cadastro facial pendente e batida fora do local |
| **Funcionários** | Criar acesso (gera senha provisória), editar cadastro e jornada, resetar senha, limpar biometria, desativar acesso |
| **Registros** | Todas as batidas com foto, confiança da validação e mapa da localização; lançamento manual e edição com motivo obrigatório |
| **Ajustes** | Aprovar ou recusar solicitações — aprovar aplica a mudança no espelho automaticamente |
| **Relatórios** | Espelho de ponto por período, com exportação CSV e impressão/PDF (com linhas de assinatura) |
| **Configurações** | Nome e fuso da empresa, cerca virtual, rigor facial, tolerância de atraso e auditoria recente |

---

## Regras de jornada

- **Horas trabalhadas**: soma dos pares entrada→saída. Um par em aberto (esqueceu de
  bater a saída) não gera tempo, apenas marca o dia como "em aberto".
- **Saldo**: trabalhado − previsto. Dias fora da escala não cobram jornada, e o que
  for trabalhado neles conta integralmente como extra.
- **Atraso**: diferença entre a primeira *entrada* e o horário previsto, além da
  tolerância. Dias sem entrada registrada não geram atraso.
- **Competência**: a batida é gravada em UTC, mas o dia é calculado no fuso da
  empresa — quem trabalha atravessando a meia-noite não tem a jornada partida.
- **Relatórios** nunca contam dias futuros como débito.

## Cerca virtual (geolocalização)

Em Configurações é possível definir a coordenada da empresa e um raio. Há dois modos:

- **Somente registrar**: grava a distância e sinaliza no painel quem bateu fora.
- **Bloquear**: impede o registro fora do raio.

A margem de erro do GPS é sempre descontada a favor do funcionário.

---

## Segurança e privacidade

- Senhas com bcrypt; sessão em JWT assinado, cookie `httpOnly` + `SameSite=Lax`, 12 h.
- Limite de tentativas de login por IP e por conta.
- Senha provisória obrigatoriamente trocada no primeiro acesso.
- Toda ação sensível (login, criação, reset de senha, alteração/exclusão de batida,
  recusa facial, ponto fora da cerca) vai para a tabela de auditoria.
- Funcionário com registros de ponto **não pode ser excluído**, apenas desativado —
  o histórico é documento trabalhista.
- O mesmo rosto não pode ser vinculado a duas pessoas.

### LGPD

Dado biométrico é **dado pessoal sensível** (art. 5º, II da LGPD). O sistema já cobre:

1. **Consentimento específico e destacado**: no primeiro acesso após a troca de
   senha, todo funcionário passa pela tela `/termos` — um termo cobrindo finalidade,
   base legal (CLT art. 74 §2º e Portaria MTP 671/2021), como o dado é armazenado
   (vetor matemático, não a foto), tempo de guarda e não compartilhamento — e só
   segue em frente ao marcar "Li e concordo" e clicar em aceitar. O aceite é
   registrado com data/hora no cadastro do funcionário e na auditoria
   (`TERMO_IMAGEM_ACEITO`), uma única vez. O texto está em `src/lib/termoUso.ts`.
2. **Alternativa para quem não consentir**: o funcionário pode recusar o
   reconhecimento facial sem perder o emprego — o gestor lança o ponto manualmente
   em Registros → Lançar ponto manualmente.
3. **Retenção e exclusão** — parcialmente automatizada: o admin pode apagar o
   cadastro facial de um funcionário a qualquer momento (Funcionário → Limpar
   cadastro facial), mas isso **não acontece automaticamente** ao desativar o
   acesso. O termo promete a eliminação ao fim do vínculo — hoje isso depende do
   admin lembrar de fazer essa limpeza manualmente no desligamento. Se quiser que
   a desativação apague a biometria automaticamente, é uma mudança pequena a
   pedir.

Sobre a **Portaria 671/2021 do MTE**: este sistema é um controle de ponto por
programa (REP-P). Um REP-P homologado exige requisitos formais adicionais —
Arquivo Fonte de Dados (AFD), Atestado Técnico e registro no INPI, entre outros —
que **não estão implementados aqui**. Para fiscalização trabalhista formal,
consulte seu contador antes de adotar.

---

## Estrutura

```
prisma/
  schema.prisma        modelo de dados
  seed.ts              configuração inicial + administrador
  demo.ts              dados de demonstração
public/models/         pesos do reconhecimento facial (~6,8 MB, versionados)
src/
  app/
    login/ trocar-senha/
    ponto/ meus-registros/ minha-biometria/     telas do funcionário
    admin/                                       telas do administrador
    api/                                         rotas de servidor
  components/                                    componentes de tela
  lib/
    datas.ts           fuso horário e competência
    jornada.ts         cálculo de horas, saldo, atraso e sequência
    face.ts            comparação facial (servidor)
    faceCliente.ts     captura e descriptor (navegador)
    geo.ts             distância e cerca virtual
    consultas.ts       painel do dia e espelho de ponto
tests/logica.test.ts   testes da lógica pura
```

Os pesos do modelo ficam no repositório de propósito: a aplicação não depende de
CDN externo e funciona em rede fechada.

---

## Publicar

1. Crie um Postgres gerenciado (Supabase, Neon, Railway) e copie a connection string.
2. Na Vercel (ou similar), configure `DATABASE_URL` e `SESSION_SECRET`.
3. Rode `npx prisma db push` apontando para o banco de produção e depois `npm run db:seed`.
4. Faça o primeiro login e troque a senha do administrador.

Para várias instâncias simultâneas, troque o limitador em memória
(`src/lib/limite.ts`) por Redis/Upstash — a assinatura das funções já está pronta
para isso.
