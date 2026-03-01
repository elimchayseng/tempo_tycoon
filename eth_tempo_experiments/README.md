# Tempo Explorer

A web application for learning Tempo blockchain mechanics through real-time interaction logs. The application demonstrates key Tempo features including native fee sponsorship, memo-enabled transfers, and dedicated payment lanes.

## Overview

Tempo Explorer provides a two-panel interface where users can trigger blockchain actions and observe the underlying mechanics in real-time. The left panel contains action buttons for common operations like account setup, payments, and batch transactions. The right panel displays a detailed log of every RPC call, contract interaction, and transaction receipt with educational annotations explaining Tempo-specific features.

## Key Features

- **Account Management**: Generate and fund test accounts on Tempo Moderato testnet
- **Payment Operations**: Send payments with memos using TIP-20 tokens
- **Fee Sponsorship**: Demonstrate native fee sponsorship where third parties pay transaction fees
- **Batch Transactions**: Execute multiple payments atomically in a single transaction
- **Transaction History**: Query and display payment history with memo filtering
- **Real-time Logging**: Live stream of all blockchain interactions with educational context

## Technology Stack

- **Backend**: TypeScript, Hono web framework, Node.js
- **Frontend**: React 19, Vite build tool, Tailwind CSS
- **Blockchain**: Viem client library with Tempo extensions
- **Network**: Tempo Moderato Testnet (Chain ID 42431)
- **Deployment**: Railway platform

## Architecture

The application uses an instrumented client architecture that wraps the viem blockchain client to intercept and log all operations. WebSocket connections stream real-time updates to the frontend, providing immediate feedback on transaction states and blockchain interactions.

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm or yarn package manager

### Installation

```bash
# Clone the repository
git clone https://github.com/elimchayseng/eth_tempo_experiments.git
cd eth_tempo_experiments

# Install dependencies
npm install

# Run type checking
npm run check
```

### Development

```bash
# Start both frontend and backend in development mode
npm run dev

# Or run them separately:
npm run dev:server  # Backend on port 4000
npm run dev:web     # Frontend on port 5173
```

### Production Build

```bash
# Build the frontend for production
npm run build
```

## Usage

1. **Setup Accounts**: Click "Setup Accounts" to generate test wallets and request testnet funds
2. **Check Balances**: Verify account balances using the TIP-20 contract
3. **Send Payments**: Transfer tokens between accounts with optional memos
4. **Fee Sponsorship**: Experience sponsored transactions where fees are paid by a third party
5. **Batch Operations**: Execute multiple payments in a single atomic transaction
6. **View History**: Query transaction history filtered by account and memo content

## API Endpoints

- `GET /api/health` - Application health check
- `GET /api/health/blockchain` - Blockchain connectivity status
- `GET /api/accounts` - Current account states
- `POST /api/setup` - Initialize and fund test accounts
- `POST /api/balance` - Refresh account balances
- `POST /api/send` - Send payment with self-paid fees
- `POST /api/send-sponsored` - Send payment with sponsored fees
- `POST /api/batch` - Execute batch payments
- `POST /api/history` - Query transaction history

## Configuration

The application supports environment-based configuration:

- `PORT` - Server port (default: 4000)
- `NODE_ENV` - Environment mode (development/production)
- `RPC_URL` - Custom Tempo RPC endpoint
- `EXPLORER_URL` - Custom block explorer URL
- `ENABLE_REQUEST_LOGS` - Request logging toggle

## Deployment

The application is configured for deployment on Railway with automatic health checks and proper containerized networking. The main branch deploys automatically to the production environment.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and type checking
5. Submit a pull request

## License

This project is for educational and demonstration purposes.
