import { X, ShieldCheck, FileText } from "lucide-react";

export const TERMS_VERSION = "2026-10-04-v1";
export const DISCLAIMER_VERSION = "2026-10-04-v1";

export const TERMS_TEXT = "TERMOS E CONDIÇÕES DE USO DA KIRA\n\n1. Aceitação. Ao criar uma conta, o usuário declara que leu e concorda com estes Termos e com o Aviso Legal e Descargo de Responsabilidade exibidos no cadastro.\n2. Serviço. A Kira fornece recursos baseados em inteligência artificial, incluindo conversação, análise de conteúdo, geração de código, projetos, imagens e outras funções disponibilizadas ao longo do tempo.\n3. Conta. O usuário é responsável por manter suas credenciais seguras e pelas atividades realizadas em sua conta.\n4. Uso permitido. A Kira deve ser usada de forma lícita e responsável. É proibido usar o serviço para violar leis, direitos de terceiros, propriedade intelectual, privacidade, segurança ou para distribuir conteúdo malicioso.\n5. Conteúdo do usuário. O usuário é responsável por possuir os direitos e autorizações necessários sobre materiais que enviar à Kira.\n6. Conteúdo gerado. Resultados produzidos por IA podem conter erros, omissões, conteúdo inadequado, código inseguro ou referências imprecisas. O usuário deve revisar e testar os resultados antes de utilizá-los.\n7. Serviços de terceiros. A Kira pode depender de provedores externos de IA, hospedagem, banco de dados, e-mail e outros serviços. Esses serviços podem possuir termos, políticas, limites e indisponibilidades próprios.\n8. Disponibilidade. Não há garantia de operação ininterrupta, ausência de erros ou disponibilidade permanente de modelos e integrações externas.\n9. Propriedade intelectual. O usuário não deve presumir que conteúdo gerado por IA é exclusivo ou automaticamente livre de direitos de terceiros. É responsabilidade do usuário realizar as verificações necessárias antes de publicação ou uso comercial.\n10. Alterações. Estes Termos podem ser atualizados. Mudanças materiais poderão exigir nova aceitação antes da continuidade do uso da Kira.\n11. Suspensão. O acesso poderá ser restringido quando necessário para segurança, cumprimento legal, prevenção de abuso ou proteção do serviço e de terceiros.\n12. Contato e legislação. A versão publicada pela Kira deve ser adaptada com os dados do responsável pelo serviço, canal de contato, legislação aplicável e foro após revisão jurídica apropriada.";
export const DISCLAIMER_TEXT = "AVISO LEGAL E DESCARGO DE RESPONSABILIDADE\n\nA Kira utiliza sistemas de inteligência artificial. Ao criar uma conta, o usuário reconhece e compreende que:\n\n1. A inteligência artificial pode produzir respostas incorretas, incompletas, desatualizadas ou inventadas, mesmo quando apresentadas com confiança.\n2. Informações geradas pela Kira não substituem aconselhamento médico, jurídico, financeiro, contábil, de segurança ou qualquer outro serviço profissional qualificado.\n3. Decisões de alto impacto não devem ser tomadas exclusivamente com base em respostas da Kira. O usuário deve consultar fontes adequadas e profissionais qualificados quando necessário.\n4. Código, scripts, configurações e projetos gerados devem ser revisados, testados e auditados antes de execução, publicação ou uso em produção. A execução de código e comandos é responsabilidade do usuário.\n5. Imagens, textos, áudio, música e outros conteúdos gerados ou transformados por IA podem exigir verificação de direitos autorais, marcas, licenças, direitos de imagem e outros direitos de terceiros antes de uso ou distribuição.\n6. A Kira pode utilizar serviços e modelos de terceiros. Resultados, disponibilidade, retenção e processamento por esses serviços podem estar sujeitos às políticas dos respectivos provedores.\n7. Nenhum sistema de IA é livre de falhas. O usuário assume a responsabilidade por revisar os resultados e avaliar se são adequados ao uso pretendido.\n8. Na máxima extensão permitida pela legislação aplicável, o serviço é fornecido sem garantia de que toda resposta, arquivo ou resultado seja correto, completo ou adequado a uma finalidade específica.\n9. Este aviso não elimina direitos que não possam ser excluídos ou limitados por lei, nem impede o usuário de exercer direitos previstos na legislação aplicável.\n\nAO MARCAR A CAIXA DE ACEITAÇÃO, O USUÁRIO DECLARA QUE LEU ESTE AVISO, COMPREENDE AS LIMITAÇÕES DA INTELIGÊNCIA ARTIFICIAL E CONCORDA EM NÃO TRATAR AS RESPOSTAS DA KIRA COMO GARANTIA DE RESULTADO.";

function Doc({ title, version, text }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display font-semibold text-paper text-sm">{title}</h3>
        <span className="text-[10px] font-mono text-mist">Versão {version}</span>
      </div>
      <div className="whitespace-pre-line text-xs sm:text-sm leading-relaxed text-mist font-body">{text}</div>
    </section>
  );
}

export function LegalContent() {
  return (
    <div className="space-y-7">
      <Doc title="Termos e Condições de Uso" version={TERMS_VERSION} text={TERMS_TEXT} />
      <div className="border-t border-line" />
      <Doc title="Aviso Legal e Descargo de Responsabilidade" version={DISCLAIMER_VERSION} text={DISCLAIMER_TEXT} />
      <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs leading-relaxed text-mist">
        Estes documentos são uma base operacional para a Kira e devem passar por revisão jurídica antes de uso comercial definitivo, especialmente para adequação à legislação e aos dados do responsável pelo serviço.
      </div>
    </div>
  );
}

export default function LegalModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-5">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[90vh] rounded-2xl border border-line bg-panel shadow-2xl flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-neon" /><h2 className="font-display font-semibold text-paper">Termos, Privacidade e Responsabilidade</h2></div>
          <button type="button" onClick={onClose} className="text-mist hover:text-paper"><X size={18} /></button>
        </header>
        <div className="p-5 overflow-y-auto"><LegalContent /></div>
      </div>
    </div>
  );
}
