import cors from 'cors';

const allowedOrigins = new Set([
  'http://localhost:3000',
  'https://coimbatorejobs.in',
]);

const handleCors = cors({
  origin: (origin, callback) => callback(null, Boolean(origin && allowedOrigins.has(origin))),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

export default function corsMiddleware(req, res, next) {
  // Include rejections and no-Origin responses in cache variation too.
  res.vary('Origin');
  const origin = req.get('Origin');
  if (origin !== undefined && !allowedOrigins.has(origin)) {
    return res.status(403).json({
      success: false,
      message: 'CORS not allowed from this origin',
    });
  }

  // Mobile clients, server requests and direct navigation can omit Origin.
  // They still pass through each route's authentication and authorization.
  return handleCors(req, res, next);
}
