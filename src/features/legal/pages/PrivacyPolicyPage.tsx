import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { LegalDocumentLayout } from '../components/LegalDocumentLayout'
import { LegalSection } from '../components/LegalSection'
import { LEGAL_DOCUMENTS } from '../legal-documents'

const policy = LEGAL_DOCUMENTS.privacyPolicy

export function PrivacyPolicyPage() {
  useDocumentTitle('Política de Privacidade — ProFind')

  return (
    <LegalDocumentLayout
      title="Política de Privacidade"
      description="Como o ProFind trata dados pessoais no cadastro e na operação inicial do marketplace."
      version={policy.version}
      effectiveDate={policy.effectiveDate}
      effectiveDateLabel={policy.effectiveDateLabel}
      alternativeDocument={{
        label: 'Consultar Termos de Uso',
        href: '/termos-de-uso',
      }}
    >
      <LegalSection id="controlador" title="1. Controlador e alcance">
        <p>
          Para esta versão do MVP, o tratamento é identificado pela marca ProFind.
          A identificação civil ou empresarial completa do controlador, seu endereço
          e o canal dedicado aos titulares devem ser inseridos antes da operação
          comercial em produção.
        </p>
        <p>
          Esta Política cobre os dados tratados ao criar e utilizar uma conta ProFind.
          Serviços de terceiros acessados fora da plataforma possuem políticas próprias.
        </p>
      </LegalSection>

      <LegalSection id="dados-coletados" title="2. Dados tratados no MVP">
        <ul className="list-disc space-y-2 pl-5">
          <li>Nome e endereço de e-mail informados no cadastro.</li>
          <li>Identificador técnico da conta criado pelo Firebase Authentication.</li>
          <li>Versões dos Termos e desta Política aceitas, com data e hora do aceite.</li>
          <li>Dados técnicos essenciais à segurança, diagnóstico e funcionamento do serviço.</li>
          <li>Preferência de tema armazenada localmente no dispositivo.</li>
        </ul>
        <p>
          A senha é processada pelo Firebase Authentication. O documento de perfil
          do ProFind não armazena senha em texto simples.
        </p>
      </LegalSection>

      <LegalSection id="finalidades" title="3. Finalidades e bases legais">
        <p>Os dados são tratados para:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>criar, autenticar e proteger a conta;</li>
          <li>manter o perfil base necessário ao funcionamento do marketplace;</li>
          <li>registrar o aceite dos documentos aplicáveis;</li>
          <li>prevenir fraude, investigar falhas e cumprir obrigações legais;</li>
          <li>atender solicitações relacionadas aos direitos dos titulares.</li>
        </ul>
        <p>
          Conforme o contexto, as bases legais podem incluir execução de contrato ou
          procedimentos preliminares, cumprimento de obrigação legal, exercício regular
          de direitos e legítimo interesse após avaliação de necessidade e impacto.
          Quando consentimento for a base adequada, ele será solicitado de forma
          específica e poderá ser revogado. O aceite desta Política não transforma
          todos os tratamentos em tratamentos baseados em consentimento.
        </p>
      </LegalSection>

      <LegalSection id="compartilhamento" title="4. Operadores e compartilhamento">
        <p>
          O ProFind utiliza serviços Firebase, fornecidos pelo Google, para autenticação
          e banco de dados. Esses fornecedores tratam dados como operadores ou provedores
          de infraestrutura conforme seus contratos e políticas aplicáveis.
        </p>
        <p>
          Dados também poderão ser compartilhados quando exigido por lei, ordem válida,
          proteção de direitos ou resposta a incidente de segurança. O ProFind não deve
          vender dados pessoais.
        </p>
      </LegalSection>

      <LegalSection id="transferencia" title="5. Transferência internacional">
        <p>
          A infraestrutura dos fornecedores pode processar dados fora do Brasil. Antes
          da produção, a configuração e os instrumentos contratuais deverão ser revisados
          para assegurar mecanismo válido de transferência internacional conforme a LGPD.
        </p>
      </LegalSection>

      <LegalSection id="retencao" title="6. Retenção e eliminação">
        <p>
          Os dados serão mantidos pelo tempo necessário às finalidades descritas, à
          segurança do serviço e ao cumprimento de obrigações legais ou exercício de
          direitos. Encerrada a necessidade, serão eliminados ou anonimizados, salvo
          hipótese legal de conservação.
        </p>
      </LegalSection>

      <LegalSection id="seguranca" title="7. Segurança e incidentes">
        <p>
          São adotadas medidas técnicas e administrativas proporcionais ao MVP, incluindo
          autenticação gerenciada e controle de acesso aos dados. Nenhum sistema é
          absolutamente imune a riscos. Incidentes relevantes serão avaliados e comunicados
          aos titulares e à autoridade competente quando exigido pela legislação.
        </p>
      </LegalSection>

      <LegalSection id="direitos" title="8. Direitos dos titulares">
        <p>
          Nos termos da LGPD, o titular pode solicitar confirmação de tratamento, acesso,
          correção, anonimização, bloqueio ou eliminação quando cabíveis, informação sobre
          compartilhamentos, portabilidade conforme regulamentação, revisão de decisões
          automatizadas e demais direitos previstos em lei.
        </p>
        <p>
          Solicitações deverão ser atendidas após confirmação segura da identidade. O canal
          responsável por esses pedidos deve ser publicado antes da operação em produção.
        </p>
      </LegalSection>

      <LegalSection id="criancas" title="9. Crianças e adolescentes">
        <p>
          O MVP não é direcionado intencionalmente a crianças. Tratamentos envolvendo
          crianças ou adolescentes deverão observar seu melhor interesse, a representação
          legal aplicável e as exigências específicas da legislação antes de serem habilitados.
        </p>
      </LegalSection>

      <LegalSection id="armazenamento-local" title="10. Armazenamento local">
        <p>
          O ProFind usa armazenamento local estritamente necessário para lembrar a
          preferência entre temas claro, escuro e sistema. Tecnologias adicionais deverão
          ser documentadas e, quando necessário, depender de escolha válida do usuário.
        </p>
      </LegalSection>

      <LegalSection id="atualizacoes" title="11. Atualizações e contato">
        <p>
          Alterações materiais receberão nova versão e data de vigência. Quando exigido,
          um novo aceite será solicitado. A identificação completa do controlador e um
          canal para dúvidas e exercício de direitos são pendências obrigatórias da revisão
          jurídica anterior ao lançamento comercial.
        </p>
        <p>
          Referências oficiais:{' '}
          <a
            href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary underline underline-offset-4"
          >
            Lei Geral de Proteção de Dados Pessoais
          </a>{' '}
          e{' '}
          <a
            href="https://www.gov.br/anpd/pt-br/assuntos/direitos-dos-titulares"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary underline underline-offset-4"
          >
            orientações da ANPD aos titulares
          </a>
          .
        </p>
      </LegalSection>
    </LegalDocumentLayout>
  )
}
