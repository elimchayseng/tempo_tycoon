# Railway Deployment Guide

## Overview

This guide covers deploying the Zoo Tycoon Agentic Commerce Simulation to Railway, building on the existing `eth_tempo_experiments` infrastructure.

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **GitHub Repository**: Project pushed to GitHub
3. **Tempo Testnet Tokens**: AlphaUSD for wallet funding
4. **Environment Preparation**: All required environment variables ready

## Deployment Steps

### 1. Initial Repository Setup

```bash
# Ensure the project is properly set up
git init
git add .
git commit -m "Initial commit: Zoo Tycoon ACP simulation setup"
git branch -M main
git remote add origin https://github.com/yourusername/tempo-zoo-experiment.git
git push -u origin main
```

### 2. Railway Project Creation

#### Option A: Railway CLI (Recommended)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Create new project
railway init

# Deploy immediately
railway up
```

#### Option B: Railway Dashboard
1. Go to [railway.app](https://railway.app)
2. Click "Deploy from GitHub repo"
3. Connect your GitHub account
4. Select the `tempo-zoo-experiment` repository
5. Railway will automatically detect the `railway.toml` configuration

### 3. Environment Variables Configuration

Set these variables in the Railway dashboard under "Variables":

#### Required Variables
```bash
# Blockchain Configuration
RPC_URL=https://rpc.moderato.tempo.xyz
EXPLORER_URL=https://explore.moderato.tempo.xyz
CHAIN_ID=42431

# Wallet Private Keys (CRITICAL: Keep these secure!)
ZOO_MASTER_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
MERCHANT_A_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
ATTENDEE_1_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
ATTENDEE_2_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
ATTENDEE_3_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef

# Simulation Configuration
AGENT_POLLING_INTERVAL=10000
NEED_DECAY_RATE=2
PURCHASE_THRESHOLD=30
MIN_BALANCE_THRESHOLD=10.0

# Application Configuration
NODE_ENV=production
LOG_LEVEL=info
ENABLE_REQUEST_LOGS=true
```

#### Setting Variables via CLI
```bash
# Set individual variables
railway variables set RPC_URL=https://rpc.moderato.tempo.xyz
railway variables set CHAIN_ID=42431

# Or set multiple variables from a file
railway variables set --from-file .env.production
```

### 4. Wallet Setup and Funding

#### Generate Wallets (Local Development)
```bash
# Run the wallet setup script
npm run setup:wallets

# This will generate 5 new wallets and display their addresses
# Copy the private keys to your Railway environment variables
```

#### Fund Wallets on Tempo Testnet
1. **Get testnet tokens** from the Tempo faucet
2. **Fund the Zoo Master wallet** with sufficient AlphaUSD
3. **Use the funding script** to distribute tokens:

```bash
# Set your environment variables locally first
export ZOO_MASTER_PRIVATE_KEY=0x...
export MERCHANT_A_PRIVATE_KEY=0x...
# ... etc

# Run the funding script
npm run fund:agents

# This will distribute AlphaUSD from Zoo Master to all other wallets
```

### 5. Service Configuration

Railway automatically detects the configuration from `railway.toml`:

```toml
[build]
  builder = "nixpacks"

[deploy]
  startCommand = "cd eth_tempo_experiments && npm start"
  healthcheckPath = "/api/health"
  healthcheckTimeout = 30
  restartPolicyType = "always"
```

#### Custom Build Configuration (if needed)
If Railway doesn't properly detect the setup, you can override the build:

```bash
# Set custom build command
railway variables set NIXPACKS_BUILD_CMD="cd eth_tempo_experiments && npm install"

# Set custom start command
railway variables set NIXPACKS_START_CMD="cd eth_tempo_experiments && npm start"
```

### 6. Domain and SSL

Railway automatically provides:
- **HTTPS certificate**: SSL/TLS encryption
- **Custom domain**: `your-app-name.up.railway.app`
- **Custom domains**: Connect your own domain if desired

#### Configure Custom Domain
```bash
# Add custom domain via CLI
railway domain add yourdomain.com

# Or use the Railway dashboard > Settings > Domains
```

## Verification and Testing

### 1. Health Check Verification

```bash
# Check basic health
curl https://your-app-name.up.railway.app/api/health

# Check blockchain connectivity
curl https://your-app-name.up.railway.app/api/health/blockchain

# Expected response:
{
  "status": "ok",
  "chain": {
    "id": 42431,
    "name": "Tempo Moderato Testnet",
    "latest_block": "12345678"
  }
}
```

### 2. Zoo Registry Test

```bash
# Verify zoo registry is accessible
curl https://your-app-name.up.railway.app/api/zoo/registry

# Should return the complete merchant registry with real wallet addresses
```

### 3. ACP Endpoint Testing

```bash
# Test merchant catalog
curl https://your-app-name.up.railway.app/api/merchant/food/catalog

