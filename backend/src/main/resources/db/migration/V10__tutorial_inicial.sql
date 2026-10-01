-- Conteúdo inicial do tutorial guiado (o admin da plataforma edita depois em
-- Admin → Tutorial). "alvo" = data-tour do elemento destacado no painel.

insert into crm_tutorial_trilhas (chave, nome, descricao, icone, ordem) values
  ('inicio', 'Primeiros passos', 'Um passeio rápido por tudo o que o sistema faz', '👋', 0),
  ('conversas', 'Conversas', 'Como atender seus clientes no WhatsApp e Instagram', '💬', 1),
  ('crm', 'Funil de vendas', 'Como acompanhar cada venda do começo ao fim', '📊', 2),
  ('agentes', 'Robô de IA', 'Como criar e treinar seu vendedor com inteligência artificial', '🤖', 3),
  ('automacoes', 'Automações', 'Como fazer o sistema trabalhar sozinho por você', '⚡', 4),
  ('catalogo', 'Catálogo e pedidos', 'Como cadastrar produtos e vender pela sua loja online', '🛍️', 5),
  ('conexoes', 'Conectar o WhatsApp', 'Como ligar o seu número ao sistema', '📱', 6);

insert into crm_tutorial_passos (trilha, ordem, titulo, texto, rota, alvo, posicao, icone) values
  ('inicio', 0, 'Olá! Que bom ter você aqui 😄', 'Vou te mostrar, bem devagar, como tudo funciona. É só apertar o botão "Próximo" quando terminar de ler cada parte. Se quiser parar, aperte "Pular". Você pode ver este passeio de novo quando quiser, no botão de interrogação (?) lá em cima.', null, null, 'center', '👋'),
  ('inicio', 1, 'Este é o menu', 'Aqui do lado ficam todas as partes do sistema. É só clicar em um nome para abrir aquela tela. Pense nele como as portas de uma casa: cada porta leva para um cômodo.', null, 'menu', 'right', '🧭'),
  ('inicio', 2, 'Painel', 'O Painel é a primeira tela. Ele mostra, em números, como está o seu negócio: quantas conversas chegaram, quantas vendas foram feitas e quem está esperando resposta.', '/painel', 'menu-painel', 'right', '📈'),
  ('inicio', 3, 'Conversas', 'Aqui chegam todas as mensagens dos seus clientes, do WhatsApp e do Instagram, em um lugar só. Você responde por aqui, como se fosse o seu celular.', null, 'menu-conversas', 'right', '💬'),
  ('inicio', 4, 'Funil de vendas', 'O funil mostra cada cliente como um cartãozinho. Conforme a venda avança, o cartão anda para a próxima coluna, até chegar em "Fechado". Assim você nunca esquece de ninguém.', null, 'menu-crm', 'right', '📊'),
  ('inicio', 5, 'Contatos', 'É a sua agenda de clientes. Tem o nome, o telefone, as etiquetas (tags) e tudo o que já aconteceu com cada pessoa.', null, 'menu-contatos', 'right', '📇'),
  ('inicio', 6, 'Robô de IA', 'Aqui você cria o seu vendedor virtual. Ele responde os clientes sozinho, até de madrugada, do jeitinho que você ensinar.', null, 'menu-agentes', 'right', '🤖'),
  ('inicio', 7, 'Automações', 'Automações são tarefas que o sistema faz sozinho. Exemplo: quando alguém ganhar a etiqueta "CLIENTE", mandar uma mensagem de agradecimento.', null, 'menu-automacoes', 'right', '⚡'),
  ('inicio', 8, 'Catálogo e pedidos', 'Cadastre seus produtos com fotos e vídeos. Eles aparecem na sua loja online, e o robô também consegue vender por eles.', null, 'menu-catalogo', 'right', '🛍️'),
  ('inicio', 9, 'Busca rápida', 'Perdeu alguém? Digite aqui o nome ou o telefone e o sistema encontra para você.', null, 'busca', 'bottom', '🔎'),
  ('inicio', 10, 'Avisos', 'O sininho mostra os avisos importantes, como "cliente esperando" ou "venda feita". Quando tiver número vermelho, tem novidade.', null, 'notificacoes', 'bottom', '🔔'),
  ('inicio', 11, 'Ajuda sempre à mão', 'Neste botão você abre os tutoriais de novo, quando quiser. Tem um passeio para cada parte do sistema.', null, 'ajuda', 'bottom', '❓'),
  ('inicio', 12, 'Pronto! 🎉', 'Agora você já conhece o sistema. O primeiro passo é conectar o seu WhatsApp em "Conexões". Depois, crie o seu robô de IA. Boas vendas!', null, null, 'center', '🎉'),

  ('conversas', 0, 'A lista de conversas', 'Do lado esquerdo ficam as conversas, com a mais nova em cima. A bolinha com número mostra quantas mensagens você ainda não leu.', '/conversas', 'lista-conversas', 'right', '📋'),
  ('conversas', 1, 'Filtros', 'Use estas abas para ver só as conversas que você quer: não lidas, as que o robô está atendendo, as da equipe ou as que estão na fila esperando alguém.', '/conversas', 'abas-conversas', 'bottom', '🗂️'),
  ('conversas', 2, 'A conversa aberta', 'No meio fica a conversa. As mensagens do cliente ficam de um lado, e as suas e do robô do outro.', '/conversas', 'chat', 'left', '💬'),
  ('conversas', 3, 'Escrever e enviar', 'Escreva aqui embaixo e aperte Enter para enviar. No clipe você manda fotos, áudios e arquivos. Digite "/" para usar uma resposta pronta.', '/conversas', 'caixa-mensagem', 'top', '✍️'),
  ('conversas', 4, 'Robô ou pessoa?', 'Este botão mostra quem está atendendo. Se você responder, o robô para e a conversa fica com você. Para o robô voltar, é só clicar em "Devolver para a IA".', '/conversas', 'botao-ia', 'bottom', '🤝'),
  ('conversas', 5, 'Informações do cliente', 'Do lado direito aparece tudo sobre o cliente: etiquetas, em que etapa da venda ele está, o que o robô aprendeu sobre ele e os pedidos dele.', '/conversas', 'painel-cliente', 'left', 'ℹ️'),

  ('crm', 0, 'Colunas do funil', 'Cada coluna é uma etapa da venda: Novo Lead, Em Contato, Qualificado, Fechado ou Perdido. Você pode mudar os nomes nas configurações do funil.', '/crm', 'kanban', 'top', '🧱'),
  ('crm', 1, 'Os cartões', 'Cada cartão é um cliente. Segure o cartão com o mouse e arraste para outra coluna quando a venda avançar.', '/crm', 'cartao-negocio', 'right', '🃏'),
  ('crm', 2, 'Termômetro da venda', 'O número com % é o termômetro: quanto maior, mais perto de comprar o cliente está. Quem calcula é a IA, lendo a conversa.', '/crm', 'score', 'bottom', '🌡️'),
  ('crm', 3, 'Previsão', 'Aqui em cima você vê quanto dinheiro está em negociação e quanto deve entrar.', '/crm', 'previsao', 'bottom', '💰'),

  ('agentes', 0, 'Seus robôs', 'Aqui ficam os seus vendedores virtuais. Você pode ter mais de um, por exemplo: um para vendas e outro para o pós-venda.', '/agentes', 'lista-agentes', 'bottom', '🤖'),
  ('agentes', 1, 'Criar um robô', 'Clique aqui, escolha o tipo (vendas, suporte...) e dê um nome. O sistema já cria com boas configurações prontas.', '/agentes', 'novo-agente', 'bottom', '➕'),
  ('agentes', 2, 'Ensinar o robô', 'Dentro do robô, na aba "Instruções", escreva como ele deve conversar. Na aba "Conhecimento", coloque as perguntas mais comuns e as respostas certas.', null, null, 'center', '📚'),
  ('agentes', 3, 'Testar antes de ligar', 'Use a aba "Testar" para conversar com o robô como se fosse um cliente. Quando gostar das respostas, ligue o robô e escolha em qual WhatsApp ele vai atender.', null, null, 'center', '🧪'),

  ('automacoes', 0, 'O que é uma automação', 'É uma receita: QUANDO acontecer tal coisa (gatilho), ENTÃO o sistema faz outra (ação). Exemplo: quando chegar mensagem nova, marcar a etiqueta "NOVO".', '/automacoes', null, 'center', '⚡'),
  ('automacoes', 1, 'Criar', 'Clique em "Nova automação". Primeiro escolha o gatilho, depois vá ligando os blocos de ação, como peças de montar.', '/automacoes', 'nova-automacao', 'bottom', '🧩'),
  ('automacoes', 2, 'Esperar e horário', 'O bloco "Espera" faz o sistema aguardar antes do próximo passo. As mensagens automáticas respeitam o horário de envio que você escolher em Configurações (por exemplo, só às 15h).', null, null, 'center', '⏰'),
  ('automacoes', 3, 'Ligar', 'Quando terminar, clique em "Ativar". Se algo der errado, a aba "Execuções" mostra o que aconteceu com cada cliente.', null, null, 'center', '✅'),

  ('catalogo', 0, 'Seus produtos', 'Aqui você cadastra o que vende, com fotos, vídeos, preço e estoque.', '/catalogo', 'lista-produtos', 'bottom', '🛍️'),
  ('catalogo', 1, 'Novo produto', 'Clique aqui, coloque o nome, o preço e as fotos. Se tiver tamanho ou cor, crie as opções e o estoque de cada uma.', '/catalogo', 'novo-produto', 'bottom', '➕'),
  ('catalogo', 2, 'Sua loja online', 'Os produtos aparecem na página pública da sua loja. Em "Página da loja" você muda as cores, textos e fotos da página.', null, null, 'center', '🏪'),
  ('catalogo', 3, 'Pedidos', 'Cada compra vira um pedido. Mude o status (pago, enviado, entregue) e o cliente recebe o aviso no WhatsApp automaticamente.', null, 'menu-pedidos', 'right', '📦'),

  ('conexoes', 0, 'Conectar o WhatsApp', 'Aqui você liga o número de WhatsApp da sua empresa ao sistema. Usamos o WhatsApp oficial da Meta, que é seguro e não bloqueia o número.', '/conexoes', 'conexoes', 'bottom', '📱'),
  ('conexoes', 1, 'Passo a passo', 'Clique em "Conectar WhatsApp" e siga as instruções da tela. Se tiver dúvida, o botão "Como fazer?" mostra cada passo com imagens.', '/conexoes', 'nova-conexao', 'bottom', '🪜'),
  ('conexoes', 2, 'Pronto para atender', 'Quando aparecer "Conectado", as mensagens do seu WhatsApp já chegam em Conversas. Agora escolha qual robô vai atender esse número.', null, null, 'center', '✅');
