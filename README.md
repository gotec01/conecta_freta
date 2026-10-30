# Nexo — controlador de integrações

MVP SaaS para organizar pedidos e abrir os painéis de TempoCerto, Trizy e Nexello.

## Rodar localmente

1. Use Node.js 20.9 ou superior.
2. Instale as dependências com `npm install`.
3. Copie `.env.example` para `.env.local` e preencha as variáveis do projeto Supabase.
4. Gere uma chave com `openssl rand -hex 32` e defina `PORTAL_CREDENTIALS_ENCRYPTION_KEY`.
5. Execute `supabase/schema.sql` no SQL Editor do Supabase. Se o banco já recebeu o schema anterior, aplique as migrações em `supabase/migrations/` em ordem.
6. Inicie com `npm run dev` e abra `http://localhost:3000`.

Sem as variáveis do Supabase, a tela abre em modo demonstração e os pedidos ficam somente no estado da página. Não use esse modo em produção.

## Banco e autenticação

O MVP usa Supabase Auth e Postgres. A criação de conta cria uma organização pessoal, associa o usuário como owner e inicia a sessão imediatamente. Para isso, desative **Confirm email** em **Authentication → Sign In / Providers → Email** no Supabase. As tabelas de pedidos têm políticas RLS para limitar leituras e alterações aos membros da organização.

Para publicar na Vercel, configure as variáveis do Supabase e `PORTAL_CREDENTIALS_ENCRYPTION_KEY`. A revisão formal dos modelos de e-mail usa `OPENAI_API_KEY` no servidor e fica indisponível até essa variável ser configurada. `SUPABASE_SERVICE_ROLE_KEY` é usada somente na rota do servidor para guardar credenciais criptografadas; nunca a exponha no frontend.

## Escopo desta fase

- Cadastro e login por e-mail e senha.
- Dashboard com indicadores operacionais.
- Módulo Integrações com cadastro e filtro de pedidos por portal/status.
- Importação de XML no módulo Integrações: leitura no navegador dos CNPJs e de um possível número do pedido, correspondência com cliente cadastrado e gravação do pedido com o portal padrão. O XML não é armazenado; formatos específicos de cada emissor podem exigir ajustes nos nomes de campos reconhecidos.
- Seleção de vários pedidos e ação em massa agrupada pelo portal de cada pedido; a ação abre o painel correspondente para conclusão manual.
- Módulo Portais com cadastro de novos portais (nome, endereço e descrição), além de ativação e configuração de acesso por organização. O catálogo fica em `organization_portals`.
- Edição do nome, endereço e descrição dos portais; ao renomear, clientes, pedidos e credenciais continuam vinculados ao portal atualizado. Portais podem ser ativados ou desativados sem apagar clientes, pedidos ou acessos cadastrados.
- Módulo Clientes com razão social, nome fantasia, CNPJ, e-mail, telefone e portal padrão. O pedido guarda o cliente relacionado e sugere o portal padrão dele.
- Modelos de e-mail por cliente, com destinatários, assunto e corpo; a revisão formal do texto é opcional e depende da variável `OPENAI_API_KEY`.
- Importação de planilha XLS/XLSX com filtros por grupo do cliente, vendedor e data de agendamento, além da seleção e publicação em lote.
- Importação de XML para preencher número do pedido de origem, quantidade de linhas, soma das quantidades dos itens e ordem de compra identificada nas observações.
- Leitura do número da nota fiscal a partir do campo `nNF` do XML, salvo e exibido na listagem de pedidos.
- Filtros de integração por nome do cliente, portal, número do pedido, status e período da data solicitada.
- Datas de integração separadas entre data solicitada e data confirmada pelo cliente. A confirmação pode ser editada na própria listagem; relatórios e dashboard usam a data confirmada como referência de agendamento.
- Cadastro de vários usuários e senhas por portal; os valores são criptografados no servidor antes de serem salvos em `portal_credentials`. Um painel autenticado permite visualizar os usuários e revelar cada senha sob demanda. A chave `service_role` fica somente no servidor.
- A ação Publicar abre o portal escolhido em outra aba; o agendamento é concluído manualmente no painel.
- Relatórios com filtros por portal e período, indicadores por status e exportação CSV. Os dados refletem os status atuais dos pedidos; a publicação ainda é manual.
- Integrações automáticas via API ficam para a fase seguinte.

## Preparar a publicação na Vercel

O projeto usa Next.js com App Router; a Vercel detecta o framework automaticamente. Não precisa de `vercel.json` nem de configuração customizada de build.

1. Envie o código para um repositório Git privado e importe esse repositório em **Vercel → Add New → Project**. Selecione a pasta raiz deste app.
2. Em **Environment Variables**, configure para Production:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` como segredo do servidor
   - `PORTAL_CREDENTIALS_ENCRYPTION_KEY` como segredo do servidor
   - `OPENAI_API_KEY` como segredo do servidor (opcional; habilita a revisão formal dos modelos de e-mail)
3. Use um projeto/banco Supabase de produção. Execute `supabase/schema.sql` em um banco novo; se estiver atualizando o MVP existente, aplique todas as migrações em `supabase/migrations/` em ordem. As migrações incluem clientes, modelos de e-mail, dados extraídos do XML (inclusive o número da nota fiscal), datas solicitadas e confirmadas, edição de portais e múltiplos acessos por portal. Não exponha `SUPABASE_SERVICE_ROLE_KEY` nem a chave de criptografia com prefixo `NEXT_PUBLIC_`.
4. Configure no Supabase a URL pública do site e os URLs permitidos para autenticação usando o domínio Vercel escolhido.
5. Faça um Preview Deploy primeiro, confirme login, leitura/gravação de pedidos e armazenamento de credenciais, e então promova pelo fluxo do Git/Vercel.

O comando de build é `npm run build`. A versão de Node.js mínima está declarada em `package.json`. Para Preview, prefira credenciais Supabase separadas do Production, evitando que testes alterem os dados reais.
