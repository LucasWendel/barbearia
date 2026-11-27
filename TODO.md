# TODO — Barbearia Prime

Critérios de entrega preservados da especificação aprovada. Os itens permanecem abertos até haver evidência funcional correspondente.

## 1. Plataforma SaaS multi-barbearia
- [ ] Um único sistema e domínio atende várias barbearias de forma independente; cada barbearia é um tenant com isolamento total de clientes, agenda, financeiro, estoque e comissões.
- [ ] Cada barbearia personaliza nome, logo e cores principais, exibidos na página pública de agendamento e no painel.
- [ ] O sistema gera automaticamente link próprio a partir do nome (ex.: `dominio.com/nome-da-barbearia`); link único, sem acentos nem espaços, editável pelo dono e com validação de duplicidade; link abre a página pública da barbearia.
- [ ] Nova barbearia recebe 7 dias de teste grátis; ao fim, sem pagamento registrado pelo Super Administrador, acesso bloqueado e dados mantidos.
- [ ] Não há limite de barbeiros, serviços ou clientes por barbearia.
- [ ] Site responsivo em celular e desktop, rápido, fácil de usar sem instalação, em português do Brasil; moeda R$, datas dd/mm/aaaa e fuso `America/Sao_Paulo`.

## 2. Identidade, acesso e administração da plataforma
- [ ] Super Administrador tem painel próprio para cadastrar, ativar, bloquear e excluir barbearias; consultar estados em teste, ativa, inadimplente e bloqueada; controlar mensalidade por barbearia (valor, vencimento e pagamento registrado manualmente); ver total de barbearias, ativas, em teste e faturamento do sistema.
- [ ] Dono tem acesso total somente à própria barbearia: agenda, financeiro, comissões, planos, estoque, fidelidade, relatórios e configurações.
- [ ] Barbeiro vê somente a própria agenda, atendimentos e comissões.
- [ ] Recepcionista acessa agenda, clientes e caixa, sem acesso a relatórios financeiros sensíveis.
- [ ] Cliente não precisa de login; identifica-se somente por nome e número de WhatsApp.
- [ ] Perfis internos entram com e-mail e senha, têm recuperação de senha e permissões por perfil.

## 3. Página pública de agendamento e área do cliente
- [x] No template público da barbearia, exibir um banner cuja imagem o administrador da unidade possa substituir quando quiser; logo abaixo, mostrar três botões fáceis: “Agendar meu corte”, “Consultar meus agendamentos” e “Ver ofertas e planos”, levando cada um à seção correspondente.
- [ ] Página simples, visual e pensada para celular, com logo e nome da barbearia no topo.
- [ ] Serviços exibidos em cartões com ícones grandes e intuitivos (exemplos: tesoura para cabelo, navalha para barba, pincel/lápis para sobrancelha), nome, preço e duração; lista dinâmica dos serviços cadastrados pela barbearia.
- [ ] Cliente pode selecionar múltiplos serviços. Ao selecionar ou desmarcar, barra fixa inferior atualiza em tempo real valor total e tempo total estimado.
- [ ] Antes de confirmar, cliente vê serviços escolhidos, total em R$ e duração.
- [ ] Fluxo em poucos passos: (1) escolher serviços, (2) barbeiro ou “qualquer barbeiro disponível”, (3) data e horário disponíveis considerando duração total dos serviços, (4) nome e WhatsApp, (5) confirmar.
- [ ] Após agendamento, exibir confirmação com resumo e botão para adicionar ao calendário do celular.
- [ ] Cliente pode consultar, cancelar ou reagendar informando o WhatsApp.
- [ ] Quando ativados pelo dono, exibir planos disponíveis, promoções, cupom de desconto, avaliações e fotos de trabalhos; recurso desligado não aparece publicamente.
- [ ] Cliente com plano ativo é identificado pelo WhatsApp; serviços incluídos no plano aparecem com valor zerado e total recalculado.

## 4. Agenda, serviços, equipe e atendimento
- [ ] Agenda visual por dia, semana e mês, com visão por barbeiro.
- [ ] Cadastro ilimitado de serviços: nome, ícone selecionado em biblioteca (cabelo, barba, sobrancelha, pigmentação, hidratação, relaxamento e outros), preço, duração, categoria e opção ativar/desativar; serviços ativos aparecem automaticamente na página pública.
- [ ] Cadastro de barbeiros com horários de trabalho, folgas, intervalos e serviços que atendem.
- [ ] Bloquear conflitos de agendamento e horários fora do expediente.
- [ ] Estados de atendimento: agendado, confirmado, em atendimento, concluído, cancelado e faltou.
- [ ] Antecedência mínima para cancelamento configurável pelo dono.
- [ ] Fila de espera: quando horário estiver ocupado, cliente pode entrar na lista; barbearia vê a fila quando surgir vaga para encaixe.
- [ ] Não enviar WhatsApp automaticamente; botão “chamar no WhatsApp” abre conversa com mensagem pronta via link `wa.me`.
- [ ] Ao concluir atendimento, permitir ajustar serviços, adicionar produtos e registrar forma de pagamento.

