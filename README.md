# 📱 WhatsApp API com Evolution API

API Node.js com TypeScript e Prisma para integração completa com WhatsApp via Evolution API v2. Cada tenant possui sua própria sessão de WhatsApp com verificações robustas e configurações otimizadas.

## 🚀 Funcionalidades

- ✅ **Gestão de Sessões por Tenant** - Cada tenant tem sua própria sessão WhatsApp
- ✅ **Verificações Robustas** - Verifica existência no banco E no Evolution API
- ✅ **Configuração Automática** - Rejeita grupos e não sincroniza histórico
- ✅ **Webhook Inteligente** - Recebe QR Code, status e mensagens por tenant
- ✅ **Validação Rigorosa** - Validação completa com Zod
- ✅ **Tratamento de Erros** - Error handling abrangente
- ✅ **Rate Limiting** - Proteção contra spam
- ✅ **Logs Detalhados** - Logs estruturados para debug
- ✅ **TypeScript** - Totalmente tipado

## 🛠️ Tecnologias

- **Node.js** v18+ - Runtime JavaScript
- **TypeScript** - Superset JavaScript tipado
- **Express** - Framework web minimalista
- **Prisma** - ORM moderno para banco de dados
- **MySQL** - Banco de dados relacional
- **Zod** - Validação de schemas TypeScript-first
- **Axios** - Cliente HTTP para Evolution API
- **Helmet** - Middlewares de segurança
- **Evolution API v2** - API WhatsApp Business

## 📁 Estrutura Modular

```
src/
├── config/              # Configurações
│   ├── config.ts        # Configurações gerais
│   └── database.ts      # Configuração Prisma
├── controllers/         # Controllers da API
│   └── whatsappController.ts
├── services/           # Lógica de negócio
│   ├── evolutionService.ts   # Integração Evolution API
│   └── whatsappService.ts    # Lógica principal WhatsApp
├── routes/             # Rotas organizadas
│   ├── whatsappRoutes.ts
│   ├── webhookRoutes.ts
│   └── index.ts
├── middlewares/        # Middlewares Express
│   ├── errorHandler.ts
│   └── notFoundHandler.ts
├── schemas/           # Validações Zod
│   └── whatsappSchemas.ts
├── types/             # Interfaces TypeScript
│   ├── whatsapp.ts
│   └── evolution.ts
├── app.ts             # Configuração Express
└── index.ts           # Ponto de entrada
```

## ⚙️ Instalação e Configuração

### 1. **Clonar e instalar dependências:**

```bash
git clone https://github.com/seu-usuario/whatsapp-api-evolution.git
cd whatsapp-api-evolution
npm install
```

### 2. **Configurar variáveis de ambiente:**

```bash
cp .env.example .env
```

**Edite o `.env` com suas configurações:**

```bash
# Servidor
PORT=3000
NODE_ENV=development

# Banco de dados
DATABASE_URL="mysql://root:password@localhost:3306/whatsapp_api"

# Evolution API
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=sua-chave-evolution-api

# Webhook
WEBHOOK_BASE_URL=http://localhost:3000

# Segurança
ALLOWED_ORIGINS="http://localhost:3000,http://localhost:3001"
```

### 3. **Configurar banco de dados:**

```bash
# Gerar cliente Prisma
npm run db:generate

# Aplicar migrações
npm run db:migrate

# Popular com dados iniciais (opcional)
npm run db:seed
```

### 4. **Executar aplicação:**

```bash
# Desenvolvimento
npm run dev

# Produção
npm run build
npm run start:prod
```

## 🔌 Endpoints da API

### **Base URL:** `http://localhost:3000/api`

### 1. **Conectar Tenant ao WhatsApp**

```http
POST /api/whatsapp/connect
Content-Type: application/json

{
  "tenantId": 1
}
```

**Response:**

```json
{
  "success": true,
  "message": "Processo de conexão iniciado com sucesso",
  "data": {
    "sessionId": "uuid",
    "sessionName": "tenant_1",
    "status": "CONNECTING",
    "qrCode": "data:image/png;base64,...",
    "webhookUrl": "http://localhost:3000/api/webhook/whatsapp/1"
  }
}
```

### 2. **Status da Sessão**

```http
GET /api/whatsapp/status/1
```

**Response:**

```json
{
  "success": true,
  "data": {
    "connected": true,
    "status": "CONNECTED",
    "phoneNumber": "5511999999999",
    "profileName": "Nome do Perfil",
    "sessionName": "tenant_1",
    "connectedAt": "2024-01-01T10:00:00.000Z"
  }
}
```

### 3. **Desconectar Sessão**

```http
POST /api/whatsapp/disconnect
Content-Type: application/json

{
  "tenantId": 1
}
```

### 4. **Enviar Mensagem**

```http
POST /api/whatsapp/send-message
Content-Type: application/json

{
  "tenantId": 1,
  "phoneNumber": "5511999999999",
  "text": "Olá! Esta é uma mensagem de teste."
}
```

