#!/usr/bin/env python3
"""Generate public, script-free store policy pages from the audited app behavior."""
from pathlib import Path
from html import escape
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2] / 'web' / 'public' / 'legal'
BRANDS = {'barbacue': ('BARBACUE — Burguers na Brasa', 'barbacue.cog.ia.br', '#ba1720'),
          'chelas': ('Chelas Cocina Mexicana', 'chelas.hirableaiagents.com', '#a41927'),
          'barbadog': ('Barbadog', 'barbadog.hirableaiagents.com', '#243258')}
PAGES = {'privacy': 'Política de privacidade', 'terms': 'Termos de uso',
         'consent': 'Consentimentos e preferências', 'data-deletion': 'Exclusão de dados',
         'support': 'Suporte e contato'}
EMAIL = 'contato@hirableaiagents.com'

def render(slug, name, domain, color, page, body):
    nav = ' '.join(f'<a href="/legal/{slug}/{key}.html">{label}</a>' for key, label in PAGES.items())
    return f'''<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{PAGES[page]} — {escape(name)}</title><link rel="canonical" href="https://{domain}/legal/{slug}/{page}.html">
<style>:root{{color-scheme:light}}*{{box-sizing:border-box}}body{{margin:0;background:#f8f5ef;color:#24211e;font:17px/1.65 system-ui,sans-serif}}main{{max-width:800px;margin:32px auto;padding:clamp(20px,5vw,48px);background:white;border-top:6px solid {color};border-radius:12px}}h1{{font-size:clamp(28px,5vw,42px);line-height:1.15}}h2{{font-size:23px;margin-top:30px}}a{{color:{color};text-underline-offset:3px;overflow-wrap:anywhere}}nav{{display:flex;gap:12px 20px;flex-wrap:wrap;border-top:1px solid #ddd;padding-top:24px;margin-top:36px}}.brand{{font-weight:800;color:{color}}}.date,footer{{font-size:14px;color:#625c55}}.note{{padding:18px;background:#f7f3ee;border-radius:8px}}a:focus-visible{{outline:3px solid {color};outline-offset:4px}}</style></head>
<body><main><a class="brand" href="https://{domain}">{escape(name)}</a><h1>{PAGES[page]}</h1>
<p class="date">Atualizado em 8 de setembro de 2026 · Aplicativos Android e iOS</p>{body}
<nav aria-label="Informações e direitos">{nav}</nav><footer><p>{escape(name)} · Contato: <a href="mailto:{EMAIL}">{EMAIL}</a></p></footer></main></body></html>'''

