# Plano de implementação — Barbearia Prime

## Objetivo e escopo

Construir um SaaS web multi-barbearia, responsivo e em português do Brasil, com os fluxos e módulos da especificação enviada: isolamento de dados por tenant, administração da plataforma e da barbearia, perfis de acesso, agendamento público, agenda, clientes, financeiro, comissões, planos, fidelidade, promoções, estoque, avaliações e relatórios. A entrega final solicitada inclui dados demonstrativos para duas barbearias, contas de teste adequadas, instruções rápidas e publicação. O desenvolvimento será organizado em entregas verticais; esta ordem organiza o trabalho, não remove requisitos do escopo.

Os parâmetros locais serão moeda R$, data dd/mm/aaaa e fuso America/Sao_Paulo. Nenhum pagamento online, integração de cobrança, disparo automático de WhatsApp ou emissão fiscal será introduzido: pagamentos serão registrados presencialmente e o WhatsApp abrirá links wa.me com mensagem preparada.

## Arquitetura e abordagem

- **Frontend:** React 19 + TypeScript, Vite e Tailwind já instalados; rotas da aplicação com Wouter e chamadas tipadas via tRPC/React Query. Interfaces de cliente mobile-first, painel responsivo e navegação lateral no desktop.
- **Backend:** Express/tRPC já preparado no starter, com autenticação interna por e-mail e senha (explicitamente solicitada), hash seguro de senhas, sessão protegida, recuperação por token de uso único e autorização por papel. A entrega de e-mail de recuperação dependerá de credenciais de um provedor de e-mail, a serem configuradas antes de habilitar o envio real; não simular envio.
- **Persistência:** MySQL gerenciado e Drizzle. Todas as tabelas de negócios levam `barbershopId` (ou uma relação inequívoca com o tenant); as consultas de usuário e barbeiro aplicam escopo de tenant no servidor. Acesso do Super Administrador é separado e explícito. Migrações aditivas e registros demonstrativos identificados para não sobrescrever dados do usuário.
- **Segurança e privacidade:** senha não armazenada em texto puro; validação de sessão/perfil no servidor; isolamento testável entre tenants; só exibir dados mínimos do cliente na página pública; limitar consultas públicas por identificador e token/validação segura; validar telefone, slug e entradas; acesso restrito a dados financeiros; práticas de minimização, retenção e direitos LGPD. Segredos só em configuração protegida, nunca no cliente.
- **Datas e horários:** armazenar instantes de agenda com referência temporal clara e apresentar/validar no fuso `America/Sao_Paulo`; cálculo de disponibilidade usa expediente, intervalos, folgas, serviços suportados, barbeiro, duração combinada, conflitos e antecedência mínima.
- **Saídas:** exportações de relatório em PDF e Excel; confirmação de agendamento pode gerar arquivo/link de calendário no celular; ícones via biblioteca já disponível no projeto.

## Sequência de entregas internas

1. **Fundação multi-tenant e identidade:** esquema de barbearias, usuários, papéis, sessões, estados do SaaS (teste de sete dias, ativa, inadimplente, bloqueada), slugs únicos/editáveis, configurações de marca e autorização central. Cadastro demonstrativo inicial. O Super Administrador controla estado, mensalidade, vencimento, pagamento manual e métricas da plataforma.
2. **Agendamento de ponta a ponta:** cadastro de serviços e equipe, disponibilidade e regras de agenda; página pública por slug, seleção múltipla de serviços, cálculo de preço/duração, barbeiro ou qualquer disponível, horários sem conflito, captura de nome/WhatsApp, confirmação, calendário, consulta/cancelamento/reagendamento e lista de espera. Botões wa.me sem automação de mensagens.
3. **Operação diária e clientes:** agenda dia/semana/mês por profissional, transições de status, atendimento concluído com ajustes de serviços/produtos/pagamento, clientes deduplicados por WhatsApp, histórico, aniversariantes/inativos e anexos/galeria quando armazenamento estiver configurado. Papéis de barbeiro e recepcionista com permissões específicas.
4. **Financeiro e comissões:** receitas/despesas e categorias, caixa diário, meios de pagamento presencial e taxa de maquininha, recorrências/contas a pagar, dashboard e filtros, relatórios/exportações. Regras por barbeiro para comissão fixa, percentual por serviço, valor por serviço, misto, cadeira, produtos e atendimentos de planos; fechamentos, adiantamentos, pagamentos e lançamentos financeiros derivados.
5. **Retenção e estoque:** criação/assinatura/ciclo/uso/status de planos de clientes; pontos, cupons, promoções e controles de exibição; inventário, entradas/saídas, mínimos, venda integrada ao atendimento e margem; avaliações pós-atendimento e opção de mostrar publicamente. Recursos promocionais podem ser ativados separadamente pelo dono.
6. **Acabamento e entrega:** validar isolamento e permissões, configurar dados de exemplo para duas barbearias, preparar credenciais de teste de forma segura, instruções rápidas, verificar build/rotas/funcionalidades e publicar a versão aprovada. Publicação somente na etapa final; nenhuma publicação automática será habilitada.