### 5. **Health Check**

```http
GET /health
GET /api/whatsapp/health
```

## 🎣 Webhook

O Evolution API envia eventos automaticamente para:

```
POST /api/webhook/whatsapp/{tenantId}
```

**Eventos processados:**

- `qrcode.updated` - QR Code atualizado
- `connection.update` - Status da conexão
- `messages.upsert` - Mensagens recebidas

## 🔄 Fluxo de Funcionamento Aprimorado

### **1. Processo de Conexão com Verificações:**

1. **Validação de entrada** - Zod valida `tenantId`
2. **Verificação no banco** - Confirma se tenant existe
3. **Busca sessão ativa** - Procura sessão CONNECTING/CONNECTED
4. **Verificação no Evolution** - Confirma se instância existe na Evolution API
5. **Criação se necessário** - Cria instância apenas se não existir
6. **Configuração automática** - Aplica configurações (sem grupos, sem histórico)
7. **Webhook específico** - Registra webhook único por tenant
8. **Upsert no banco** - Cria ou atualiza sessão no banco
9. **QR Code** - Obtém QR Code se necessário
10. **Resposta** - Retorna dados completos da sessão

### **2. Verificações de Segurança:**

- **Rate Limiting** - Máximo 100 requests por 15 minutos
- **CORS** - Apenas origens permitidas
- **Helmet** - Headers de segurança
- **Validação rigorosa** - Todos os inputs validados
- **Error handling** - Erros tratados e logados

### **3. Processamento de Webhooks:**

- **Validação de tenant** - Confirma se tenant existe
- **Processamento por evento** - QR Code, conexão, mensagens
- **Filtros inteligentes** - Apenas mensagens de texto, não grupos
- **Persistência** - Salva mensagens no banco
- **Logs detalhados** - Log estruturado de todos os eventos

## 🗃️ Banco de Dados

### **Modelos Principais:**

```
Tenant (1) ──→ (N) WhatsAppSession ──→ (N) ReceivedMessage
```

### **Status de Sessão:**

- `CONNECTING` - Aguardando QR Code
- `CONNECTED` - Conectado e operacional
- `DISCONNECTED` - Desconectado
- `ERROR` - Erro na conexão

## 🧪 Testando a API

### **1. Conectar tenant:**

```bash
curl -X POST http://localhost:3000/api/whatsapp/connect \
  -H "Content-Type: application/json" \
  -d '{"tenantId": 1}'
```

### **2. Verificar status:**

```bash
curl http://localhost:3000/api/whatsapp/status/1
```

### **3. Enviar mensagem:**

```bash
curl -X POST http://localhost:3000/api/whatsapp/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": 1,
    "phoneNumber": "5511999999999",
    "text": "Mensagem de teste"
  }'
```

## 📊 Logs e Monitoramento

A aplicação produz logs estruturados para facilitar debug e monitoramento:

```
🚀 Iniciando processo de conexão para tenant: 1
🔍 Verificando se tenant existe no banco: 1
✅ Tenant encontrado no banco: 1
🔍 Buscando sessão ativa no banco: 1
🔍 Verificando se instância existe no Evolution: tenant_1
✅ Instância encontrada no Evolution: {...}
💾 Criando/atualizando sessão no banco: {...}
✅ Processo de conexão finalizado: {...}
```

## 🔒 Recursos de Segurança

- **Helmet** - Headers de segurança HTTP
- **CORS** - Controle de origens permitidas
- **Rate Limiting** - Proteção contra spam e DoS
- **Validação rigorosa** - Validação de todos os inputs
- **Error handling** - Tratamento seguro de erros
- **Logs estruturados** - Auditoria e debug

## 📈 Performance e Escalabilidade

- **Connection pooling** - Gerenciamento eficiente de conexões
- **Timeout adequados** - Evita travamentos
- **Rate limiting** - Protege recursos
- **Logs otimizados** - Performance em produção
- **TypeScript** - Detecção precoce de erros

## 🚨 Tratamento de Erros

A API trata diversos tipos de erro:

- **Validação** - Dados de entrada inválidos
- **Banco de dados** - Erros do Prisma
- **Evolution API** - Falhas na comunicação
- **Aplicação** - Erros da lógica de negócio
- **Sistema** - Erros não previstos

## 📋 Scripts Disponíveis

- `npm run dev` - Desenvolvimento com hot reload
- `npm run build` - Compilar TypeScript
- `npm run start` - Executar versão compilada
- `npm run type-check` - Verificar tipos TypeScript
- `npm run db:*` - Comandos do Prisma
- `npm run test` - Executar testes

## 🤝 Contribuindo

1. Fork o projeto
2. Crie sua feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🔗 Links Úteis

- [Evolution API Documentation](https://doc.evolution-api.com/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

---

**Desenvolvido com ❤️ usando Node.js + TypeScript + Evolution API**
