import { LegalDocumentLayout } from '../components/LegalDocumentLayout'
import { LegalSection } from '../components/LegalSection'
import { LEGAL_DOCUMENTS } from '../legal-documents'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'

const terms = LEGAL_DOCUMENTS.terms

export function TermsOfUsePage() {
  useDocumentTitle('Termos de Uso — ProFind')

  return (
    <LegalDocumentLayout
      title="Termos de Uso"
      description="Regras essenciais para criar uma conta e utilizar o marketplace ProFind com responsabilidade."
      version={terms.version}
      effectiveDate={terms.effectiveDate}
      effectiveDateLabel={terms.effectiveDateLabel}
      alternativeDocument={{
        label: 'Consultar Política de Privacidade',
        href: '/politica-de-privacidade',
      }}
    >
      <LegalSection id="aceitacao" title="1. Aceitação e escopo">
        <p>
          Estes Termos regulam o acesso ao ProFind. Ao concluir o cadastro, a
          pessoa usuária declara que leu e aceitou a versão identificada acima.
        </p>
        <p>
          O ProFind é um marketplace que aproxima pessoas interessadas em
          serviços e profissionais. Estes Termos não substituem os acordos
          específicos que venham a ser celebrados diretamente entre usuários.
        </p>
      </LegalSection>

      <LegalSection id="conta" title="2. Conta e credenciais">
        <ul className="list-disc space-y-2 pl-5">
          <li>Informe dados verdadeiros, atuais e suficientes para sua identificação.</li>
          <li>Mantenha sua senha confidencial e não permita o uso da conta por terceiros.</li>
          <li>Comunique pelos canais oficiais qualquer suspeita de acesso indevido.</li>
          <li>Use somente uma conta por identidade, salvo autorização expressa do ProFind.</li>
        </ul>
        <p>
          A pessoa usuária responde pelas atividades realizadas com suas
          credenciais, observadas as hipóteses legais de fraude ou falha de segurança.
        </p>
      </LegalSection>

      <LegalSection id="papel-plataforma" title="3. Papel do ProFind">
        <p>
          O ProFind fornece a infraestrutura digital de aproximação. Salvo
          indicação expressa em funcionalidade própria, não executa o serviço
          anunciado, não mantém vínculo empregatício com profissionais e não é
          parte automática da contratação realizada entre usuários.
        </p>
        <p>
          Informações apresentadas por usuários devem ser avaliadas antes de
          qualquer decisão. O ProFind poderá adotar medidas de moderação e
          segurança, sem prometer verificação absoluta de toda informação publicada.
        </p>
      </LegalSection>

      <LegalSection id="responsabilidades" title="4. Responsabilidades dos usuários">
        <p>
          Clientes devem descrever suas necessidades de forma lícita e respeitosa.
          Profissionais respondem pela exatidão de suas qualificações, disponibilidade
          e capacidade legal ou técnica para prestar os serviços oferecidos.
        </p>
        <p>
          As partes são responsáveis por alinhar escopo, preço, prazo, condições de
          execução, garantias e obrigações tributárias aplicáveis à relação entre elas.
        </p>
      </LegalSection>

      <LegalSection id="condutas-proibidas" title="5. Condutas proibidas">
        <ul className="list-disc space-y-2 pl-5">
          <li>Praticar fraude, discriminação, assédio, ameaça ou atividade ilícita.</li>
          <li>Usar identidade, conteúdo ou credenciais de terceiros sem autorização.</li>
          <li>Tentar comprometer a segurança, disponibilidade ou integridade da plataforma.</li>
          <li>Coletar dados de outros usuários fora das finalidades legítimas do serviço.</li>
          <li>Publicar conteúdo enganoso, ilegal ou que viole direitos de terceiros.</li>
        </ul>
      </LegalSection>

      <LegalSection id="disponibilidade" title="6. Disponibilidade e limitações">
        <p>
          O ProFind busca manter a plataforma disponível e segura, mas o MVP pode
          passar por manutenção, indisponibilidade ou evolução técnica. Nenhuma
          disposição destes Termos exclui direitos ou responsabilidades que não
          possam ser afastados pela legislação brasileira.
        </p>
      </LegalSection>

      <LegalSection id="suspensao" title="7. Suspensão e encerramento">
        <p>
          Contas poderão ser restringidas ou encerradas quando houver indício de
          fraude, risco à segurança, violação destes Termos ou obrigação legal,
          respeitados contraditório e informação quando cabíveis. A pessoa usuária
          poderá solicitar o encerramento conforme os canais disponibilizados.
        </p>
      </LegalSection>

      <LegalSection id="alteracoes" title="8. Alterações destes Termos">
        <p>
          Mudanças materiais serão identificadas por nova versão e data de vigência.
          Quando necessário, o ProFind solicitará novo aceite antes da continuidade
          de uso. O histórico de aceite deve conservar a versão aplicável ao usuário.
        </p>
      </LegalSection>

      <LegalSection id="legislacao" title="9. Legislação e solução de conflitos">
        <p>
          Aplicam-se as leis brasileiras, inclusive o Código Civil, o Marco Civil da
          Internet e, quando caracterizada relação de consumo, o Código de Defesa do
          Consumidor. Fica preservado o foro legalmente assegurado à pessoa consumidora.
        </p>
        <p>
          Referências oficiais:{' '}
          <a
            href="https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary underline underline-offset-4"
          >
            Marco Civil da Internet
          </a>{' '}
          e{' '}
          <a
            href="https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary underline underline-offset-4"
          >
            Código de Defesa do Consumidor
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="contato" title="10. Identificação e contato">
        <p>
          Antes da disponibilização comercial, esta seção deverá ser complementada
          com a identificação civil ou empresarial do responsável pelo ProFind,
          endereço aplicável e canal oficial para notificações relacionadas a estes Termos.
        </p>
      </LegalSection>
    </LegalDocumentLayout>
  )
}
