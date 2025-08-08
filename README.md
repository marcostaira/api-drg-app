# 📱 API WhatsApp com Evolution API

API Node.js com TypeScript e Prisma para integração com Evolution API. Cada tenant possui sua própria sessão de WhatsApp com configurações otimizadas.

## 🚀 Tecnologias

- **Node.js** - Runtime JavaScript
- **TypeScript** - Superset JavaScript tipado
- **Express** - Framework web para Node.js
- **Prisma** - ORM moderno para TypeScript/JavaScript
- **MySQL** - Banco de dados relacional
- **Zod** - Validação de esquemas TypeScript-first
- **Axios** - Cliente HTTP para integração com Evolution API

## 📁 Estrutura do Projeto

```
src/
├── config/              # Configurações da aplicação
│   ├── config.ts        # Configurações gerais
│   └── database.ts      # Configuração do Prisma
├── controllers/         # Controllers da API
│   └── whatsappController.ts
├── services/           # Serviços de negócio
│   ├── evolutionService.ts   # Integração com Evolution API
│   └── whatsappService.ts    # Lógica WhatsApp
├── routes/             # Rotas da API
│   ├── whatsappRoutes.ts
│   ├── webhookRoutes.ts
│   └── index.ts
├── middlewares/        # Middlewares do Express
│   ├── errorHandler.ts
│   └── notFoundHandler.ts
├── prisma/            # Scripts Prisma
│   └── seed.ts        # Dados iniciais
├── app.ts             # Configuração do Express
└── index.ts           # Ponto de entrada da aplicação
```

## ⚙️ Configuração

### 1. **Instalar dependências:**

```bash
npm install
```

### 2. **Configurar variáveis de ambiente:**

```bash
cp .env.example .env
```

**Edite o `.env` com suas configurações:**

```bash
# Database
DATABASE_URL="mysql://root:password@localhost:3306/whatsapp_api"

# Server
PORT=3000
NODE_ENV=development

# Evolution API
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-evolution-api-key

# Webhook
WEBHOOK_BASE_URL=http://localhost:3000
```

### 3. **Configurar banco de dados:**

```bash
# Gerar o cliente Prisma
npm run db:generate

# Aplicar migrações
npm run db:migrate

# Popular com dados de exemplo
npm run db:seed
```

## 🛠️ Scripts Disponíveis

- `npm run dev` - Executa em modo desenvolvimento com hot reload
- `npm run build` - Compila o TypeScript
- `npm run start` - Executa a versão compilada
- `npm run db:generate` - Gera o cliente Prisma
- `npm run db:push` - Sincroniza schema com banco (desenvolvimento)
- `npm run db:migrate` - Executa migrações
- `npm run db:studio` - Abre Prisma Studio
- `npm run db:seed` - Popula banco com dados iniciais

## 🚦 Executar

```bash
# Desenvolvimento
npm run dev

# Produção
npm run build
npm start
```

A API estará disponível em `http://localhost:3000`

## 📊 Endpoints Principais

### **Health Check**

```
GET /health
```

### **WhatsApp API**

```
POST /api/whatsapp/connect          # Conectar tenant
GET  /api/whatsapp/status/:tenantId # Status da sessão
POST /api/whatsapp/disconnect       # Desconectar sessão
POST /api/whatsapp/send-message     # Enviar mensagem
```

### **Webhook**

```
POST /api/webhook/whatsapp/:tenantId # Receber eventos do Evolution
```

## 🔌 Integração com Evolution API

### **Funcionalidades Implementadas:**

- ✅ Criação automática de sessões por tenant
- ✅ Configuração automática (sem grupos, sem histórico)
- ✅ Registro de webhook específico por tenant
- ✅ Recepção de QR Code via webhook
- ✅ Processamento de mensagens de texto
- ✅ Envio de mensagens de texto
- ✅ Status de conexão em tempo real

### **Configurações Automáticas:**

- **Rejeitar grupos:** `groupsIgnore: true`
- **Não sincronizar histórico:** `syncFullHistory: false`
- **Não marcar como lido:** `readMessages: false`
- **Webhook por eventos:** `webhookByEvents: true`

## 🔄 Fluxo de Funcionamento

### **1. Conexão:**

1. Frontend chama `/api/whatsapp/connect` com `tenantId`
2. API verifica se sessão existe no Evolution
3. Cria sessão se não existir
4. Aplica configurações (sem grupos, sem histórico)
5. Registra webhook específico do tenant
6. Retorna QR Code (se disponível)

### **2. Webhook:**

- Evolution envia eventos para `/api/webhook/whatsapp/{tenantId}`
- API processa QR Code, status de conexão e mensagens
- Frontend escuta webhook do tenant para atualizações

### **3. Mensagens:**

- **Recebidas:** Apenas texto, ignora grupos, salva no banco
- **Enviadas:** Via endpoint `/send-message` com validação

## 🗃️ Banco de Dados

### **Modelos Principais:**

```
Tenant
├── WhatsAppSession (1:N)
    └── ReceivedMessage (1:N)
```

### **Status da Sessão:**

- `CONNECTING` - Aguardando QR Code
- `CONNECTED` - Conectado e funcionando
- `DISCONNECTED` - Desconectado
- `ERROR` - Erro na conexão

## 🧪 Testando

### **1. Conectar tenant:**

```bash
curl -X POST http://localhost:3000/api/whatsapp/connect \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"550e8400-e29b-41d4-a716-446655440000"}'
```

### **2. Verificar status:**

```bash
curl http://localhost:3000/api/whatsapp/status/550e8400-e29b-41d4-a716-446655440000
```

### **3. Enviar mensagem:**

```bash
curl -X POST http://localhost:3000/api/whatsapp/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId":"550e8400-e29b-41d4-a716-446655440000",
    "phoneNumber":"5511999999999",
    "text":"Olá! Mensagem de teste."
  }'
```

## 🔒 Recursos de Segurança

- **Helmet** - Headers de segurança
- **CORS** - Configuração de origens permitidas
- **Rate Limiting** - Limitação de requisições por IP
- **Validação** - Validação rigorosa com Zod
- **Error Handling** - Tratamento centralizado de erros

## 📋 Próximos Passos

- [ ] Sistema de filas para envio de mensagens
- [ ] Templates de mensagens no banco
- [ ] Processamento inteligente de mensagens recebidas
- [ ] Métricas e logs avançados
- [ ] Interface web para gerenciamento
- [ ] Suporte a outros tipos de mídia

## 📚 Documentação

Consulte `API_WHATSAPP.md` para documentação detalhada dos endpoints e exemplos de uso.
