// server.js
// Entry point — sets up Express, connects to MongoDB, mounts routes.

require('dotenv').config();          // Load .env variables first
const express    = require('express');
const cors       = require('cors');
const connectDB  = require('./config/db');
const dataRoutes = require('./routes/dataRoutes');
const txnRoutes  = require('./routes/transactionRoutes');

// ── Connect to MongoDB ───────────────────────────────────────
connectDB();

// ── Express app ──────────────────────────────────────────────
const app = express();

// ── Middleware ───────────────────────────────────────────────

// CORS — allow requests from your frontend
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Parse JSON bodies
app.use(express.json({ limit: '1mb' }));

// ── Health check ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'DataChain API is running',
    version: '1.0.0',
    endpoints: {
      data:         '/getData  /addData  /updateData/:id  /deleteData/:id  /categories',
      transactions: '/buyData  /transactions  /transactions/stats',
    },
  });
});

// ── Routes ───────────────────────────────────────────────────
app.use('/', dataRoutes);   // dataset CRUD
app.use('/', txnRoutes);    // buy & transaction history

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