## Organização prevista do projeto

- `client/src/pages/`: início/entradas, painel, agenda, cadastros, clientes, finanças, comissões, planos/marketing, estoque, avaliações, configurações, superadmin e página pública de agendamento.
- `client/src/components/`: shell do painel, navegação responsiva, formulários, calendários, cartões e componentes comuns acessíveis.
- `client/src/lib/`: cliente tRPC, formatação pt-BR/data/moeda, cálculos de duração e utilitários da UI.
- `server/`: routers tRPC separados por domínio, serviços de agenda/financeiro/commissionamento, autenticação e autorização, operações de exportação e armazenamento.
- `drizzle/`: schema relacional, relações, migrações e seed demonstrativo idempotente.
- `shared/`: enums, validações Zod e tipos comuns compartilhados por servidor e cliente.
- `public/manus-routes.json`: manifesto sincronizado com todas as rotas de página do frontend antes da inicialização do servidor.

## Direção de design

A especificação pede visual moderno e profissional, e os conceitos visuais já apresentados apontam para uma direção premium. Três opções consideradas: **barbearia editorial premium** (0,074), **industrial contemporânea** (0,061), **minimalismo urbano claro** (0,038). A implementação seguirá a opção premium.

- **Movimento de design:** editorial de barbearia contemporânea, com referências de identidade de grooming premium e painéis SaaS discretos.
- **Princípios centrais:** hierarquia clara; confiança e legibilidade; ações comuns em poucos passos; densidade visual controlada.
- **Filosofia de cores:** carvão e grafite trazem sobriedade; marfim aquece áreas de leitura; dourado envelhecido destaca ações e estados importantes sem ostentação. Contraste acessível e estados semânticos também terão cores legíveis.
- **Paradigma de layout:** shell de gestão com navegação lateral no desktop e menu compacto no celular; áreas de trabalho que priorizam agenda/tarefas do dia; página de agendamento em fluxo vertical de passos, otimizada para uma mão no celular.
- **Elementos de assinatura:** acentos metálicos discretos, cartões de serviço com ícones robustos e uma faixa-resumo fixa em telas de seleção/agendamento.
- **Interação:** ações primárias explícitas, feedback imediato para preço/duração e estados de confirmação; evitar dependência de hover e suportar toque/teclado.
- **Animação:** transições breves e funcionais ao selecionar serviço, avançar etapa e mudar status; respeitar `prefers-reduced-motion`.
- **Tipografia:** títulos editoriais em serifada de alto contraste combinados com sans-serif neutra e altamente legível na interface; números de preço e agenda com algarismos tabulares.
- **Essência da marca:** gestão e agendamento para barbearias independentes, reunidos em uma plataforma organizada — elegante, prática e confiável.
- **Voz:** concisa, profissional e acolhedora; exemplo de CTA: “Escolher horário”; exemplo de status: “Sua agenda está em dia.”
- **Marca/logotipo:** símbolo geométrico inspirado em navalha/monograma, acompanhado por wordmark tipográfico original, sem depender de logotipo gerado como texto.
- **Cor proprietária:** dourado envelhecido, usado com moderação em CTAs, seleção e indicadores.

## Premissas e dependências explícitas

- O banco gerenciado é compartilhado por desenvolvimento e produção; alterações de esquema e seed serão aditivas e não apagarão dados existentes.
- O escopo pede recuperação por e-mail, mas não define provedor. O fluxo ficará preparado para tokens seguros; o envio real depende da configuração de um provedor e suas credenciais.
- A galeria de imagens de clientes depende de armazenamento durável e controles de acesso adequados; não será exposta publicamente por padrão.
- Valores de mensalidade das barbearias e preço dos planos de clientes serão configuráveis no painel, sem inventar uma tabela comercial fixa.
- Registros de teste serão marcados como demonstração, sem representar receitas reais.
- A publicação é desejada na especificação, mas ocorrerá apenas após a implementação e revisão, sem ativar publicação automática.


## Ajuste de escopo — landing page comercial

A rota `/` passará a apresentar o SaaS de agendamento e gestão de barbearias com inspiração estrutural na página indicada pelo usuário, sem copiar sua identidade, textos ou imagens. A landing explicará a proposta, apresentará imagens capturadas das telas reais já existentes no sistema, organizará benefícios e apresentará duas assinaturas: Top por R$ 59,90/mês e Premium por R$ 149,90/mês; ambas com teste grátis de 7 dias e as mesmas funcionalidades atuais da plataforma; somente o Premium inclui IA no WhatsApp. CTAs de experimentar, assinar ou saber mais abrirão conversa com o WhatsApp +55 61 92005-1259 com mensagem contextualizada sobre o plano/ação. O acesso de equipe ao painel continuará disponível por `/login`; as rotas do app e de agendamento não serão alteradas. A página será responsiva e manterá o tom editorial premium de carvão, marfim e dourado envelhecido.
