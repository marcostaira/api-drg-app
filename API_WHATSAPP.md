# 📱 API WhatsApp com Evolution API

API para integração com Evolution API, permitindo que cada tenant tenha sua própria sessão de WhatsApp.

## 🚀 Funcionalidades

- ✅ Conectar tenant ao WhatsApp
- ✅ Configuração automática (rejeitar grupos, não sincronizar histórico)
- ✅ Webhook para receber QR Code e eventos
- ✅ Receber mensagens de texto
- ✅ Enviar mensagens de texto
- ✅ Verificar status da sessão
- ✅ Desconectar sessão

## 📋 Pré-requisitos

1. **Evolution API** rodando e acessível
2. **MySQL** configurado
3. **Node.js** v18+ com TypeScript

## ⚙️ Configuração

### 1. Variáveis de ambiente (.env)

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

### 2. Preparar banco de dados

```bash
# Gerar cliente Prisma
npm run db:generate

# Aplicar migrações
npm run db:migrate

# Popular banco com dados iniciais
npm run db:seed
```

## 🔌 Endpoints da API

### Base URL: `http://localhost:3000/api`

### 1. **Conectar Tenant ao WhatsApp**

```
POST /api/whatsapp/connect
```

**Body:**

```json
{
  "tenantId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Processo de conexão iniciado",
  "data": {
    "sessionId": "session-uuid",
    "sessionName": "tenant_550e8400-e29b-41d4-a716-446655440000",
    "status": "CONNECTING",
    "qrCode": "data:image/png;base64,...",
    "webhookUrl": "http://localhost:3000/api/webhook/whatsapp/550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### 2. **Status da Sessão**

```
GET /api/whatsapp/status/{tenantId}
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
    "sessionName": "tenant_550e8400-e29b-41d4-a716-446655440000",
    "connectedAt": "2024-01-01T10:00:00.000Z"
  }
}
```

### 3. **Desconectar Sessão**

```
POST /api/whatsapp/disconnect
```

**Body:**

```json
{
  "tenantId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 4. **Enviar Mensagem**

```
POST /api/whatsapp/send-message
```

**Body:**

```json
{
  "tenantId": "550e8400-e29b-41d4-a716-446655440000",
  "phoneNumber": "5511999999999",
  "text": "Olá! Esta é uma mensagem de teste."
}
```

### 5. **Webhook (Evolution API)**

```
POST /api/webhook/whatsapp/{tenantId}
```

Este endpoint recebe automaticamente os eventos do Evolution API:

- QR Code atualizado
- Status da conexão
- Mensagens recebidas (apenas texto)

## 🔄 Fluxo de Conexão

### 1. **Processo de Conexão**

1. Frontend chama `POST /api/whatsapp/connect` com `tenantId`
2. API verifica se sessão existe no Evolution
3. Se não existir, cria nova sessão no Evolution
4. Configura sessão (não aceitar grupos, não sincronizar histórico)
5. Registra webhook para o tenant específico
6. Retorna QR Code (se disponível)

### 2. **Webhook do Frontend**

O frontend deve escutar a URL do webhook para receber:

- QR Code atualizado
- Status de conexão
- Confirmação de conexão

### 3. **Recebimento de Mensagens**

- Evolution envia mensagens via webhook
- API filtra apenas mensagens de texto
- Ignora mensagens de grupos
- Salva no banco de dados para processamento posterior

## 🗃️ Estrutura do Banco

### Tabelas Principais:

- **tenants** - Informações dos tenants
- **whatsapp_sessions** - Sessões ativas do WhatsApp
- **received_messages** - Mensagens recebidas

## 🧪 Testando a API

### 1. **Conectar um tenant:**

```bash
curl -X POST http://localhost:3000/api/whatsapp/connect \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"550e8400-e29b-41d4-a716-446655440000"}'
```

### 2. **Verificar status:**

```bash
curl http://localhost:3000/api/whatsapp/status/550e8400-e29b-41d4-a716-446655440000
```

### 3. **Enviar mensagem:**

```bash
curl -X POST http://localhost:3000/api/whatsapp/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId":"550e8400-e29b-41d4-a716-446655440000",
    "phoneNumber":"5511999999999",
    "text":"Mensagem de teste"
  }'
```

## 🚨 Pontos Importantes

1. **Cada tenant = Uma sessão WhatsApp**
2. **Webhook específico por tenant** (`/webhook/whatsapp/{tenantId}`)
3. **Apenas mensagens de texto são processadas**
4. **Grupos são ignorados automaticamente**
5. **Histórico não é sincronizado**
6. **QR Code é enviado via webhook**

## 🔧 Próximos Passos

- [ ] Sistema de filas para envio de mensagens
- [ ] Templates de mensagens
- [ ] Processamento de mensagens recebidas
- [ ] Métricas e logs
- [ ] Interface web para gerenciamento