# Test checkout session creation
curl -X POST https://your-app-name.up.railway.app/api/merchant/food/checkout/create \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "hotdog",
    "quantity": 1,
    "buyer_address": "0x742d35Cc6634C0532925a3b8d31B0da4e10a8Aef"
  }'
```

## Monitoring and Observability

### Railway Dashboard Monitoring

Railway provides built-in monitoring:
1. **CPU and Memory usage**
2. **Request volume and response times**
3. **Build and deployment logs**
4. **Service uptime and health checks**

### Application Logs

View logs in real-time:

```bash
# View logs via CLI
railway logs

# Follow logs in real-time
railway logs --follow

# Filter logs by service
railway logs --service zoo-server
```

### Custom Monitoring Endpoints

The application provides additional monitoring:

```bash
# Zoo simulation status
curl https://your-app-name.up.railway.app/api/zoo/status

# Recent transaction history
curl https://your-app-name.up.railway.app/api/zoo/transactions?limit=10
```

## Scaling and Performance

### Vertical Scaling

Railway automatically scales based on resource usage:
- **CPU**: Auto-scaling up to 8 vCPUs
- **Memory**: Auto-scaling up to 32GB RAM
- **Bandwidth**: Unlimited

### Horizontal Scaling (Future)

For high-load scenarios, consider:
1. **Separate Agent Service**: Deploy agents as separate Railway service
2. **Database Service**: Use Railway PostgreSQL for session storage
3. **Redis Service**: Add Redis for caching and real-time features

```bash
# Add PostgreSQL service
railway add postgresql

# Add Redis service
railway add redis
```

## Troubleshooting

### Common Issues

#### 1. Build Failures
```bash
# Check build logs
railway logs --deployment

# Common fixes:
# - Ensure package.json scripts are correct
# - Verify Node.js version compatibility
# - Check for missing dependencies
```

#### 2. Environment Variable Issues
```bash
# List all variables
railway variables

# Check specific variable
railway variables get ZOO_MASTER_PRIVATE_KEY

# Update variable
railway variables set ZOO_MASTER_PRIVATE_KEY=new_value
```

#### 3. Blockchain Connectivity
```bash
# Test RPC connection
curl -X POST https://rpc.moderato.tempo.xyz \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_chainId",
    "params": [],
    "id": 1
  }'

# Expected response: {"jsonrpc":"2.0","id":1,"result":"0xa5df"}
```

#### 4. Wallet Balance Issues
```bash
# Check wallet balances via health endpoint
curl https://your-app-name.up.railway.app/api/zoo/status

# Manually fund wallets if needed
npm run fund:agents
```

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
# Set debug environment variables
railway variables set LOG_LEVEL=debug
railway variables set ENABLE_REQUEST_LOGS=true
railway variables set ENABLE_AGENT_LOGS=true

# Restart the service
railway service restart
```

## Security Considerations

### Production Security Checklist

- [ ] **Environment Variables**: All sensitive data in Railway variables (never in code)
- [ ] **Private Keys**: Secure storage, never logged or exposed
- [ ] **HTTPS**: Enabled by default via Railway
- [ ] **Rate Limiting**: Implemented for API endpoints
- [ ] **Input Validation**: All user inputs validated
- [ ] **Error Handling**: No sensitive data in error messages

### Private Key Management

```bash
# Generate new secure private keys
node -e "
const crypto = require('crypto');
for (let i = 0; i < 5; i++) {
  const privateKey = '0x' + crypto.randomBytes(32).toString('hex');
  console.log(\`Wallet \${i + 1}: \${privateKey}\`);
}
"

# Rotate keys periodically for security
# Update Railway variables with new keys
# Transfer funds to new addresses
```

## Backup and Recovery

### Application Backup
```bash
# Export environment variables
railway variables > env-backup.txt

# Clone repository for source code backup
git clone https://github.com/yourusername/tempo-zoo-experiment.git
```

### Wallet Recovery
- **Store private keys securely** (encrypted password manager)
- **Maintain backup of funded addresses**
- **Document funding procedures** for quick recovery

### Database Backup (if using Railway PostgreSQL)
```bash
# Create database backup
railway pg:dump > backup.sql

# Restore from backup
railway pg:restore backup.sql
```

## Multi-Environment Setup

### Staging Environment
```bash
# Create staging service
railway service create zoo-staging

# Set staging-specific variables
railway variables set NODE_ENV=staging
railway variables set LOG_LEVEL=debug

# Deploy to staging
railway up --service zoo-staging
```

### Environment Promotion
```bash
# Promote staging to production
railway service promote zoo-staging --to production
```

This deployment guide ensures a smooth production deployment of the Zoo Tycoon Agentic Commerce Simulation on Railway with proper monitoring, security, and scalability considerations.