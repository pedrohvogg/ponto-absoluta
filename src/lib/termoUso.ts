/**
 * Texto do termo de consentimento para uso de imagem/biometria facial (LGPD),
 * exigido do funcionário antes do primeiro uso do reconhecimento facial.
 *
 * Mantido em um único lugar para que a tela de aceite e qualquer exportação
 * (auditoria, impressão) usem sempre o mesmo texto.
 */

export type SecaoTermo = { titulo: string; paragrafos: string[] };

export function secoesTermoUso(nomeEmpresa: string, salvarFoto: boolean): SecaoTermo[] {
  return [
    {
      titulo: "1. Finalidade",
      paragrafos: [
        `Sua imagem facial é utilizada exclusivamente para confirmar sua identidade no momento de bater o ponto (entrada, intervalo e saída), permitindo que a ${nomeEmpresa} registre corretamente sua jornada de trabalho. Não é usada para nenhuma outra finalidade.`,
      ],
    },
    {
      titulo: "2. Base legal",
      paragrafos: [
        "O registro de jornada de trabalho é uma obrigação prevista no art. 74, §2º da CLT e na Portaria MTP nº 671/2021. Como a biometria facial é um dado pessoal sensível (art. 5º, inciso II, da LGPD), o uso especificamente desse método de identificação depende do seu consentimento livre, específico e informado (art. 7º, inciso I, e art. 11, inciso I, da LGPD), que você manifesta ao aceitar este termo.",
      ],
    },
    {
      titulo: "3. Armazenamento e segurança",
      paragrafos: [
        "Sua imagem não é gravada como foto para fins de comparação: no momento da captura, seu navegador converte o formato do seu rosto em um código matemático (um conjunto de números, chamado vetor biométrico), e é apenas esse código — não a fotografia — que é enviado e armazenado nos servidores da " +
          nomeEmpresa +
          ". Não é possível reconstruir sua imagem a partir desse código.",
        ...(salvarFoto
          ? [
              "Adicionalmente, uma miniatura da sua selfie é guardada a cada registro de ponto, como comprovante para conferência do RH em caso de dúvida ou contestação.",
            ]
          : []),
        "O acesso a esses dados é restrito aos administradores autorizados do sistema, protegido por senha e conexão criptografada (HTTPS).",
      ],
    },
    {
      titulo: "4. Tempo de guarda",
      paragrafos: [
        "Seus dados biométricos serão mantidos apenas durante a vigência do seu contrato de trabalho. Ao término do vínculo empregatício, o cadastro facial será eliminado, sendo preservados apenas os registros de ponto já realizados, conforme exigido pela legislação trabalhista para fins de fiscalização e prova.",
      ],
    },
    {
      titulo: "5. Não compartilhamento",
      paragrafos: [
        "Sua imagem e seus dados biométricos não serão: utilizados para fins de marketing ou publicidade; utilizados para vigilância contínua ou monitoramento de comportamento; compartilhados, vendidos ou repassados a terceiros, exceto quando exigido por lei ou ordem judicial.",
      ],
    },
    {
      titulo: "6. Seus direitos",
      paragrafos: [
        `Conforme o art. 18 da LGPD, você pode, a qualquer momento, solicitar ao responsável pelo sistema na ${nomeEmpresa}: confirmação de que seus dados são tratados; acesso aos dados; correção de dados incompletos ou desatualizados; e informações sobre o compartilhamento de dados.`,
      ],
    },
    {
      titulo: "7. Se você não concordar",
      paragrafos: [
        "A recusa em usar o reconhecimento facial não impede seu registro de ponto: o responsável poderá lançar manualmente suas batidas, mediante sua presença ou confirmação, sem prejuízo à sua contratação ou permanência no emprego.",
      ],
    },
  ];
}

export const TEXTO_ACEITE =
  'Ao clicar em "Li e aceito", você confirma que leu, compreendeu e concorda com este termo, e autoriza o uso da sua imagem/biometria facial exclusivamente para os fins aqui descritos.';
