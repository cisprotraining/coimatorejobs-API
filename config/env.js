import { config } from 'dotenv';

// config(options?:{ path: `.env.${process.env.NODE_ENV || 'development'}.local` });

// Decide which .env file to load based on NODE_ENV:
const envFile = process.env.NODE_ENV === 'production' ? '.env.production.local' : '.env.development.local';

// Load that file into process.env:
const results = config({ path:envFile});

// console.log(`Using environment file: ${envFile}`);

if (results.error){
    console.error(`Error loading environment variables from ${envFile}:`, results.error);
}

// export const { error } = config({ path: envFile });
// Pull out the values you need, with sensible defaults:
export const { PORT = '5000', NODE_ENV, DB_URI, JWT_SECRET, JWT_EXPIRES_IN, EMAIL_USER, EMAIL_PASS, SUPERADMIN_EMAIL, FRONTEND_URL, MAILTRAP_HOST, MAILTRAP_PORT, MAILTRAP_USER, MAILTRAP_PASS, THROTTLING_RETRY_DELAY_BASE = 1000 } = process.env;