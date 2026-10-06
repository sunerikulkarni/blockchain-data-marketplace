// server.js
// Entry point — sets up Express, connects to MongoDB, mounts routes.

// Always load backend/.env regardless of CWD the server is started from.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express    = require('express');
const cors       = require('cors');
const connectDB  = require('./config/db');
const dataRoutes = require('./Routes/dataRoutes');
const txnRoutes = require('./Routes/transactionRoutes');
const companyRoutes = require('./Routes/companyRoutes');
const accessRequestRoutes = require('./Routes/accessRequestRoutes');
const member3Routes = require('./Routes/member3Routes');
const chainRoutes = require('./Routes/chainRoutes');
// ── Connect to MongoDB ───────────────────────────────────────
connectDB();

// ── Express app ──────────────────────────────────────────────
const app = express();

// ── Middleware ───────────────────────────────────────────────

// CORS — allow requests from your frontend
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-wallet-address'],
}));

// Parse JSON bodies
app.use(express.json({ limit: '8mb' }));

// ── Health check ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'DataChain API is running',
    version: '1.0.0',
    endpoints: {
      data:         '/getData  /addData  /updateData/:id  /deleteData/:id  /categories',
      transactions: '/buyData  /transactions  /transactions/stats',
      ipfs:         '/upload  /verify/:datasetId  /ipfs/:cid',
      chain:        '/chain/datasets  /chain/access-requests  /chain/purchases  /chain/health',
    },
  });
});

// ── Routes ───────────────────────────────────────────────────
// ── Routes ───────────────────────────────────────────────────
app.use('/', dataRoutes);
app.use('/', txnRoutes);

app.use('/', companyRoutes);
app.use('/', accessRequestRoutes);
app.use('/', member3Routes);
app.use('/', chainRoutes);
// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ── Start server ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
