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

O MVP usa Supabase Auth e Postgres. A criação de conta cria uma organização pessoal e associa o usuário como owner. As tabelas de pedidos têm políticas RLS para limitar leituras e alterações aos membros da organização. Configure a confirmação de e-mail e URLs de redirecionamento no Supabase antes de publicar.

Para publicar na Vercel, configure as variáveis do Supabase e `PORTAL_CREDENTIALS_ENCRYPTION_KEY`. `SUPABASE_SERVICE_ROLE_KEY` é usada somente na rota do servidor para guardar credenciais criptografadas; nunca a exponha no frontend.

## Escopo desta fase

- Cadastro e login por e-mail e senha.
- Dashboard com indicadores operacionais.
- Módulo Integrações com cadastro e filtro de pedidos por portal/status.
- Módulo Portais com ativação e desativação por organização; preferências persistidas na tabela `organization_portals`.
- Configuração de usuário e senha por portal; os valores são criptografados no servidor antes de serem salvos em `portal_credentials`. A chave `service_role` fica somente no servidor, e a interface exibe apenas se o acesso foi configurado.
- A ação Publicar abre o portal escolhido em outra aba; o agendamento é concluído manualmente no painel.
- Relatórios e integrações via API ficam para as fases seguintes.

## Preparar a publicação na Vercel

O projeto usa Next.js com App Router; a Vercel detecta o framework automaticamente. Não precisa de `vercel.json` nem de configuração customizada de build. No momento, este diretório ainda não está conectado a um repositório Git nem a um projeto Vercel.

1. Envie o código para um repositório Git privado e importe esse repositório em **Vercel → Add New → Project**. Selecione a pasta raiz deste app.
2. Em **Environment Variables**, configure para Production:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` como segredo do servidor
   - `PORTAL_CREDENTIALS_ENCRYPTION_KEY` como segredo do servidor
3. Use um projeto/banco Supabase de produção. Execute `supabase/schema.sql` em um banco novo; se estiver atualizando o MVP existente, aplique as migrações em ordem. Não exponha `SUPABASE_SERVICE_ROLE_KEY` nem a chave de criptografia com prefixo `NEXT_PUBLIC_`.
4. Configure no Supabase a URL pública do site e os URLs permitidos para autenticação usando o domínio Vercel escolhido.
5. Faça um Preview Deploy primeiro, confirme login, leitura/gravação de pedidos e armazenamento de credenciais, e então promova pelo fluxo do Git/Vercel.

O comando de build é `npm run build`. A versão de Node.js mínima está declarada em `package.json`. Para Preview, prefira credenciais Supabase separadas do Production, evitando que testes alterem os dados reais.
