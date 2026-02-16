import express, { urlencoded } from 'express';
import cors from 'cors';
// import cookieParser from 'cookie-parser';
import { PORT } from './config/env.js';
import connectToDatabase from './database/mongodb.js';
// import bodyParser from 'body-parser';

import authRouter from './routes/auth.routes.js';
import adminRouter from './routes/admin.routes.js';
import errorMiddleware from './middleware/errorHandler.js';
import employerRouter from './routes/employers.routes.js';
import candidateRouter from './routes/candidate.routes.js';
import jobAlertRouter from './routes/jobAlert.routes.js';
import masterRoutes from './routes/master.routes.js';

import { sendPasswordResetEmail, sendWelcomeEmail, sendSuperadminAlertEmail } from './utils/mailer.js';

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';


// const express = require('express');
const app = express();


// CORS configuration for frontend and backend communication
// Allow requests from specific origins
const allowedOrigins = [
  'http://localhost:3000',                      // Local frontend
  'https://coimbatorejobs.in',         // versal frontend
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('CORS not allowed from this origin'), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // If you're using tokens or cookies
}));

// const body = bodyParser.json(urlencoded({ extended: true }));

// Security middleware (e.g., XSS protection)
// app.use(helmet());
// app.use(mongoSanitize());
app.use(express.json({ limit: '10kb' }));

// Serve static files
app.use(express.static('public'));

// Rate limiting
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 100,
//   standardHeaders: true,
//   legacyHeaders: false,
// });
// app.use('/api', limiter);

// middleware
app.use(express.json()); // for parsing application/json
app.use(urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
// app.use(cookieParser()); // for parsing cookies


app.use('/api/v1/auth', authRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/employer-dashboard', employerRouter);
app.use('/api/v1/candidate-dashboard', candidateRouter);
app.use('/api/v1/notification', jobAlertRouter);
app.use('/api/v1/master', masterRoutes);


// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// cassuing issue with 404
// // Handle 404
// app.use('*', (req, res) => {
//   res.status(404).json({
//     success: false,
//     message: `Route ${req.originalUrl} not found`
//   });
// });

app.get("/test-mail", async (req, res) => {
  await sendWelcomeEmail({ 
    recipient: "aravindakumar3315@gmail.com", 
    name: "Test User" 
  });

  await new Promise(r => setTimeout(r, 1500));

  await sendSuperadminAlertEmail({ 
    superadminEmail: 'saravind406@gmail.com',
    userEmail: "aravindakumar3315@gmail.com",
    userRole: "candidate",
    eventType: "new_registration"
  });

  res.send("Emails sent");
});


// common error handler middleware(global error handler)
app.use(errorMiddleware);


app.get('/', (req,res) => { res.json('Hello World!'); });


// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

app.listen(PORT, async() => {
  console.log(`Server is running on port http://localhost:${PORT}`);

  await connectToDatabase();

});
 

export default app;