def generate():
    for slug, (name, domain, color) in BRANDS.items():
        native = slug == 'barbacue'
        contact = f'<a href="mailto:{EMAIL}?subject={quote(name + " — Privacidade e suporte")}">{EMAIL}</a>'
        behavior = ('O aplicativo permite consultar o cardápio, montar o carrinho e solicitar pedidos de entrega, retirada ou mesa sem criar conta. '
                    'Nome, telefone, endereço quando necessário, itens, observações e escolha de pagamento são enviados para atender o pedido. '
                    'Carrinho, dados preenchidos e sessão de mesa podem ficar no armazenamento local para continuidade do atendimento.' if native else
                    'O aplicativo exibe o cardápio da marca, incluindo uma cópia local para consulta sem conexão. Não há criação de conta, checkout nem cadastro de cliente neste aplicativo. '
                    'Ao tocar em Pedir no iFood, você abre o serviço externo, onde preço, disponibilidade, conta, entrega e pagamento são confirmados.')
        ai = ('<h2>Atendimento opcional com IA</h2><p>Quando você autoriza o atendimento com IA, mensagens, histórico da conversa, carrinho e dados preenchidos no pedido '
              '(como nome, telefone, endereço e observações) são enviados pelo nosso servidor à OpenAI para interpretar e responder sua solicitação. '
              'Esse processamento pode ocorrer fora do Brasil. Não envie senhas, dados de cartão ou informações sensíveis. '
              'A autorização é solicitada antes do primeiro envio e pode ser revogada em Privacidade e ajuda. O cardápio permanece disponível sem IA. '
              'Revogar impede novos envios; para dados já tratados, utilize o canal de exclusão. '
              '<a href="https://openai.com/policies/privacy-policy/">Consulte também a política da OpenAI</a>.</p>' if native else '')
        sharing = ('O estabelecimento e fornecedores necessários ao funcionamento, como hospedagem, atendimento e pagamentos, tratam dados conforme a função desempenhada. '
                   'Dados de entrega podem ser encaminhados ao prestador responsável por realizá-la. A OpenAI participa somente do atendimento com IA autorizado.' if native else
                   'O servidor do cardápio, a hospedagem e provedores das imagens recebem requisições técnicas, que podem incluir IP e informações de conexão. '
                   'Ao sair para o iFood, os dados que você fornecer serão tratados por esse serviço conforme sua própria política: '
                   '<a href="https://privacidade.ifood.com.br/">Privacidade do iFood</a>.')
        privacy = f'''<p>Esta política se aplica ao aplicativo {escape(name)} e às interações com o estabelecimento identificado por essa marca. O canal de privacidade e suporte é {contact}.</p>
<h2>Como o aplicativo funciona</h2><p>{behavior}</p>
<h2>Dados e finalidades</h2><p>{sharing}</p><p>Requisições de rede podem gerar registros técnicos, como IP, data, endereço solicitado e informações de conexão, usados para disponibilizar e proteger o serviço. '
O aplicativo não solicita acesso a contatos, câmera, microfone ou localização do aparelho. Não inclui publicidade comportamental ou SDK de rastreamento publicitário. Não vendemos dados pessoais.</p>
{ai}<h2>Fundamentos do tratamento</h2><p>O atendimento solicitado utiliza dados necessários à execução do pedido; registros exigidos por lei atendem a obrigações legais. '
Medidas de segurança podem se apoiar em legítimo interesse, observados os direitos do titular. Funcionalidades opcionais que exigem consentimento dependem de uma escolha específica e revogável.</p>
<h2>Retenção e segurança</h2><p>Informações operacionais são mantidas enquanto necessárias ao pedido e atendimento. Registros fiscais, transacionais ou necessários à defesa de direitos podem ser conservados pelos prazos legais aplicáveis, '
com acesso restrito. A exclusão de dados elegíveis ocorre após a verificação da solicitação; a resposta informa o escopo, a previsão de conclusão e eventuais retenções obrigatórias. '
Remover o app apaga seus dados locais conforme o sistema operacional, mas não apaga pedidos já enviados nem cópias de segurança geridas pelo aparelho.</p>
<h2>Seus direitos</h2><p>Você pode pedir acesso, correção, informação sobre compartilhamento, portabilidade quando aplicável, revogação de consentimento e exclusão dos dados elegíveis, '
conforme a LGPD. Use {contact} ou a <a href="data-deletion.html">página de exclusão</a>. Podemos confirmar sua identidade com informações mínimas para evitar exclusão indevida.</p>
<h2>Crianças e alterações</h2><p>O serviço não é direcionado a crianças. Responsáveis podem contatar o suporte sobre dados de menores. Mudanças nesta política serão identificadas pela data acima; '
mudanças no uso opcional de IA exigem nova autorização no aplicativo.</p>'''.replace("'\n", '')
        terms = f'''<p>{behavior}</p><h2>Pedidos, preços e disponibilidade</h2><p>Confira os itens, quantidades, endereço, taxas, previsão e total antes de confirmar. '
A aceitação depende do funcionamento e da disponibilidade do estabelecimento. Imagens ilustram os produtos; ingredientes e opções constam no cardápio. '
Em caso de alergias ou restrições, confirme com o estabelecimento antes de pedir.</p><h2>Pagamento e cancelamento</h2><p>{'As opções apresentadas incluem Pix e pagamento na entrega, conforme disponibilidade. Nenhuma compra digital ou assinatura é oferecida.' if native else 'O pedido e o pagamento são concluídos no iFood, segundo as condições apresentadas antes da confirmação.'} '
Para cancelamentos, problemas de entrega ou reembolsos, procure o canal onde o pedido foi concluído. Os direitos assegurados pela legislação de consumo permanecem aplicáveis.</p>
<h2>Uso responsável</h2><p>Forneça informações corretas e não utilize o serviço para fraude ou acesso indevido. Quando disponível, o atendente com IA pode cometer erros; revise o resumo e o total do pedido antes de confirmar. '
O funcionamento depende de conexão para atualizações e serviços externos.</p><h2>Contato</h2><p>Dúvidas sobre o atendimento: {contact}.</p>'''.replace("'\n", '')
        consent = f'''<p>Consultar o cardápio não exige aceitar publicidade nem criar conta. Estas páginas públicas não instalam cookies de publicidade.</p>
<h2>Dados necessários</h2><p>{behavior} Informações necessárias ao atendimento não são uma autorização de marketing.</p>
{ai if native else '<h2>Serviços externos</h2><p>A abertura do iFood é uma ação sua. Preferências, permissões e eventuais consentimentos desse serviço são geridos no próprio iFood.</p>'}
<h2>Preferências</h2><p>{'No app, abra Privacidade e ajuda e toque em Revogar consentimento de IA para impedir novos envios até uma nova autorização. A escolha fica salva neste aparelho.' if native else 'Este aplicativo não oferece notificações promocionais, anúncios personalizados nem atendimento com IA.'} '
Para outros pedidos relacionados a consentimento ou dados já tratados, contate {contact}.</p>'''.replace("'\n", '')
        deletion = f'''<p class="note">O aplicativo {escape(name)} não cria conta de usuário. Você pode solicitar a exclusão de dados tratados pelo estabelecimento sem precisar instalar o app ou fazer login nesta página.</p>
<h2>Como solicitar</h2><ol><li>Envie um e-mail para {contact} com o assunto “Exclusão de dados — {escape(name)}”.</li>
<li>Informe a marca, o telefone ou e-mail usado no atendimento e, se tiver, o número do pedido. Não envie senha, documento completo nem dados bancários.</li>
<li>O suporte verificará a solicitação e informará o escopo da exclusão, prazo previsto e eventuais registros sujeitos à retenção legal.</li></ol>
<h2>O que pode ser removido</h2><p>Dados de contato, atendimento e demais dados pessoais que não precisem ser conservados para obrigações legais ou defesa de direitos. '
Registros fiscais e transacionais podem ter retenção obrigatória e serão identificados na resposta. Não há apagamento imediato ao clicar no link de e-mail.</p>
<h2>No aparelho e em outros serviços</h2><p>Excluir o aplicativo remove o armazenamento local conforme as opções do Android ou iOS; backups do sistema são geridos nas configurações do aparelho. '
Pedidos já enviados não são apagados ao desinstalar. Dados de contas e pedidos feitos no iFood devem ser geridos pelo próprio iFood. '
{'Para mensagens enviadas ao atendimento com IA, mencione esse uso na solicitação; revogar o consentimento interrompe envios futuros.' if native else ''}</p>'''.replace("'\n", '')
        support = f'''<p>Precisa de ajuda com {escape(name)}? Escreva para {contact}.</p><h2>Para agilizar o atendimento</h2><p>Informe a marca, se usa Android ou iOS, a versão do aplicativo e uma descrição do problema. '
Se houver um pedido, inclua seu número e o canal de compra. Evite enviar dados sensíveis ou capturas que mostrem informações de outras pessoas.</p>
<h2>Pedidos e entrega</h2><p>{'Para pedidos feitos no aplicativo, utilize este canal ou o atendimento do estabelecimento mostrado no cardápio.' if native else 'Para acompanhar, cancelar ou pedir ajuda com uma compra finalizada no iFood, use Ajuda no respectivo pedido dentro do iFood.'}</p>
<h2>Privacidade</h2><p>Para acesso, correção ou remoção, veja <a href="data-deletion.html">Exclusão de dados</a>. '
Nenhuma conta ou senha é necessária para consultar estas informações.</p>'''.replace("'\n", '')
        folder = ROOT / slug
        folder.mkdir(parents=True, exist_ok=True)
        for page, body in dict(privacy=privacy, terms=terms, consent=consent, **{'data-deletion': deletion, 'support': support}).items():
            (folder / f'{page}.html').write_text(render(slug, name, domain, color, page, body))
    print(f'Generated 15 pages in {ROOT}')

if __name__ == '__main__':
    generate()