## 5. Gestão financeira, caixa e relatórios
- [ ] Registrar entradas de atendimentos concluídos, venda de produtos, mensalidades de planos e outras receitas.
- [ ] Registrar saídas de aluguel, produtos, contas fixas, salários, comissões pagas e outras despesas; categorias personalizáveis.
- [ ] Registrar pagamentos presenciais em dinheiro, Pix, cartão de crédito ou débito, com taxa de maquininha configurável; apenas registrar pagamento, sem integração de cobrança online.
- [ ] Abrir e fechar caixa diário com conferência.
- [ ] Ao concluir atendimento, lançar receita automaticamente.
- [ ] Permitir despesas recorrentes e contas a pagar com vencimento e alerta.
- [ ] Dashboard exibe faturamento do dia, semana e mês, despesas, lucro líquido, ticket médio e comparação com mês anterior.
- [x] Relatórios filtráveis por período, barbeiro, serviço e forma de pagamento, exportáveis via impressão (Salvar como PDF) e CSV compatível com Excel.
- [ ] Controle financeiro é interno, sem emissão de nota fiscal.

## 6. Comissões de barbeiros
- [ ] Cada barbearia configura o modelo de cada barbeiro, incluindo todas as opções: percentual fixo sobre tudo; percentual por serviço; valor fixo por serviço; modelo misto; aluguel de cadeira (barbeiro paga valor fixo e fica com o restante); comissão separada para produtos vendidos; percentual específico, por barbeiro, para atendimentos por plano (normalmente menor) configurável.
- [ ] Fechamento de comissão por período semanal, quinzenal ou mensal exibe total devido, descontos, vales/adiantamentos e valor líquido.
- [ ] Pagamento de comissão gera automaticamente saída no financeiro.
- [ ] Barbeiro acompanha comissões em tempo real.

## 7. Planos para clientes
- [ ] Dono cria planos livremente com nome, valor mensal, serviços incluídos, uso ilimitado ou limitado e validade.
- [ ] Assinatura do cliente a plano, controle de ciclo mensal e uso dos serviços do plano.
- [ ] Estados do plano: ativo, vencido, inadimplente, pausado e cancelado.
- [ ] Alertas de vencimento e renovação para dono/recepção.
- [ ] Pagamento da mensalidade registrado presencialmente entra automaticamente como receita.
- [ ] Comissão em atendimento via plano segue percentual específico configurado para barbeiro.

## 8. Clientes e histórico
- [ ] Cadastro do cliente contém nome, WhatsApp, data de nascimento opcional e observações.
- [ ] Cliente que agenda pela página pública é cadastrado automaticamente pelo número de WhatsApp, sem duplicatas.
- [ ] Histórico de atendimentos, gasto total e frequência.
- [ ] Lista de aniversariantes do mês e clientes inativos, com botão para chamar no WhatsApp.
- [ ] Galeria de fotos por cliente; barbeiro pode anexar foto do trabalho realizado.

## 9. Fidelidade, cupons e promoções
- [x] Dono pode ligar/desligar independentemente cada recurso nas configurações.
- [ ] Programa de pontos: pontos por atendimento e resgate por serviço ou desconto.
- [x] Cupons: código, desconto percentual ou em valor, validade e limite de uso.
- [x] Promoções, incluindo desconto em dia/horário específico e combos de serviços.
- [x] Planos de clientes podem ser ativados ou ocultados da página pública.
- [ ] Recursos desligados não aparecem para o cliente.

## 10. Estoque
- [ ] Cadastrar produtos de venda e de uso interno com custo, preço de venda e quantidade.
- [ ] Registrar entradas e saídas e alertar quando atingir estoque mínimo.
- [ ] Venda de produto junto ao atendimento dá baixa automática no estoque e aceita comissão opcional.
- [ ] Relatórios de produtos mais vendidos e margem de lucro.

## 11. Avaliações
- [ ] Após atendimento, cliente pode avaliar barbeiro e serviço com nota de 1 a 5 e comentário.
- [ ] Dono consulta média por barbeiro e escolhe se exibe avaliações na página pública.

## 12. Dados, segurança, privacidade e entrega
- [ ] Banco de dados relacional com todo registro de negócio vinculado ao id da barbearia, isolamento entre tenants e backup.
- [x] Senhas criptografadas e autenticação segura.
- [ ] Conformidade com LGPD e dados de clientes protegidos e isolados.
- [x] Incluir dados de exemplo para 2 barbearias, barbeiros, serviços com ícones, clientes, planos e agendamentos.
- [ ] Entrega final desejada: sistema funcionando e publicado, link de acesso, usuário Super Administrador de teste, barbearia de demonstração com dono e barbeiro de teste e instruções rápidas de uso.


## 13. Landing page comercial e assinaturas
- [ ] A página inicial apresenta o sistema de barbearia com a mesma ideia de estrutura comercial da referência indicada pelo usuário, sem copiar a identidade ou o conteúdo do outro site.
- [ ] A página usa capturas reais de telas existentes do sistema, sem substituir capturas do produto por dados inventados de painel.
- [ ] Exibir dois planos: Top por R$ 29,90 mensais e Premium por R$ 49,90 mensais; ambos incluem teste grátis de 7 dias.
- [ ] Ambos os planos têm todas as funcionalidades do sistema; somente o Premium inclui IA no WhatsApp.
- [ ] Os botões “Quero testar”, “Quero assinar” e “Saiba mais” direcionam ao WhatsApp +55 61 92005-1259 com mensagem contextualizada.
